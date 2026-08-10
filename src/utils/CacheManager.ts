import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // in milliseconds
}

interface CacheConfig {
  [key: string]: number; // key -> TTL in milliseconds
}

export class CacheManager {
  private static instance: CacheManager;
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private cacheConfig: CacheConfig = {
    'english_words': 24 * 60 * 60 * 1000, // 24 hours
    'english_quizzes': 24 * 60 * 60 * 1000, // 24 hours
    'toefl_sections': 24 * 60 * 60 * 1000, // 24 hours
    'papers_list': 12 * 60 * 60 * 1000, // 12 hours
    'papers_trends': 6 * 60 * 60 * 1000, // 6 hours
    'announcements': 1 * 60 * 60 * 1000, // 1 hour
  };
  private MAX_MEMORY_CACHE_SIZE = 10 * 1024 * 1024; // 10MB
  private currentMemoryUsage = 0;

  private constructor() {}

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Get data from cache (memory first, then disk)
   */
  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      return memoryEntry.data as T;
    }

    // Remove expired entry from memory
    if (memoryEntry && this.isExpired(memoryEntry)) {
      this.memoryCache.delete(key);
      this.currentMemoryUsage -= this.getSize(memoryEntry.data);
    }

    // Check disk cache
    try {
      const diskData = await AsyncStorage.getItem(key);
      if (diskData) {
        const parsed = JSON.parse(diskData);
        if (parsed && parsed.data && !this.isExpired(parsed)) {
          // Restore to memory cache
          this.set(key, parsed.data, parsed.ttl);
          return parsed.data as T;
        } else if (parsed && this.isExpired(parsed)) {
          // Remove expired disk entry
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error(`Cache retrieval failed for key ${key}:`, error);
    }

    return null;
  }

  /**
   * Set data in cache with TTL
   */
  async set<T>(key: string, data: T, ttlOverride?: number): Promise<void> {
    const ttl = ttlOverride || this.cacheConfig[key] || 24 * 60 * 60 * 1000;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    // Add to memory cache with LRU eviction
    const dataSize = this.getSize(data);
    if (this.currentMemoryUsage + dataSize > this.MAX_MEMORY_CACHE_SIZE) {
      this.evictOldestEntry();
    }

    this.memoryCache.set(key, entry);
    this.currentMemoryUsage += dataSize;

    // Persist to disk
    try {
      await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.error(`Cache write failed for key ${key}:`, error);
      // Fallback: keep in memory even if disk fails
    }
  }

  /**
   * Clear specific cache entry
   */
  async clear(key: string): Promise<void> {
    const entry = this.memoryCache.get(key);
    if (entry) {
      this.currentMemoryUsage -= this.getSize(entry.data);
      this.memoryCache.delete(key);
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Cache clear failed for key ${key}:`, error);
    }
  }

  /**
   * Clear all expired cache entries
   */
  async clearExpired(): Promise<void> {
    const keysToRemove: string[] = [];

    // Check memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        keysToRemove.push(key);
        this.currentMemoryUsage -= this.getSize(entry.data);
        this.memoryCache.delete(key);
      }
    }

    // Check disk cache
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      for (const key of allKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed && this.isExpired(parsed)) {
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('Expired cache cleanup failed:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryUsageBytes: number;
    memoryUsageMB: number;
    memoryCacheSize: number;
    diskCacheKeys: number;
  }> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      return {
        memoryUsageBytes: this.currentMemoryUsage,
        memoryUsageMB: this.currentMemoryUsage / (1024 * 1024),
        memoryCacheSize: this.memoryCache.size,
        diskCacheKeys: allKeys.length,
      };
    } catch (error) {
      console.error('Cache stats retrieval failed:', error);
      return {
        memoryUsageBytes: this.currentMemoryUsage,
        memoryUsageMB: this.currentMemoryUsage / (1024 * 1024),
        memoryCacheSize: this.memoryCache.size,
        diskCacheKeys: 0,
      };
    }
  }

  /**
   * Clear all cache (only cache-managed keys, not all AsyncStorage)
   */
  async clearAll(): Promise<void> {
    const keys = Array.from(this.memoryCache.keys());
    this.memoryCache.clear();
    this.currentMemoryUsage = 0;
    try {
      if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error('Cache clear all failed:', error);
    }
  }

  /**
   * Update cache TTL configuration
   */
  setTTL(key: string, ttlMs: number): void {
    this.cacheConfig[key] = ttlMs;
  }

  /**
   * Private helper: Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Private helper: Estimate object size in bytes
   */
  private getSize(obj: any): number {
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  }

  /**
   * Private helper: Evict oldest entry using LRU
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.memoryCache.get(oldestKey);
      if (entry) {
        this.currentMemoryUsage -= this.getSize(entry.data);
        this.memoryCache.delete(oldestKey);
      }
    }
  }
}

export const cacheManager = CacheManager.getInstance();
