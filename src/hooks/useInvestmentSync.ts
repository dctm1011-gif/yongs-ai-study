import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface InvestmentColumn {
  id: string;
  title: string;
  category: 'real-estate' | 'stocks';
  author: string;
  authorTitle: string;
  date: string;
  content: string;
  summary: string;
  region?: string;
  ticker?: string;
  analysis: string;
  outlook: 'positive' | 'neutral' | 'negative';
  readTime: number;
}

export interface InvestmentReport {
  columns?: InvestmentColumn[]; // Legacy property name
  properties?: InvestmentColumn[]; // API response uses this
  timestamp: string;
  lastUpdated?: string;
}

const CACHE_KEY = 'investment_columns_data';
const BOOKMARKS_KEY = 'investment_bookmarks';
const LAST_SYNC_KEY = 'investment_last_sync';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://illustrious-cuchufli-7c4e58.netlify.app';

// Request deduplication
let pendingSyncRequest: Promise<InvestmentReport | null> | null = null;

// Batch AsyncStorage operations
async function batchAsyncStorageRead(keys: string[]): Promise<Record<string, any>> {
  const results = await AsyncStorage.multiGet(keys);
  const data: Record<string, any> = {};
  results.forEach(([key, value]) => {
    if (value) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  });
  return data;
}

async function batchAsyncStorageWrite(data: Record<string, any>): Promise<void> {
  const entries = Object.entries(data).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : JSON.stringify(value),
  ]);
  await AsyncStorage.multiSet(entries as [string, string][]);
}

