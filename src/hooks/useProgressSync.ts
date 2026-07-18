import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Phase {
  id: string;
  name: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed';
  description?: string;
}

export interface ProgressData {
  phases: Phase[];
  lastSync: string;
  buildTime?: string;
}

const PROGRESS_SYNC_KEY = 'yongstudy_progress';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BACKEND_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app/api/get-progress';

export function useProgressSync() {
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  // Fetch progress data from backend
  const fetchProgress = useCallback(async (retryCount = 0) => {
    try {
      setError(null);
      const response = await fetch(BACKEND_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.phases) {
        setProgressData(data);
        await AsyncStorage.setItem(PROGRESS_SYNC_KEY, JSON.stringify(data));
        setLastSyncTime(new Date());
        retryCountRef.current = 0;
        console.log('[useProgressSync] Successfully fetched progress data');
        return data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useProgressSync] Fetch failed:', errorMsg);
      setError(errorMsg);

      // Retry logic
      if (retryCount < MAX_RETRIES) {
        retryCountRef.current = retryCount + 1;
        console.log(`[useProgressSync] Retry attempt ${retryCount + 1}/${MAX_RETRIES}`);
        // Exponential backoff: 1s, 2s, 4s
        const backoffDelay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => fetchProgress(retryCount + 1), backoffDelay);
      } else {
        console.error('[useProgressSync] Max retries reached, using cached data');
        // Load from cache
        await loadFromCache();
      }
    }
  }, []);

  // Load progress from cache
  const loadFromCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(PROGRESS_SYNC_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        setProgressData(data);
        console.log('[useProgressSync] Loaded from cache');
      } else {
        // Use default data if no cache
        setProgressData({
          phases: [
            {
              id: 'A',
              name: 'Play + Progress + Sync',
              progress: 85,
              status: 'in-progress',
            },
            {
              id: 'B',
              name: 'Error Logging + Monitoring',
              progress: 0,
              status: 'pending',
            },
            { id: 'C', name: 'Performance < 500ms', progress: 0, status: 'pending' },
            { id: 'D', name: 'Investment Tab', progress: 0, status: 'pending' },
            { id: 'E', name: 'Data Sync Monitoring', progress: 0, status: 'pending' },
            { id: 'F', name: 'Security & Review', progress: 0, status: 'pending' },
          ],
          lastSync: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('[useProgressSync] Cache load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFromCache();
    fetchProgress()
      .catch(err => console.error('[useProgressSync] Initial fetch failed:', err))
      .finally(() => setLoading(false));
  }, []);

  // Setup periodic sync (every 5 minutes)
  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      console.log('[useProgressSync] Performing periodic sync');
      fetchProgress();
    }, SYNC_INTERVAL);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [fetchProgress]);

  // Manually trigger sync
  const sync = useCallback(() => {
    console.log('[useProgressSync] Manual sync triggered');
    return fetchProgress();
  }, [fetchProgress]);

  // Get status emoji for display
  const getStatusEmoji = useCallback((status: string) => {
    switch (status) {
      case 'completed':
        return '🟢';
      case 'in-progress':
        return '🔴';
      default:
        return '⚪';
    }
  }, []);

  return {
    progressData,
    loading,
    error,
    lastSyncTime,
    sync,
    getStatusEmoji,
  };
}
