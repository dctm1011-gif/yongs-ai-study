import { useState, useEffect, useCallback, useRef } from 'react';
import { cacheManager } from '../utils/CacheManager';
import { networkOptimizer } from '../utils/NetworkOptimizer';

interface UseCacheStrategyOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  ttl?: number;
  skip?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseCacheStrategyResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  invalidate: () => Promise<void>;
  isCached: boolean;
}

/**
 * Custom hook for intelligent cache strategy
 * Automatically manages caching with fallback to network
 * Includes error handling and refetch capabilities
 */
export function useCacheStrategy<T>({
  key,
  fetcher,
  ttl,
  skip = false,
  onSuccess,
  onError,
}: UseCacheStrategyOptions<T>): UseCacheStrategyResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isCached, setIsCached] = useState(false);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (skip) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Try to get from cache first
      const cachedData = await cacheManager.get<T>(key);

      if (cachedData && mountedRef.current) {
        setData(cachedData);
        setIsCached(true);
        setLoading(false);
        onSuccess?.(cachedData);
        return;
      }

      // If not in cache, fetch from network
      setIsCached(false);
      const freshData = await networkOptimizer.fetch<T>(
        key, // URL is same as key for this use case
        key,
        1, // Priority
      );

      if (!mountedRef.current) return;

      // Cache the fetched data
      await cacheManager.set(key, freshData, ttl);
      setData(freshData);
      setIsCached(false);
      setLoading(false);
      onSuccess?.(freshData);
    } catch (err) {
      if (!mountedRef.current) return;

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setLoading(false);
      onError?.(error);
    }
  }, [key, skip, ttl, onSuccess, onError]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  const refetch = useCallback(async () => {
    // Clear cache and refetch
    await cacheManager.clear(key);
    await fetchData();
  }, [key, fetchData]);

  const invalidate = useCallback(async () => {
    // Just clear cache without fetching
    await cacheManager.clear(key);
    setData(null);
    setIsCached(false);
  }, [key]);

  return {
    data,
    loading,
    error,
    refetch,
    invalidate,
    isCached,
  };
}

/**
 * Hook for batch data fetching with intelligent caching
 */
export function useBatchCacheStrategy<T extends Record<string, any>>(
  requests: Array<{
    key: string;
    fetcher: () => Promise<any>;
    ttl?: number;
  }>
): {
  data: Partial<T>;
  loading: boolean;
  errors: Record<string, Error>;
  refetch: (keys?: string[]) => Promise<void>;
} {
  const [data, setData] = useState<Partial<T>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, Error>>({});
  const mountedRef = useRef(true);

  const fetchBatch = useCallback(async () => {
    try {
      setLoading(true);

      const results: Partial<T> = {};
      const newErrors: Record<string, Error> = {};

      // Fetch in parallel
      const promises = requests.map(async ({ key, fetcher, ttl }) => {
        try {
          const cached = await cacheManager.get(key);
          if (cached) {
            results[key as keyof T] = cached as any;
            return;
          }

          const freshData = await fetcher();
          await cacheManager.set(key, freshData, ttl);
          results[key as keyof T] = freshData as any;
        } catch (err) {
          newErrors[key] = err instanceof Error ? err : new Error(String(err));
        }
      });

      await Promise.all(promises);

      if (mountedRef.current) {
        setData(results);
        setErrors(newErrors);
        setLoading(false);
      }
    } catch (err) {
      console.error('Batch fetch failed:', err);
      setLoading(false);
    }
  }, [requests]);

  useEffect(() => {
    mountedRef.current = true;
    fetchBatch();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchBatch]);

  const refetch = useCallback(
    async (keys?: string[]) => {
      const keysToRefetch = keys || requests.map(r => r.key);

      for (const key of keysToRefetch) {
        await cacheManager.clear(key);
      }

      await fetchBatch();
    },
    [requests, fetchBatch]
  );

  return {
    data,
    loading,
    errors,
    refetch,
  };
}

/**
 * Hook to monitor cache performance
 */
export function useCacheStats() {
  const [stats, setStats] = useState({
    memoryUsageMB: 0,
    memoryCacheSize: 0,
    diskCacheKeys: 0,
  });

  const updateStats = useCallback(async () => {
    const cacheStats = await cacheManager.getStats();
    setStats({
      memoryUsageMB: cacheStats.memoryUsageMB,
      memoryCacheSize: cacheStats.memoryCacheSize,
      diskCacheKeys: cacheStats.diskCacheKeys,
    });
  }, []);

  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 10000); // Update every 10s

    return () => clearInterval(interval);
  }, [updateStats]);

  return stats;
}
