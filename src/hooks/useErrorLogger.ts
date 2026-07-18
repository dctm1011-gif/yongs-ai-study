import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ErrorLog {
  id: string;
  timestamp: string;
  tab: string;
  error: string;
  stack?: string;
  severity: 'warning' | 'error' | 'fatal';
}

interface ErrorBatch {
  id: string;
  errors: ErrorLog[];
  createdAt: string;
  sentAt?: string;
  status: 'pending' | 'syncing' | 'sent';
}

class GlobalErrorLogger {
  private logs: ErrorLog[] = [];
  private pendingBatch: ErrorLog[] = [];
  private maxLogs = 200;
  private batchSize = 5;
  private batchInterval = 5 * 60 * 1000; // 5 minutes
  private batchTimer: NodeJS.Timeout | null = null;
  private debugMode = false;
  private isOnline = true;
  private syncQueue: ErrorBatch[] = [];

  constructor() {
    this.initializeNetworkListener();
    this.loadDebugMode();
    this.loadOfflineQueue();
    this.setupGlobalErrorHandler();
  }

  private initializeNetworkListener() {
    // Check connectivity periodically
    setInterval(() => {
      this.checkConnectivity();
    }, 30000); // Check every 30 seconds

    // Initial check
    this.checkConnectivity();
  }

  private async checkConnectivity() {
    const wasOffline = !this.isOnline;
    try {
      const response = await Promise.race([
        fetch('https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/test', {
          method: 'HEAD',
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        ),
      ]);
      this.isOnline = true;

      if (wasOffline) {
        console.log('[ErrorLogger] Network restored - syncing offline errors');
        this.syncOfflineErrors();
      }
    } catch (e) {
      this.isOnline = false;
    }
  }

  private setupGlobalErrorHandler() {
    // Catch global React Native errors
    if (global.ErrorUtils) {
      const previousHandler = global.ErrorUtils.getGlobalHandler?.();
      global.ErrorUtils.setGlobalHandler((error: Error, isFatal: boolean) => {
        this.log('Global', error, isFatal ? 'fatal' : 'error');
        if (previousHandler) {
          previousHandler(error, isFatal);
        }
      });
    }
  }

  private async loadDebugMode() {
    try {
      const mode = await AsyncStorage.getItem('debug_mode');
      this.debugMode = mode === 'true';
    } catch (e) {
      this.debugMode = false;
    }
  }

  private async loadOfflineQueue() {
    try {
      const queue = await AsyncStorage.getItem('error_sync_queue');
      if (queue) {
        this.syncQueue = JSON.parse(queue);
        console.log(`[ErrorLogger] Loaded ${this.syncQueue.length} offline batches`);
      }
    } catch (e) {
      console.warn('[ErrorLogger] Failed to load offline queue:', e);
    }
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
    AsyncStorage.setItem('debug_mode', enabled ? 'true' : 'false').catch(() => {});
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }

  async log(
    tab: string,
    error: string | Error,
    severity: 'warning' | 'error' | 'fatal' = 'error'
  ) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const logEntry: ErrorLog = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      tab,
      error: errorMessage,
      stack,
      severity,
    };

    // Add to memory
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Add to pending batch
    this.pendingBatch.unshift(logEntry);

    // Save to AsyncStorage
    await this.saveToStorage();

    // Debug logging
    if (this.debugMode) {
      const prefix = `[${tab}] ${severity.toUpperCase()}`;
      if (severity === 'fatal') {
        console.error(prefix, errorMessage);
      } else if (severity === 'error') {
        console.error(prefix, errorMessage);
      } else {
        console.warn(prefix, errorMessage);
      }
    }