export function useInvestmentSync() {
  const [columns, setColumns] = useState<InvestmentColumn[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const syncTimeoutRef = useRef<any>(undefined);
  const netInfoUnsubscribeRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize bookmarks with defaults
  const initializeBookmarks = useCallback(async (): Promise<string[]> => {
    try {
      const saved = await AsyncStorage.getItem(BOOKMARKS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('[useInvestmentSync] Error loading bookmarks:', err);
    }

    const defaults: string[] = [];

    try {
      await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(defaults));
    } catch (err) {
      console.error('[useInvestmentSync] Error saving default bookmarks:', err);
    }

    return defaults;
  }, []);

  // Initialize data on mount (batch load)
  const initializeData = useCallback(async () => {
    try {
      const data = await batchAsyncStorageRead([
        CACHE_KEY,
        BOOKMARKS_KEY,
        LAST_SYNC_KEY,
      ]);

      const bookmarks = data[BOOKMARKS_KEY] || [];
      if (bookmarks && Array.isArray(bookmarks)) {
        setBookmarks(bookmarks);
      }

      // Restore cached columns if available
      const cached = data[CACHE_KEY];
      if (cached && cached.columns) {
        setColumns(cached.columns);
      }

      const syncTime = data[LAST_SYNC_KEY];
      if (syncTime) {
        setLastSyncTime(new Date(syncTime));
      }
    } catch (err) {
      console.error('[useInvestmentSync] Error initializing data:', err);
    }
  }, []);

  // Fetch from backend via Netlify proxy with optional full trend data
  const fetchFromBackend = useCallback(
    async (fullTrend = false): Promise<InvestmentReport | null> => {
      try {
        // Create new abort controller for this request
        abortControllerRef.current = new AbortController();

        const url = `${API_BASE_URL}/api/investment/daily-report${
          fullTrend ? '?full=true' : ''
        }`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorMsg = `동기화 실패: 서버 오류 (${response.status})`;
          console.warn(`[useInvestmentSync] Backend returned ${response.status}`);
          setError(errorMsg);
          return null;
        }

        const data = await response.json();
        // API returns "properties" but we need to normalize to "columns" for component compatibility
        if (data.properties && Array.isArray(data.properties)) {
          return {
            ...data,
            columns: data.properties, // Normalize property key
          };
        }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') {
          console.log('[useInvestmentSync] Request cancelled');
        } else {
          console.error('[useInvestmentSync] Failed to fetch from backend:', err);
        }
      }

      return null;
    },
    []
  );

  // Load and sync data with request deduplication
  const syncData = useCallback(
    async (forceRefresh = false) => {
      try {
        // Request deduplication - if sync already in progress, wait for it
        if (pendingSyncRequest && !forceRefresh) {
          const report = await pendingSyncRequest;
          if (report?.columns) {
            setColumns(report.columns);
            setLastSyncTime(new Date());
          }
          return;
        }

        setLoading(true);
        setError(null);

        // Check cache first (unless forced refresh)
        if (!forceRefresh) {
          const cached = await AsyncStorage.getItem(CACHE_KEY);
          const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);

          if (cached && lastSync) {
            const syncTime = new Date(lastSync);
            const now = new Date();

            if (now.getTime() - syncTime.getTime() < CACHE_DURATION) {
              console.log('[useInvestmentSync] Using cached data');
              const cachedData = JSON.parse(cached) as InvestmentReport;
              setColumns(cachedData.columns);
              setLastSyncTime(syncTime);
              setLoading(false);
              return;
            }
          }
        }

        // Try to fetch from backend (lite version for list view)
        if (isOnline) {
          const fetchPromise = fetchFromBackend(false); // false = no full trend data initially
          pendingSyncRequest = fetchPromise;

          const report = await fetchPromise;
          pendingSyncRequest = null;

          if (report) {
            const now = new Date().toISOString();
            // Batch write to AsyncStorage
            await batchAsyncStorageWrite({
              [CACHE_KEY]: report,
              [LAST_SYNC_KEY]: now,
            });

            setColumns(report.columns || []);
            setLastSyncTime(new Date());
            setLoading(false);
            return;
          }
        }

        // Fallback to cache
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          console.log('[useInvestmentSync] Falling back to cached data');
          const cachedData = JSON.parse(cached) as InvestmentReport;
          setColumns(cachedData.columns || []);
          setLastSyncTime(new Date(cachedData.timestamp || new Date().toISOString()));
          setError('오프라인 상태 또는 네트워크 오류 - 캐시된 데이터 표시');
        } else {
          console.log('[useInvestmentSync] No cached data available');
          setColumns([]);
          setError('동기화 실패: 캐시된 데이터 없음');
        }

        setLoading(false);
      } catch (err) {
        pendingSyncRequest = null;
        console.error('[useInvestmentSync] Sync error:', err);
        setError(err instanceof Error ? err.message : 'Failed to sync data');
        setLoading(false);

        // Fallback to cache
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const cachedData = JSON.parse(cached) as InvestmentReport;
          setColumns(cachedData.columns || []);
        }
      }
    },
    [isOnline, fetchFromBackend]
  );

  // Toggle bookmark
  const toggleBookmark = useCallback(
    async (columnId: string) => {
      try {
        const current = bookmarks || [];
        const updated = new Set(current);

        if (updated.has(columnId)) {
          updated.delete(columnId);
        } else {
          updated.add(columnId);
        }

        const updatedArray = Array.from(updated);

        // Batch write bookmarks and sync immediately
        await batchAsyncStorageWrite({
          [BOOKMARKS_KEY]: updatedArray,
        });

        setBookmarks(updatedArray);

        // Notify backend (non-blocking, with timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        fetch(`${API_BASE_URL}/api/investment/bookmarks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            columnId,
            isBookmarked: updated.has(columnId),
          }),
          signal: controller.signal,
        })
          .catch(err =>
            console.warn('[useInvestmentSync] Failed to sync bookmark:', err)
          )
          .finally(() => clearTimeout(timeoutId));

        return updated.has(columnId);
      } catch (err) {
        console.error('[useInvestmentSync] Error toggling bookmark:', err);
        return false;
      }
    },
    [bookmarks]
  );

  // Setup network listener (optional - NetInfo may not be installed)
  useEffect(() => {
    try {
      const NetInfo = require('@react-native-community/netinfo').default;
      const unsubscribe = NetInfo.addEventListener((state: any) => {
        const online = state.isConnected ?? false;
        setIsOnline(online);
        console.log(
          '[useInvestmentSync] Network status:',
          online ? 'online' : 'offline'
        );

        // Sync when coming back online
        if (online) {
          syncData(true);
        }
      });

      netInfoUnsubscribeRef.current = unsubscribe;

      return () => {
        if (netInfoUnsubscribeRef.current) {
          netInfoUnsubscribeRef.current();
        }
      };
    } catch (err) {
      console.warn(
        '[useInvestmentSync] NetInfo not available, network monitoring disabled'
      );
      setIsOnline(true); // Assume online if NetInfo not available
      return undefined;
    }
  }, [syncData]);

  // Initial load and periodic sync
  useEffect(() => {
    // Initialize data from storage first (faster)
    initializeData();

    // Then sync from backend
    syncData();

    // Setup periodic sync every 5 minutes
    syncTimeoutRef.current = setInterval(() => {
      syncData();
    }, CACHE_DURATION);

    return () => {
      if (syncTimeoutRef.current) {
        clearInterval(syncTimeoutRef.current);
      }
      // Cancel any pending requests on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [syncData, initializeData]);

  return {
    columns,
    bookmarks,
    loading,
    error,
    lastSyncTime,
    isOnline,
    syncData,
    toggleBookmark,
  };
}
