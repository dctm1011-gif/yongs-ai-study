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

export interface Notification {
  id: string;
  type: 'phase_complete' | 'sync_update' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface ProgressData {
  phases: Phase[];
  lastSync: string;
  buildTime?: string;
  tabProgress?: TabProgress;
}

const PROGRESS_SYNC_KEY = 'yongstudy_progress';
const SYNC_INTERVAL = 60 * 1000; // 1 minute (was 5 minutes) - real-time sync
const BACKEND_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app/api/get-progress';
const TAB_DATA_CHANGE_LISTENERS = new Map<string, Date>(); // Track when tabs change

export function useProgressSync() {
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const prevPhaseStateRef = useRef<Record<string, number>>({});
  const MAX_RETRIES = 3;

  // Add notification
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif_${Date.now()}`,
      timestamp: new Date(),
    };
    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
    console.log('[useProgressSync] Notification added:', newNotification.title);
  }, []);

  // Check for phase completion
  const checkPhaseChanges = useCallback((phases: Phase[]) => {
    phases.forEach(phase => {
      const prevProgress = prevPhaseStateRef.current[phase.id] ?? 0;
      const currentProgress = phase.progress;

      // Phase completed
      if (prevProgress < 100 && currentProgress === 100) {
        addNotification({
          type: 'phase_complete',
          title: `Phase ${phase.id} Complete!`,
          message: `${phase.name} has been completed successfully!`,
          read: false,
        });
      }

      // Significant progress milestone (25%, 50%, 75%)
      const milestones = [25, 50, 75];
      milestones.forEach(milestone => {
        if (prevProgress < milestone && currentProgress >= milestone) {
          addNotification({
            type: 'sync_update',
            title: `Phase ${phase.id} - ${milestone}% Complete`,
            message: `Progress on ${phase.name} reached ${milestone}%`,
            read: false,
          });
        }
      });

      prevPhaseStateRef.current[phase.id] = currentProgress;
    });
  }, [addNotification]);

  // Fetch other tabs progress data locally with change detection
  const fetchTabProgress = useCallback(async (): Promise<TabProgress> => {
    try {
      const [englishData, toeflData, papersData, investmentData] = await Promise.all([
        AsyncStorage.getItem('english_words'),
        AsyncStorage.getItem('toefl_sections'),
        AsyncStorage.getItem('papers_list'),
        AsyncStorage.getItem('investment_data'),
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
            // Track English data change
            const englishHash = JSON.stringify(words).length;
            TAB_DATA_CHANGE_LISTENERS.set('english', new Date());
            console.log(`[useProgressSync] English: ${english}% (${readCount}/${words.length} words)`);
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
            const completedCount = sections.filter((s: any) => s.completed).length;
            toefl = sections.length > 0 ? Math.round((completedCount / sections.length) * 100) : 0;
            TAB_DATA_CHANGE_LISTENERS.set('toefl', new Date());
            console.log(`[useProgressSync] TOEFL: ${toefl}% (${completedCount}/${sections.length} sections)`);
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
            const readCount = papersList.filter((p: any) => p.read).length;
            papers = papersList.length > 0 ? Math.min(Math.round((readCount / Math.min(5, papersList.length)) * 100), 100) : 0;
            TAB_DATA_CHANGE_LISTENERS.set('papers', new Date());
            console.log(`[useProgressSync] Papers: ${papers}% (${readCount}/${Math.min(5, papersList.length)} papers)`);
          }
        } catch (e) {
          console.error('[useProgressSync] Papers parse error:', e);
        }
      }

      // Calculate Investment progress
      if (investmentData) {
        try {
          const investmentList = JSON.parse(investmentData);
          if (Array.isArray(investmentList) && investmentList.length > 0) {
            const followingCount = investmentList.filter((i: any) => i.following).length;
            investment = Math.round((followingCount / investmentList.length) * 100);
            TAB_DATA_CHANGE_LISTENERS.set('investment', new Date());
            console.log(`[useProgressSync] Investment: ${investment}% (${followingCount}/${investmentList.length} following)`);
          }
        } catch (e) {
          console.error('[useProgressSync] Investment parse error:', e);
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

        // Check for phase changes and generate notifications
        checkPhaseChanges(data.phases);

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
  }, [fetchTabProgress, checkPhaseChanges]);

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

  // Watch for tab data changes and trigger immediate sync
  const watchTabChanges = useCallback(async () => {
    try {
      const [englishData, toeflData, papersData, investmentData] = await Promise.all([
        AsyncStorage.getItem('english_words'),
        AsyncStorage.getItem('toefl_sections'),
        AsyncStorage.getItem('papers_list'),
        AsyncStorage.getItem('investment_data'),
      ]);

      // Check if any tab data has changed recently
      const tabDatas = [
        { key: 'english', data: englishData },
        { key: 'toefl', data: toeflData },
        { key: 'papers', data: papersData },
        { key: 'investment', data: investmentData },
      ];

      const hasRecentChanges = tabDatas.some(({ key, data }) => {
        const lastUpdate = TAB_DATA_CHANGE_LISTENERS.get(key);
        return data && lastUpdate && (Date.now() - lastUpdate.getTime()) < 60000; // < 1 minute
      });

      if (hasRecentChanges) {
        console.log('[useProgressSync] Tab data change detected, triggering immediate sync');
        await fetchProgress();
      }
    } catch (err) {
      console.warn('[useProgressSync] Tab change detection error:', err);
    }
  }, [fetchProgress]);

  // Setup periodic sync (every 1 minute for real-time updates)
  useEffect(() => {
    // Initial watch
    watchTabChanges();

    // Periodic sync every 1 minute
    syncIntervalRef.current = setInterval(() => {
      console.log('[useProgressSync] Performing periodic sync (1min interval)');
      watchTabChanges();
    }, SYNC_INTERVAL);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [fetchProgress, watchTabChanges]);

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
    notifications,
    unreadCount,
    addNotification,
  };
}
