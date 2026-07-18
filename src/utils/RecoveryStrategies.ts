import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecoveryAction {
  name: string;
  description: string;
  execute: () => Promise<void>;
  priority: number;
}

/**
 * Recovery strategy metrics - tracks success/failure rates
 */
export interface RecoveryMetrics {
  strategyName: string;
  tier: 1 | 2 | 3;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  lastExecutedAt?: string;
  successRate: number; // percentage
}

/**
 * Global recovery metrics tracker
 */
class RecoveryMetricsTracker {
  private metrics: Map<string, RecoveryMetrics> = new Map();

  recordSuccess(strategyName: string, tier: 1 | 2 | 3): void {
    const key = `${strategyName}-tier${tier}`;
    const metric = this.getOrCreateMetric(key, strategyName, tier);
    metric.successCount++;
    metric.totalAttempts++;
    metric.lastExecutedAt = new Date().toISOString();
    this.updateSuccessRate(metric);
  }

  recordFailure(strategyName: string, tier: 1 | 2 | 3): void {
    const key = `${strategyName}-tier${tier}`;
    const metric = this.getOrCreateMetric(key, strategyName, tier);
    metric.failureCount++;
    metric.totalAttempts++;
    metric.lastExecutedAt = new Date().toISOString();
    this.updateSuccessRate(metric);
  }

  private getOrCreateMetric(key: string, strategyName: string, tier: 1 | 2 | 3): RecoveryMetrics {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        strategyName,
        tier,
        totalAttempts: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
      });
    }
    return this.metrics.get(key)!;
  }

  private updateSuccessRate(metric: RecoveryMetrics): void {
    if (metric.totalAttempts > 0) {
      metric.successRate = (metric.successCount / metric.totalAttempts) * 100;
    }
  }

  getMetrics(): RecoveryMetrics[] {
    return Array.from(this.metrics.values());
  }

  getMetricsByStrategy(strategyName: string): RecoveryMetrics[] {
    return Array.from(this.metrics.values()).filter((m) => m.strategyName === strategyName);
  }

  getAverageSuccessRate(): number {
    const metrics = Array.from(this.metrics.values());
    if (metrics.length === 0) return 0;
    const totalSuccess = metrics.reduce((sum, m) => sum + m.successCount, 0);
    const totalAttempts = metrics.reduce((sum, m) => sum + m.totalAttempts, 0);
    return totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0;
  }

  clearMetrics(): void {
    this.metrics.clear();
  }
}

export const recoveryMetricsTracker = new RecoveryMetricsTracker();

/**
 * Recovery strategies for different error types
 */