    // Check if batch should be sent
    if (this.pendingBatch.length >= this.batchSize) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.batchInterval);
    }
  }

  private async saveToStorage() {
    try {
      await AsyncStorage.setItem('errorLogs', JSON.stringify(this.logs));
    } catch (e) {
      console.warn('[ErrorLogger] Failed to save error logs to storage:', e);
    }
  }

  private async flushBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingBatch.length === 0) {
      return;
    }

    const batch: ErrorBatch = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      errors: [...this.pendingBatch],
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    this.pendingBatch = [];

    try {
      if (this.isOnline) {
        await this.sendBatch(batch);
      } else {
        await this.queueBatchOffline(batch);
      }
    } catch (e) {
      console.warn('[ErrorLogger] Failed to flush batch:', e);
      await this.queueBatchOffline(batch);
    }
  }

  private async sendBatch(batch: ErrorBatch) {
    try {
      batch.status = 'syncing';
      const response = await fetch(
        'https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/log-error',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        }
      );

      if (response.ok) {
        batch.status = 'sent';
        batch.sentAt = new Date().toISOString();
        console.log(`[ErrorLogger] Batch sent successfully (${batch.errors.length} errors)`);
        return true;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (e) {
      console.warn(`[ErrorLogger] Failed to send batch: ${e}`);
      throw e;
    }
  }

  private async queueBatchOffline(batch: ErrorBatch) {
    try {
      this.syncQueue.push(batch);
      await AsyncStorage.setItem('error_sync_queue', JSON.stringify(this.syncQueue));
      console.log(`[ErrorLogger] Queued batch offline (queue size: ${this.syncQueue.length})`);
    } catch (e) {
      console.warn('[ErrorLogger] Failed to queue batch offline:', e);
    }
  }

  private async syncOfflineErrors() {
    if (!this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    const failedBatches: ErrorBatch[] = [];

    for (const batch of this.syncQueue) {
      try {
        await this.sendBatch(batch);
      } catch (e) {
        console.warn(`[ErrorLogger] Failed to sync batch ${batch.id}, keeping in queue`);
        failedBatches.push(batch);
      }
    }

    this.syncQueue = failedBatches;
    await AsyncStorage.setItem('error_sync_queue', JSON.stringify(this.syncQueue));

    if (this.syncQueue.length === 0) {
      console.log('[ErrorLogger] All offline errors synced successfully');
    }
  }

  async getLogs(): Promise<ErrorLog[]> {
    try {
      const saved = await AsyncStorage.getItem('errorLogs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  async getLogsByTab(tab: string): Promise<ErrorLog[]> {
    const logs = await this.getLogs();
    return logs.filter((log) => log.tab === tab);
  }

  async getLogsBySeverity(severity: 'warning' | 'error' | 'fatal'): Promise<ErrorLog[]> {
    const logs = await this.getLogs();
    return logs.filter((log) => log.severity === severity);
  }

  async getLogsInTimeRange(startTime: Date, endTime: Date): Promise<ErrorLog[]> {
    const logs = await this.getLogs();
    const start = startTime.getTime();
    const end = endTime.getTime();
    return logs.filter((log) => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= start && logTime <= end;
    });
  }

  async clearLogs() {
    this.logs = [];
    this.pendingBatch = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    await AsyncStorage.removeItem('errorLogs');
    await AsyncStorage.removeItem('error_sync_queue');
    this.syncQueue = [];
  }

  async getErrorStats() {
    const logs = await this.getLogs();
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const logsIn24h = logs.filter((log) => new Date(log.timestamp) > last24h);

    return {
      total: logs.length,
      in24h: logsIn24h.length,
      fatal: logs.filter((log) => log.severity === 'fatal').length,
      error: logs.filter((log) => log.severity === 'error').length,
      warning: logs.filter((log) => log.severity === 'warning').length,
      byTab: this.getErrorsByTab(logs),
      hourlyTrend: this.getHourlyTrend(logsIn24h),
      offlineQueueSize: this.syncQueue.length,
    };
  }

  private getErrorsByTab(logs: ErrorLog[]): Record<string, number> {
    const result: Record<string, number> = {};
    logs.forEach((log) => {
      result[log.tab] = (result[log.tab] || 0) + 1;
    });
    return result;
  }

  private getHourlyTrend(logs: ErrorLog[]): Record<string, number> {
    const result: Record<string, number> = {};
    logs.forEach((log) => {
      const date = new Date(log.timestamp);
      const key = `${date.getHours()}:00`;
      result[key] = (result[key] || 0) + 1;
    });
    return result;
  }
}

export const globalErrorLogger = new GlobalErrorLogger();

export function useErrorLogger() {
  return {
    log: globalErrorLogger.log.bind(globalErrorLogger),
    getLogs: globalErrorLogger.getLogs.bind(globalErrorLogger),
    getLogsByTab: globalErrorLogger.getLogsByTab.bind(globalErrorLogger),
    getLogsBySeverity: globalErrorLogger.getLogsBySeverity.bind(globalErrorLogger),
    getLogsInTimeRange: globalErrorLogger.getLogsInTimeRange.bind(globalErrorLogger),
    clearLogs: globalErrorLogger.clearLogs.bind(globalErrorLogger),
    getErrorStats: globalErrorLogger.getErrorStats.bind(globalErrorLogger),
    setDebugMode: globalErrorLogger.setDebugMode.bind(globalErrorLogger),
    getDebugMode: globalErrorLogger.getDebugMode.bind(globalErrorLogger),
  };
}
