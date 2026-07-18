import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncSource {
  name: string;
  apiEndpoint: string;
  lastSyncTime: string | null;
  status: 'synced' | 'syncing' | 'failed' | 'pending';
  errorMessage?: string;
  checksumLocal?: string;
  checksumServer?: string;
  itemCount: number;
}

export interface SyncMonitorReport {
  timestamp: string;
  sources: Record<string, SyncSource>;
  overallStatus: 'success' | 'partial' | 'failed';
  successCount: number;
  failureCount: number;
  averageSyncTime: number;
  queueSize: number;
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

  // Fetch and validate data from API endpoint
  const checkDataSource = useCallback(
    async (source: typeof SYNC_SOURCES[0]): Promise<SyncSource> => {
      const startTime = Date.now();
      const storedKey = `sync_${source.name.toLowerCase()}`;

      try {
        // Attempt to fetch from server
        const response = await fetch(`${NETLIFY_BASE_URL}${source.endpoint}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const serverData = await response.json();
        const checksumServer = calculateChecksum(serverData);

        // Get local data
        const localDataStr = await AsyncStorage.getItem(storedKey);
        const localData = localDataStr ? JSON.parse(localDataStr) : null;
        const checksumLocal = localData ? calculateChecksum(localData) : 'no_local_data';

        // Compare checksums
        const isValid = checksumLocal === checksumServer || !localData;

        // Update sync record
        const lastSyncTime = new Date().toISOString();
        const syncRecord = {
          name: source.name,
          apiEndpoint: source.endpoint,
          lastSyncTime,
          status: isValid ? 'synced' : 'failed',
          checksumLocal,
          checksumServer,
          itemCount: Array.isArray(serverData) ? serverData.length : Object.keys(serverData || {}).length,
        };

        // Store sync time
        await AsyncStorage.setItem(`${storedKey}_lastSync`, lastSyncTime);
        await AsyncStorage.setItem(`${storedKey}_checksum`, checksumServer);

        return syncRecord;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const lastSync = await AsyncStorage.getItem(`${storedKey}_lastSync`);

        return {
          name: source.name,
          apiEndpoint: source.endpoint,
          lastSyncTime: lastSync,
          status: 'failed',
          errorMessage: errorMsg,
          itemCount: 0,
        };
      }
    },
    []
  );

  // Run sync check on all data sources
  const runSyncCheck = useCallback(async () => {
    setIsMonitoring(true);
    const startTime = Date.now();

    try {
      const syncResults: Record<string, SyncSource> = {};
      let successCount = 0;
      let failureCount = 0;

      // Check all sources in parallel
      const promises = SYNC_SOURCES.map((source) => checkDataSource(source));
      const results = await Promise.all(promises);

      results.forEach((result) => {
        syncResults[result.name] = result;
        if (result.status === 'synced') {
          successCount++;
        } else {
          failureCount++;
        }
      });

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
  };
}