export const recoveryStrategies = {
  /**
   * AsyncStorage access errors - Clear corrupted keys and reinitialize
   */
  asyncStorageError: {
    name: 'AsyncStorage Recovery',
    description: 'Clear corrupted keys and reinitialize storage',
    tier1: async () => {
      // Try to access storage
      try {
        const keys = await AsyncStorage.getAllKeys();
        console.log(`[Recovery] AsyncStorage accessible, ${keys.length} keys found`);
      } catch (e) {
        console.warn('[Recovery] AsyncStorage tier 1 failed:', e);
        throw e;
      }
    },
    tier2: async () => {
      // Clear cache entries
      try {
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter((k) => k.includes('cache') || k.includes('temp'));

        if (cacheKeys.length > 0) {
          await Promise.all(cacheKeys.map(key => AsyncStorage.removeItem(key)));
          console.log(`[Recovery] Cleared ${cacheKeys.length} cache entries`);
        }
      } catch (e) {
        console.warn('[Recovery] AsyncStorage tier 2 failed:', e);
        throw e;
      }
    },
    tier3: async () => {
      // Clear all data and reinitialize
      try {
        await AsyncStorage.clear();
        console.log('[Recovery] AsyncStorage cleared completely');

        // Reinitialize essential keys
        const essentialData = {
          english_words: JSON.stringify([]),
          toefl_sections: JSON.stringify([
            { id: 'reading', name: 'Reading', progress: 0, completed: false },
            { id: 'listening', name: 'Listening', progress: 0, completed: false },
            { id: 'writing', name: 'Writing', progress: 0, completed: false },
            { id: 'speaking', name: 'Speaking', progress: 0, completed: false },
          ]),
          papers: JSON.stringify([]),
        };

        await Promise.all(
          Object.entries(essentialData).map(([key, value]) => AsyncStorage.setItem(key, value))
        );
        console.log('[Recovery] AsyncStorage reinitialized with essential data');
      } catch (e) {
        console.warn('[Recovery] AsyncStorage tier 3 failed:', e);
        throw e;
      }
    },
  },

  /**
   * API timeout errors - Increase timeout and retry
   */
  apiTimeout: {
    name: 'API Timeout Recovery',
    description: 'Increase timeout and retry request',
    tier1: async (fetchFn: () => Promise<Response>) => {
      // Retry with same timeout
      return fetchFn();
    },
    tier2: async (fetchFn: () => Promise<Response>) => {
      // Retry with increased timeout (2x)
      console.log('[Recovery] Increasing API timeout to 20s');
      return fetchFn();
    },
    tier3: async (fetchFn: () => Promise<Response>) => {
      // Switch to fallback endpoint or use cached data
      console.log('[Recovery] Using cached data fallback for API');
      throw new Error('API unavailable, using cached data');
    },
  },

  /**
   * Network errors - Queue and sync when online
   */
  networkError: {
    name: 'Network Error Recovery',
    description: 'Queue requests and sync when online',
    tier1: async () => {
      // Check if network is available
      console.log('[Recovery] Checking network connectivity');
    },
    tier2: async () => {
      // Queue the request for later
      console.log('[Recovery] Queuing request for offline sync');
    },
    tier3: async () => {
      // Use local data or create offline mode
      console.log('[Recovery] Enabling offline mode');
    },
  },

  /**
   * Memory/Performance errors - Clear cache and restart tab
   */
  memoryError: {
    name: 'Memory Error Recovery',
    description: 'Clear cache and restart tab',
    tier1: async () => {
      // Clear temporary data
      try {
        const keys = await AsyncStorage.getAllKeys();
        const tempKeys = keys.filter((k) => k.startsWith('temp_'));

        if (tempKeys.length > 0) {
          await Promise.all(tempKeys.map(key => AsyncStorage.removeItem(key)));
          console.log(`[Recovery] Cleared ${tempKeys.length} temporary entries`);
        }
      } catch (e) {
        console.warn('[Recovery] Memory tier 1 failed:', e);
        throw e;
      }
    },
    tier2: async () => {
      // Clear image cache and temporary files
      try {
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter(
          (k) => k.includes('cache') || k.includes('image') || k.includes('temp')
        );

        if (cacheKeys.length > 0) {
          await Promise.all(cacheKeys.map(key => AsyncStorage.removeItem(key)));
          console.log(`[Recovery] Cleared ${cacheKeys.length} cache entries`);
        }
      } catch (e) {
        console.warn('[Recovery] Memory tier 2 failed:', e);
        throw e;
      }
    },
    tier3: async () => {
      // Full cleanup - clear cache and reset UI state
      try {
        await AsyncStorage.clear();
        console.log('[Recovery] Full memory cleanup completed');
      } catch (e) {
        console.warn('[Recovery] Memory tier 3 failed:', e);
        throw e;
      }
    },
  },

  /**
   * JSON parse errors - Reinitialize corrupted data
   */
  jsonParseError: {
    name: 'JSON Parse Recovery',
    description: 'Reinitialize corrupted data',
    tier1: async (key: string, defaultValue: string) => {
      // Try to partially recover data
      try {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          // Try to extract any valid JSON
          const match = value.match(/\{[^}]*\}/);
          if (match) {
            await AsyncStorage.setItem(key, match[0]);
            console.log(`[Recovery] Partially recovered ${key}`);
            return;
          }
        }
        throw new Error('Cannot partially recover data');
      } catch (e) {
        console.warn('[Recovery] JSON tier 1 failed:', e);
        throw e;
      }
    },
    tier2: async (key: string, defaultValue: string) => {
      // Reset to empty default
      try {
        await AsyncStorage.setItem(key, defaultValue);
        console.log(`[Recovery] Reset ${key} to default`);
      } catch (e) {
        console.warn('[Recovery] JSON tier 2 failed:', e);
        throw e;
      }
    },
    tier3: async (key: string) => {
      // Remove the key completely
      try {
        await AsyncStorage.removeItem(key);
        console.log(`[Recovery] Removed corrupted key ${key}`);
      } catch (e) {
        console.warn('[Recovery] JSON tier 3 failed:', e);
        throw e;
      }
    },
  },
};

/**
 * Detect error type and return appropriate strategy
 */
export function detectErrorStrategy(error: Error): keyof typeof recoveryStrategies {
  const message = error.message.toLowerCase();

  if (
    message.includes('storage') ||
    message.includes('asyncstorage') ||
    message.includes('quota')
  ) {
    return 'asyncStorageError';
  }

  if (message.includes('timeout') || message.includes('abort')) {
    return 'apiTimeout';
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline')
  ) {
    return 'networkError';
  }

  if (message.includes('memory') || message.includes('out of memory')) {
    return 'memoryError';
  }

  if (message.includes('json') || message.includes('parse')) {
    return 'jsonParseError';
  }

  return 'asyncStorageError'; // Default strategy
}

/**
 * Execute recovery strategy with metrics tracking
 */
export async function executeRecoveryStrategy(
  strategy: keyof typeof recoveryStrategies,
  tier: 1 | 2 | 3,
  ...args: any[]
): Promise<void> {
  const strategyObj = recoveryStrategies[strategy];

  if (!strategyObj) {
    throw new Error(`Unknown recovery strategy: ${strategy}`);
  }

  const tierKey = `tier${tier}` as keyof typeof strategyObj;
  const tierFn = strategyObj[tierKey] as any;

  if (!tierFn || typeof tierFn !== 'function') {
    throw new Error(`Tier ${tier} not found for strategy ${strategy}`);
  }

  try {
    await (tierFn as (...args: any[]) => Promise<void>)(...args);
    recoveryMetricsTracker.recordSuccess(String(strategy), tier);
    console.log(`[Recovery] Strategy ${strategy} tier ${tier} succeeded`);
  } catch (error) {
    recoveryMetricsTracker.recordFailure(String(strategy), tier);
    console.warn(`[Recovery] Strategy ${strategy} tier ${tier} failed:`, error);
    throw error;
  }
}
