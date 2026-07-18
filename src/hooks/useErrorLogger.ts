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

/**
 * Repeated error detection - track errors within 30 minutes
 */
interface RepeatedErrorEntry {
  error: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  alerted: boolean;
}

/**
 * Alert badge for repeated FATAL errors
 */
interface AlertBadge {
  id: string;
  type: 'repeated-error' | 'fatal-spike';
  severity: 'critical' | 'warning';
  message: string;
  timestamp: string;
  errorSignature: string;
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
  private repeatedErrors: Map<string, RepeatedErrorEntry> = new Map();
  private alertBadges: AlertBadge[] = [];
  private readonly REPEAT_WINDOW = 30 * 60 * 1000; // 30 minutes
  private readonly REPEAT_THRESHOLD = 5; // Alert after 5 occurrences

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
    const g = global as any;
    if (g.ErrorUtils) {
      const previousHandler = g.ErrorUtils.getGlobalHandler?.();
      g.ErrorUtils.setGlobalHandler((error: Error, isFatal: boolean) => {
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

    // Track repeated errors
    this.trackRepeatedError(errorMessage, severity);

    // Handle FATAL errors immediately
    if (severity === 'fatal') {
      this.handleFatalError(logEntry);
    }

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

  /**
   * Track repeated errors within a 30-minute window
   */
  private trackRepeatedError(errorMessage: string, severity: string): void {
    const now = Date.now();
    const errorKey = `${errorMessage}`;

    if (this.repeatedErrors.has(errorKey)) {
      const entry = this.repeatedErrors.get(errorKey)!;

      // Clear if outside repeat window
      if (now - entry.firstSeenAt > this.REPEAT_WINDOW) {
        this.repeatedErrors.delete(errorKey);
        this.trackRepeatedError(errorMessage, severity);
        return;
      }

      entry.count++;
      entry.lastSeenAt = now;

      // Alert if threshold exceeded and not already alerted
      if (entry.count >= this.REPEAT_THRESHOLD && !entry.alerted) {
        this.createAlertBadge({
          type: 'repeated-error',
          severity: severity === 'fatal' ? 'critical' : 'warning',
          message: `Error repeated ${entry.count} times in 30 minutes: ${errorMessage}`,
          errorSignature: errorKey,
        });
        entry.alerted = true;
      }
    } else {
      this.repeatedErrors.set(errorKey, {
        error: errorMessage,
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        alerted: false,
      });
    }
  }

  /**
   * Handle FATAL errors - save immediately to Netlify logs
   */
  private async handleFatalError(logEntry: ErrorLog): Promise<void> {
    try {
      const payload = {
        type: 'FATAL_ERROR',
        error: logEntry.error,
        tab: logEntry.tab,
        stack: logEntry.stack,
        timestamp: logEntry.timestamp,
      };

      console.error('[ErrorLogger] FATAL ERROR DETECTED:', payload);

      // Attempt immediate save to Netlify logs
      if (this.isOnline) {
        await fetch(
          'https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/log-fatal-error',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        ).catch((e) => console.warn('[ErrorLogger] Failed to log FATAL error to Netlify:', e));
      }

      // Create critical alert badge
      this.createAlertBadge({
        type: 'fatal-spike',
        severity: 'critical',
        message: `FATAL ERROR: ${logEntry.error}`,
        errorSignature: logEntry.error,
      });
    } catch (e) {
      console.warn('[ErrorLogger] Error handling FATAL error:', e);
    }
  }

  /**
   * Create alert badge for dashboard
   */
  private createAlertBadge(options: Omit<AlertBadge, 'id' | 'timestamp'>): void {
    const badge: AlertBadge = {
      id: `badge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...options,
    };

    this.alertBadges.unshift(badge);

    // Keep only last 50 badges
    if (this.alertBadges.length > 50) {
      this.alertBadges.pop();
    }

    // Save badges to storage
    this.saveAlertBadges();
  }

  private async saveAlertBadges(): Promise<void> {
    try {
      await AsyncStorage.setItem('errorAlertBadges', JSON.stringify(this.alertBadges));
    } catch (e) {
      console.warn('[ErrorLogger] Failed to save alert badges:', e);
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

  getAlertBadgesPublic(): AlertBadge[] {
    return this.alertBadges;
  }

  getRepeatedErrorsPublic(): RepeatedErrorEntry[] {
    return Array.from(this.repeatedErrors.values());
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
    getAlertBadges: () => globalErrorLogger.getAlertBadgesPublic(),
    getRepeatedErrors: () => globalErrorLogger.getRepeatedErrorsPublic(),
  };
}

// Extend GlobalErrorLogger to expose internal properties for the hook
declare global {
  namespace NodeJS {
    interface Global {
      __errorLoggerDebug?: {
        alertBadges: AlertBadge[];
        repeatedErrors: RepeatedErrorEntry[];
      };
    }
  }
}

// Make the properties accessible
Object.defineProperty(globalErrorLogger, 'alertBadges', {
  get() {
    return this.alertBadges || [];
  },
});

Object.defineProperty(globalErrorLogger, 'repeatedErrors', {
  get() {
    return this.repeatedErrors || new Map();
  },
});
