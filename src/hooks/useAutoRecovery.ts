import AsyncStorage from '@react-native-async-storage/async-storage';
import { globalErrorLogger } from './useErrorLogger';

interface RecoveryAttempt {
  id: string;
  timestamp: string;
  operation: string;
  errorType: string;
  tier: number;
  success: boolean;
  message: string;
}

export type RecoveryStrategy =
  | 'asyncStorageError'
  | 'apiTimeout'
  | 'networkError'
  | 'memoryError'
  | 'jsonParseError'
  | 'unknown';

class AutoRecoveryManager {
  private recoveryAttempts: RecoveryAttempt[] = [];
  private maxAttempts = 50;

  async executeRecovery(
    operation: () => Promise<any>,
    operationName: string,
    tab: string,
    strategy: RecoveryStrategy = 'unknown'
  ): Promise<any> {
    try {
      return await operation();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Tier 1: Simple Retry
      console.log(`[AutoRecovery] Tier 1: Retrying ${operationName}`);
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.delay(1000 * attempt);
          const result = await operation();
          await this.recordAttempt(operationName, strategy, 1, true, 'Tier 1 retry succeeded');
          return result;
        } catch (e) {
          console.warn(`[AutoRecovery] Tier 1 attempt ${attempt} failed:`, e);
        }
      }

      // Tier 2: Clear cache and retry
      console.log(`[AutoRecovery] Tier 2: Clearing cache for ${operationName}`);
      try {
        await this.clearRelevantCache(tab, strategy);
        await this.delay(500);
        const result = await operation();
        await this.recordAttempt(operationName, strategy, 2, true, 'Tier 2 cache clear succeeded');
        return result;
      } catch (e) {
        console.warn(`[AutoRecovery] Tier 2 failed:`, e);
      }

      // Tier 3: Reset tab to defaults
      console.log(`[AutoRecovery] Tier 3: Resetting ${tab} to defaults`);
      try {
        await this.resetTabDefaults(tab);
        await this.delay(500);
        const result = await operation();
        await this.recordAttempt(operationName, strategy, 3, true, 'Tier 3 reset succeeded');
        return result;
      } catch (e) {
        console.warn(`[AutoRecovery] Tier 3 failed:`, e);
      }

      // All recovery failed - log and throw
      await globalErrorLogger.log(tab, `Recovery failed for ${operationName}: ${errorMsg}`, 'error');
      await this.recordAttempt(operationName, strategy, 0, false, `All tiers failed: ${errorMsg}`);
      throw error;
    }
  }

  private async clearRelevantCache(tab: string, strategy: RecoveryStrategy) {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => {
        // Determine which cache to clear based on tab and strategy
        if (strategy === 'asyncStorageError') {
          return key.startsWith(`${tab.toLowerCase()}_`) || key.startsWith('cache_');
        }
        if (strategy === 'memoryError') {
          return key.startsWith('temp_') || key.startsWith('cache_');
        }
        return key.startsWith(`${tab.toLowerCase()}_cache`);
      });

      if (cacheKeys.length > 0) {
        await Promise.all(cacheKeys.map(key => AsyncStorage.removeItem(key)));
        console.log(`[AutoRecovery] Cleared ${cacheKeys.length} cache entries`);
      }
    } catch (e) {
      console.warn('[AutoRecovery] Cache clear failed:', e);
    }
  }

  private async resetTabDefaults(tab: string) {
    const defaults: Record<string, any> = {
      English: {
        key: 'english_words',
        value: JSON.stringify([]),
      },
      TOEFL: {
        key: 'toefl_sections',
        value: JSON.stringify([
          { id: 'reading', name: 'Reading', progress: 0, completed: false },
          { id: 'listening', name: 'Listening', progress: 0, completed: false },
          { id: 'writing', name: 'Writing', progress: 0, completed: false },
          { id: 'speaking', name: 'Speaking', progress: 0, completed: false },
        ]),
      },
      Papers: {
        key: 'papers',
        value: JSON.stringify([]),
      },
      Play: {
        key: 'play_data',
        value: JSON.stringify({ videos: [] }),
      },
      Storage: {
        key: 'storage_meta',
        value: JSON.stringify({ initialized: true }),
      },
      Settings: {
        key: 'settings',
        value: JSON.stringify({ debugMode: false }),
      },
    };

    const defaultConfig = defaults[tab];
    if (defaultConfig) {
      try {
        await AsyncStorage.setItem(defaultConfig.key, defaultConfig.value);
        console.log(`[AutoRecovery] Reset ${tab} to defaults`);
      } catch (e) {
        console.warn(`[AutoRecovery] Failed to reset ${tab}:`, e);
        throw e;
      }
    }
  }

  private async recordAttempt(
    operation: string,
    strategy: RecoveryStrategy,
    tier: number,
    success: boolean,
    message: string
  ) {
    const attempt: RecoveryAttempt = {
      id: `recovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      operation,
      errorType: strategy,
      tier,
      success,
      message,
    };

    this.recoveryAttempts.unshift(attempt);
    if (this.recoveryAttempts.length > this.maxAttempts) {
      this.recoveryAttempts.pop();
    }

    try {
      await AsyncStorage.setItem('recovery_attempts', JSON.stringify(this.recoveryAttempts));
    } catch (e) {
      console.warn('[AutoRecovery] Failed to save recovery attempt:', e);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getRecoveryAttempts(): Promise<RecoveryAttempt[]> {
    try {
      const saved = await AsyncStorage.getItem('recovery_attempts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  async clearRecoveryAttempts() {
    this.recoveryAttempts = [];
    await AsyncStorage.removeItem('recovery_attempts');
  }

  async getRecoveryStats() {
    const attempts = await this.getRecoveryAttempts();
    const successful = attempts.filter((a) => a.success);
    const byTier = {
      tier1: attempts.filter((a) => a.tier === 1).length,
      tier2: attempts.filter((a) => a.tier === 2).length,
      tier3: attempts.filter((a) => a.tier === 3).length,
      failed: attempts.filter((a) => !a.success).length,
    };

    return {
      total: attempts.length,
      successRate: attempts.length > 0 ? (successful.length / attempts.length) * 100 : 0,
      byTier,
    };
  }
}

export const autoRecoveryManager = new AutoRecoveryManager();

export function useAutoRecovery() {
  return {
    executeRecovery: autoRecoveryManager.executeRecovery.bind(autoRecoveryManager),
    getRecoveryAttempts: autoRecoveryManager.getRecoveryAttempts.bind(autoRecoveryManager),
    clearRecoveryAttempts: autoRecoveryManager.clearRecoveryAttempts.bind(
      autoRecoveryManager
    ),
    getRecoveryStats: autoRecoveryManager.getRecoveryStats.bind(autoRecoveryManager),
  };
}
