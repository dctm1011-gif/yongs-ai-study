/**
 * Storage Manager
 * Implements lazy-loading strategy for component code splitting
 * Manages storage optimization and cleanup
 */

export interface LazyLoadConfig {
  chunkSize: number;
  preloadThreshold: number;
  maxConcurrentLoads: number;
}

export class StorageManager {
  private static instance: StorageManager;
  private config: LazyLoadConfig = {
    chunkSize: 51200, // 50KB chunks for progressive loading
    preloadThreshold: 0.8, // Start preloading when 80% of current chunk is consumed
    maxConcurrentLoads: 3,
  };
  private loadingQueues: Map<string, Promise<any>> = new Map();
  private prefetchQueue: string[] = [];
  private activeLoads = 0;

  private constructor() {}

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * Lazy load data in chunks
   */
  async lazyLoadData<T>(
    dataSource: T[],
    chunkSize?: number
  ): Promise<(pageIndex: number) => T[]> {
    const size = chunkSize || this.config.chunkSize;

    return (pageIndex: number) => {
      const start = pageIndex * size;
      const end = Math.min(start + size, dataSource.length);
      return dataSource.slice(start, end);
    };
  }

  /**
   * Get total number of pages for paginated data
   */
  getTotalPages(totalItems: number, chunkSize?: number): number {
    const size = chunkSize || this.config.chunkSize;
    return Math.ceil(totalItems / size);
  }

  /**
   * Prefetch next chunk of data
   */
  async prefetchNextChunk<T>(
    dataFetcher: () => Promise<T>,
    cacheKey: string
  ): Promise<void> {
    if (this.activeLoads >= this.config.maxConcurrentLoads) {
      this.prefetchQueue.push(cacheKey);
      return;
    }

    this.activeLoads++;

    try {
      if (!this.loadingQueues.has(cacheKey)) {
        const promise = dataFetcher();
        this.loadingQueues.set(cacheKey, promise);
        await promise;
      }
    } finally {
      this.activeLoads--;
      this.processPrefetchQueue();
    }
  }

  /**
   * Get cached prefetch result
   */
  async getPrefetchedData<T>(cacheKey: string): Promise<T | null> {
    const promise = this.loadingQueues.get(cacheKey);
    if (promise) {
      return await promise;
    }
    return null;
  }

  /**
   * Clear prefetch cache
   */
  clearPrefetchCache(cacheKey?: string): void {
    if (cacheKey) {
      this.loadingQueues.delete(cacheKey);
    } else {
      this.loadingQueues.clear();
    }
  }

  /**
   * Update lazy load configuration
   */
  setConfig(config: Partial<LazyLoadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LazyLoadConfig {
    return { ...this.config };
  }

  /**
   * Private: Process prefetch queue
   */
  private processPrefetchQueue(): void {
    if (
      this.prefetchQueue.length > 0 &&
      this.activeLoads < this.config.maxConcurrentLoads
    ) {
      const nextKey = this.prefetchQueue.shift();
      if (nextKey) {
        // Re-trigger prefetch for next item in queue
        const promise = this.loadingQueues.get(nextKey);
        if (promise) {
          this.activeLoads++;
          promise
            .finally(() => {
              this.activeLoads--;
              this.processPrefetchQueue();
            });
        }
      }
    }
  }
}

export const storageManager = StorageManager.getInstance();

/**
 * React helper for code splitting with React.lazy
 * Usage: const LazyComponent = lazyLoad(() => import('./component'))
 */
export function lazyLoad<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(factory);
}

import React from 'react';
