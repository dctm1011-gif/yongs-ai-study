import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Phase {
  id: string;
  name: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed';
  description?: string;
}

export interface TabProgress {
  english: number;
  toefl: number;
  papers: number;
  investment: number;
}

export interface ProgressData {
  phases: Phase[];
  lastSync: string;
  buildTime?: string;
  tabProgress?: TabProgress;
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

  // Fetch other tabs progress data locally
  const fetchTabProgress = useCallback(async (): Promise<TabProgress> => {
    try {
      const [englishData, toeflData, papersData] = await Promise.all([
        AsyncStorage.getItem('english_words'),
        AsyncStorage.getItem('toefl_sections'),
        AsyncStorage.getItem('papers_list'),
      ]);

      let english = 0;
      let toefl = 0;
      let papers = 0;
      let investment = 0;

      // Calculate English progress (read/total words)
      if (englishData) {
        try {
          const words = JSON.parse(englishData);
          if (Array.isArray(words)) {
            const readCount = words.filter((w: any) => w.isRead).length;
            english = words.length > 0 ? Math.round((readCount / words.length) * 100) : 0;
          }
        } catch (e) {
          console.error('[useProgressSync] English parse error:', e);
        }
      }

      // Calculate TOEFL progress
      if (toeflData) {
        try {
          const sections = JSON.parse(toeflData);
          if (Array.isArray(sections)) {
            toefl = sections.length > 0 ? Math.round((sections.filter((s: any) => s.completed).length / sections.length) * 100) : 0;
          }
        } catch (e) {
          console.error('[useProgressSync] TOEFL parse error:', e);
        }
      }

      // Calculate Papers progress
      if (papersData) {
        try {
          const papersList = JSON.parse(papersData);
          if (Array.isArray(papersList)) {
            papers = papersList.length > 0 ? Math.min(Math.round((papersList.filter((p: any) => p.read).length / Math.min(5, papersList.length)) * 100), 100) : 0;
          }
        } catch (e) {
          console.error('[useProgressSync] Papers parse error:', e);
        }
      }

      return { english, toefl, papers, investment };
    } catch (err) {
      console.error('[useProgressSync] Tab progress calculation error:', err);
      return { english: 0, toefl: 0, papers: 0, investment: 0 };
    }
  }, []);

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
        // Fetch and merge tab progress
        const tabProgress = await fetchTabProgress();
        const enrichedData = {
          ...data,
          tabProgress,
        };

        setProgressData(enrichedData);
        await AsyncStorage.setItem(PROGRESS_SYNC_KEY, JSON.stringify(enrichedData));
        setLastSyncTime(new Date());
        retryCountRef.current = 0;
        console.log('[useProgressSync] Successfully fetched progress data with tab progress');
        return enrichedData;
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
  }, [fetchTabProgress]);

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
