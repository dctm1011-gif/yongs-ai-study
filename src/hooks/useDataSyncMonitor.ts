import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, ToastAndroid, Platform } from 'react-native';

export interface SyncSource {
  name: string;
  apiEndpoint: string;
  lastSyncTime: string | null;
  status: 'synced' | 'syncing' | 'failed' | 'pending';
  errorMessage?: string;
  checksumLocal?: string;
  checksumServer?: string;
  itemCount: number;
  version: number;
  lastVersionCheck?: string;
}

export interface SyncMonitorReport {
  timestamp: string;
  sources: Record<string, SyncSource>;
  overallStatus: 'success' | 'partial' | 'failed';
  successCount: number;
  failureCount: number;
  averageSyncTime: number;
  queueSize: number;
  syncFailureCount: number;
  versionConflicts: Array<{ source: string; serverVersion: number; localVersion: number }>;
}

interface VersionConflict {
  source: string;
  serverVersion: number;
  localVersion: number;
  timestamp: string;
}

interface SyncMetrics {
  lastCheck: string;
  checksumCache: Record<string, string>;
}

const SYNC_SOURCES = [
  { name: 'English', endpoint: '/api/english-daily' },
  { name: 'TOEFL', endpoint: '/api/toefl-daily' },
  { name: 'Papers', endpoint: '/api/papers-daily' },
  { name: 'Investment', endpoint: '/api/investment-daily' },
  { name: 'Trends', endpoint: '/api/trends-daily' },
];

const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';

