import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Play Tab Trends Synchronization Hook
 * - Fetches trending data every 5 minutes
 * - Caches last update time in localStorage
 * - Handles network errors with 1 retry
 */

export interface TrendItem {
  id: string;
  title: string;
  description: string;
  image?: string;
  source: string;
  timestamp: string;
  category?: string;
  platform?: string;
  likes?: number;
  popularity?: number;
  trendChange?: 'up' | 'down' | 'stable';
  previousRank?: number;
}

export interface PlaySyncState {
  trends: TrendItem[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  isSyncing: boolean;
  syncError: string | null;
}

interface CachedData {
  trends: TrendItem[];
  timestamp: string;
}

const PLAY_SYNC_CACHE_KEY = 'play_trends_sync_cache';
const LAST_UPDATE_KEY = 'play_trends_last_update';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const API_ENDPOINT = 'https://illustrious-cuchufli-7c4e58.netlify.app/api/fetch-trends';
const RETRY_DELAY = 2000; // 2 seconds before retry

export function usePlaySync() {
  const [state, setState] = useState<PlaySyncState>({
    trends: [],
    loading: true,
    error: null,
    lastUpdate: null,
    isSyncing: false,
    syncError: null,
  });

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 1;

  /**
   * Fetch trends from Netlify function
   */
  const fetchTrends = useCallback(async (isRetry = false) => {
    try {
      console.log('[usePlaySync] Fetching trends...', { isRetry, retryCount: retryCountRef.current });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(API_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.trends && Array.isArray(data.trends)) {
        setState(prev => ({
          ...prev,
          trends: data.trends,
          loading: false,
          error: null,
          lastUpdate: new Date(),
          isSyncing: false,
          syncError: null,
        }));

        // Cache the data
        await cacheTrends({
          trends: data.trends,
          timestamp: new Date().toISOString(),
        });

        // Update last sync time
        await AsyncStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());

        retryCountRef.current = 0; // Reset retry count on success
        console.log('[usePlaySync] Trends fetched successfully:', data.trends.length);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('[usePlaySync] Fetch failed:', error);

      // Retry logic
      if (retryCountRef.current < maxRetries && !isRetry) {
        console.log('[usePlaySync] Retrying after', RETRY_DELAY, 'ms...');
        retryCountRef.current++;
        setTimeout(() => {
          fetchTrends(true);
        }, RETRY_DELAY);
      } else {
        // All retries exhausted or this is a retry failure
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
          isSyncing: false,
          syncError: errorMessage,
        }));

        // Try to load from cache
        await loadFromCache();

        retryCountRef.current = 0; // Reset for next cycle
      }
    }
  }, []);

  /**
   * Cache trends to AsyncStorage
   */
  const cacheTrends = useCallback(async (data: CachedData) => {
    try {
      await AsyncStorage.setItem(PLAY_SYNC_CACHE_KEY, JSON.stringify(data));
      console.log('[usePlaySync] Cached trends successfully');
    } catch (err) {
      console.error('[usePlaySync] Cache write failed:', err);
    }
  }, []);

  /**
   * Load trends from cache
   */
  const loadFromCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(PLAY_SYNC_CACHE_KEY);
      if (cached) {
        const data: CachedData = JSON.parse(cached);
        if (data.trends && Array.isArray(data.trends)) {
          setState(prev => ({
            ...prev,
            trends: data.trends,
            loading: false,
            lastUpdate: new Date(data.timestamp),
          }));
          console.log('[usePlaySync] Loaded from cache:', data.trends.length);
          return true;
        }
      }
    } catch (err) {
      console.error('[usePlaySync] Cache load failed:', err);
    }
    return false;
  }, []);

  /**
   * Load last update time
   */
  const loadLastUpdateTime = useCallback(async () => {
    try {
      const lastUpdate = await AsyncStorage.getItem(LAST_UPDATE_KEY);
      if (lastUpdate) {
        setState(prev => ({
          ...prev,
          lastUpdate: new Date(lastUpdate),
        }));
      }
    } catch (err) {
      console.error('[usePlaySync] Load last update time failed:', err);
    }
  }, []);

  /**
   * Refresh trends manually
   */
  const refresh = useCallback(async () => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      isSyncing: true,
    }));
    retryCountRef.current = 0;
    await fetchTrends();
  }, [fetchTrends]);

  /**
   * Initialize sync on mount
   */
  useEffect(() => {
    console.log('[usePlaySync] Initializing...');

    // Load last update time
    loadLastUpdateTime();

    // Fetch initial data
    fetchTrends();

    // Set up interval for periodic sync
    syncIntervalRef.current = setInterval(() => {
      console.log('[usePlaySync] Periodic sync triggered');
      fetchTrends();
    }, SYNC_INTERVAL);

    return () => {
      // Cleanup on unmount
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [fetchTrends, loadLastUpdateTime]);

  return {
    ...state,
    refresh,
    syncInterval: SYNC_INTERVAL,
  };
}

export default usePlaySync;
