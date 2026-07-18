import { useCallback, useRef, useEffect, useState } from 'react';
import { networkOptimizer } from '../utils/NetworkOptimizer';

interface UseNetworkOptimizerOptions {
  timeout?: number;
  maxRetries?: number;
  priority?: number;
}

/**
 * Custom hook for optimized network requests
 * Handles automatic batching, retry logic, and timeouts
 */
export function useNetworkOptimizer(options: UseNetworkOptimizerOptions = {}) {
  const { timeout = 10000, maxRetries = 3, priority = 0 } = options;
  const requestIdsRef = useRef<Set<string>>(new Set());

  const fetch = useCallback(
    async <T,>(url: string, key?: string, fetchOptions?: RequestInit): Promise<T> => {
      const requestKey = key || url;
      requestIdsRef.current.add(requestKey);

      try {
        const data = await networkOptimizer.fetch<T>(
          url,
          requestKey,
          priority,
          fetchOptions
        );
        return data;
      } finally {
        requestIdsRef.current.delete(requestKey);
      }
    },
    [priority]
  );

  const cancel = useCallback((key: string) => {
    networkOptimizer.cancelRequest(key);
    requestIdsRef.current.delete(key);
  }, []);

  const cancelAll = useCallback(() => {
    for (const key of requestIdsRef.current) {
      networkOptimizer.cancelRequest(key);
    }
    requestIdsRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAll();
    };
  }, [cancelAll]);

  return {
    fetch,
    cancel,
    cancelAll,
    getStats: () => networkOptimizer.getStats(),
  };
}

/**
 * Hook for tracking network performance
 */
export function useNetworkStats() {
  const [stats, setStats] = useState({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    batchedRequests: 0,
    averageResponseTime: 0,
  });

  const updateStats = useCallback(() => {
    const networkStats = networkOptimizer.getStats();
    setStats({
      totalRequests: networkStats.totalRequests,
      successfulRequests: networkStats.successfulRequests,
      failedRequests: networkStats.failedRequests,
      batchedRequests: networkStats.batchedRequests,
      averageResponseTime: networkStats.averageResponseTime,
    });
  }, []);

  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 5000); // Update every 5s

    return () => clearInterval(interval);
  }, [updateStats]);

  const successRate =
    stats.totalRequests > 0
      ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)
      : '0';

  const batchingEfficiency =
    stats.totalRequests > 0
      ? ((1 - stats.batchedRequests / stats.totalRequests) * 100).toFixed(2)
      : '0';

  return {
    ...stats,
    successRate: parseFloat(successRate),
    batchingEfficiency: parseFloat(batchingEfficiency),
  };
}

/**
 * Hook for parallel batch requests
 */
export function useBatchFetch(options: UseNetworkOptimizerOptions = {}) {
  const networkHook = useNetworkOptimizer(options);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBatch = useCallback(
    async (requests: Array<{ url: string; key?: string }>) => {
      try {
        setLoading(true);
        setError(null);

        const results = await Promise.all(
          requests.map(({ url, key }) => networkHook.fetch(url, key))
        );

        setLoading(false);
        return results;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [networkHook]
  );

  return {
    fetchBatch,
    loading,
    error,
    cancel: networkHook.cancel,
    cancelAll: networkHook.cancelAll,
  };
}