export function useDataSyncMonitor() {
  const [report, setReport] = useState<SyncMonitorReport | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [metrics, setMetrics] = useState<SyncMetrics>({ lastCheck: '', checksumCache: {} });
  const [failureNotificationShown, setFailureNotificationShown] = useState<Set<string>>(new Set());

  // Calculate simple checksum using string hashing
  const calculateChecksum = (data: any): string => {
    try {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return `chk_${Math.abs(hash).toString(36)}`;
    } catch {
      return `chk_error_${Date.now()}`;
    }
  };

  // Show notification for sync failure (once per source)
  const showSyncFailureNotification = useCallback((sourceName: string, error: string) => {
    if (failureNotificationShown.has(sourceName)) {
      return; // Already shown, skip
    }

    const message = `${sourceName} 동기화 실패: ${error}`;

    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
    } else {
      // iOS uses Alert
      console.warn(`Sync Failure: ${message}`);
    }

    // Mark as shown
    setFailureNotificationShown(prev => new Set([...prev, sourceName]));
  }, [failureNotificationShown]);

  // Fetch and validate data from API endpoint
  const checkDataSource = useCallback(
    async (source: typeof SYNC_SOURCES[0]): Promise<SyncSource> => {
      const startTime = Date.now();
      const storedKey = `sync_${source.name.toLowerCase()}`;
      const versionKey = `${storedKey}_version`;

      try {
        // Attempt to fetch from server
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${NETLIFY_BASE_URL}${source.endpoint}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const serverData = await response.json();
        const checksumServer = calculateChecksum(serverData);
        const serverVersion = serverData.version || 1;

        // Get local data
        const localDataStr = await AsyncStorage.getItem(storedKey);
        const localData = localDataStr ? JSON.parse(localDataStr) : null;
        const checksumLocal = localData ? calculateChecksum(localData) : 'no_local_data';
        const localVersionStr = await AsyncStorage.getItem(versionKey);
        const localVersion = localVersionStr ? parseInt(localVersionStr, 10) : 0;

        // Compare versions
        let isValid = checksumLocal === checksumServer || !localData;
        let versionConflict = false;

        if (serverVersion > localVersion && localData) {
          // Server has newer version: backup local and pull
          await AsyncStorage.setItem(
            `conflict_backup_${source.name}_${Date.now()}`,
            JSON.stringify(localData)
          );
          console.log(`Version conflict for ${source.name}: backing up local v${localVersion}`);
          versionConflict = true;
        } else if (localVersion > serverVersion && localData) {
          // Local has newer version: store for manual review
          await AsyncStorage.setItem(
            `version_conflict_${source.name}`,
            JSON.stringify({
              serverVersion,
              localVersion,
              timestamp: new Date().toISOString(),
            })
          );
          isValid = false;
          versionConflict = true;
          console.warn(`Version conflict for ${source.name}: local v${localVersion} > server v${serverVersion}`);
        }

        // Update sync record
        const lastSyncTime = new Date().toISOString();
        const syncRecord: SyncSource = {
          name: source.name,
          apiEndpoint: source.endpoint,
          lastSyncTime,
          status: isValid ? 'synced' : 'failed',
          checksumLocal,
          checksumServer,
          itemCount: Array.isArray(serverData) ? serverData.length : Object.keys(serverData || {}).length,
          version: serverVersion,
          lastVersionCheck: lastSyncTime,
        };

        // Store sync time, checksum, and version
        await AsyncStorage.setItem(`${storedKey}_lastSync`, lastSyncTime);
        await AsyncStorage.setItem(`${storedKey}_checksum`, checksumServer);
        await AsyncStorage.setItem(versionKey, serverVersion.toString());

        // Log version conflicts
        if (versionConflict) {
          const existingLogStr = await AsyncStorage.getItem('version_conflict_log');
          const existingLog = existingLogStr ? JSON.parse(existingLogStr) : {};

          await AsyncStorage.setItem(
            'version_conflict_log',
            JSON.stringify({
              ...existingLog,
              [source.name]: {
                serverVersion,
                localVersion,
                timestamp: lastSyncTime,
              },
            })
          );
        }

        return syncRecord;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const lastSync = await AsyncStorage.getItem(`${storedKey}_lastSync`);

        // Show notification for failure
        showSyncFailureNotification(source.name, errorMsg);

        return {
          name: source.name,
          apiEndpoint: source.endpoint,
          lastSyncTime: lastSync,
          status: 'failed',
          errorMessage: errorMsg,
          itemCount: 0,
          version: 0,
          lastVersionCheck: new Date().toISOString(),
        };
      }
    },
    [showSyncFailureNotification]
  );

  // Run sync check on all data sources
  const runSyncCheck = useCallback(async () => {
    setIsMonitoring(true);
    const startTime = Date.now();

    try {
      const syncResults: Record<string, SyncSource> = {};
      let successCount = 0;
      let failureCount = 0;
      const versionConflicts: Array<{ source: string; serverVersion: number; localVersion: number }> = [];

      // Check all sources in parallel
      const promises = SYNC_SOURCES.map((source) => checkDataSource(source));
      const results = await Promise.all(promises);

      for (const result of results) {
        syncResults[result.name] = result;
        if (result.status === 'synced') {
          successCount++;
        } else {
          failureCount++;
        }

        // Check for version conflicts
        const versionConflictStr = await AsyncStorage.getItem(`version_conflict_${result.name}`);
        if (versionConflictStr) {
          try {
            const conflict = JSON.parse(versionConflictStr);
            versionConflicts.push({
              source: result.name,
              serverVersion: conflict.serverVersion,
              localVersion: conflict.localVersion,
            });
          } catch (e) {
            console.error('Error parsing version conflict:', e);
          }
        }
      }

      // Get queue size
      const queueStr = await AsyncStorage.getItem('sync_queue');
      const queue = queueStr ? JSON.parse(queueStr) : [];
      const queueSize = Array.isArray(queue) ? queue.length : 0;

      // Calculate average sync time
      const syncTimes = results
        .filter((r) => r.lastSyncTime)
        .map((r) => {
          const lastSync = new Date(r.lastSyncTime || '').getTime();
          return Date.now() - lastSync;
        });
      const averageSyncTime =
        syncTimes.length > 0 ? Math.round(syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length) : 0;

      const syncReport: SyncMonitorReport = {
        timestamp: new Date().toISOString(),
        sources: syncResults,
        overallStatus: failureCount === 0 ? 'success' : failureCount < successCount ? 'partial' : 'failed',
        successCount,
        failureCount,
        averageSyncTime,
        queueSize,
        syncFailureCount: failureCount,
        versionConflicts,
      };

      // Store report to AsyncStorage
      await AsyncStorage.setItem('lastSyncReport', JSON.stringify(syncReport));

      // Update metrics
      setMetrics({
        lastCheck: new Date().toISOString(),
        checksumCache: Object.fromEntries(
          results
            .filter((r) => r.checksumServer)
            .map((r) => [r.name, r.checksumServer || ''])
        ),
      });

      setReport(syncReport);

      // Log to server
      await fetch(`${NETLIFY_BASE_URL}/api/sync-monitor-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncReport),
      }).catch(() => {
        console.log('Failed to log sync report to server');
      });

      return syncReport;
    } catch (error) {
      console.error('Sync check failed:', error);
      return null;
    } finally {
      setIsMonitoring(false);
    }
  }, [checkDataSource]);

  // Auto-sync every 6 hours
  useEffect(() => {
    // Run initial check
    runSyncCheck();

    // Set up interval for 6-hour checks
    const intervalId = setInterval(() => {
      runSyncCheck();
    }, 6 * 60 * 60 * 1000); // 6 hours

    return () => clearInterval(intervalId);
  }, [runSyncCheck]);

  // Load last report on mount
  useEffect(() => {
    const loadLastReport = async () => {
      try {
        const lastReportStr = await AsyncStorage.getItem('lastSyncReport');
        if (lastReportStr) {
          setReport(JSON.parse(lastReportStr));
        }
      } catch (error) {
        console.error('Failed to load last sync report:', error);
      }
    };

    loadLastReport();
  }, []);

  return {
    report,
    isMonitoring,
    runSyncCheck,
    metrics,
    syncFailureCount: report?.syncFailureCount || 0,
    versionConflicts: report?.versionConflicts || [],
  };
}
