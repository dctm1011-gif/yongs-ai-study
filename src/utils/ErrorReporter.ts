export interface ErrorReport {
  id: string;
  timestamp: string;
  tab: string;
  error: string;
  stack?: string;
  severity: 'warning' | 'error' | 'fatal';
  metadata?: Record<string, any>;
}

export interface ErrorBatch {
  id: string;
  errors: ErrorReport[];
  createdAt: string;
  count: number;
}

export class ErrorReporter {
  private errors: ErrorReport[] = [];
  private maxErrors = 500;
  private flushCallback: ((batch: ErrorBatch) => Promise<void>) | null = null;

  /**
   * Log an error with metadata
   */
  log(
    tab: string,
    error: string | Error,
    severity: 'warning' | 'error' | 'fatal' = 'error',
    metadata?: Record<string, any>
  ): ErrorReport {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const report: ErrorReport = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      tab,
      error: errorMessage,
      stack,
      severity,
      metadata,
    };

    this.errors.push(report);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // Remove oldest error
    }

    return report;
  }

  /**
   * Get all logged errors
   */
  getAll(): ErrorReport[] {
    return [...this.errors];
  }

  /**
   * Get errors by tab
   */
  getByTab(tab: string): ErrorReport[] {
    return this.errors.filter((e) => e.tab === tab);
  }

  /**
   * Get errors by severity
   */
  getBySeverity(severity: 'warning' | 'error' | 'fatal'): ErrorReport[] {
    return this.errors.filter((e) => e.severity === severity);
  }

  /**
   * Get errors in time range
   */
  getInTimeRange(startTime: Date, endTime: Date): ErrorReport[] {
    const start = startTime.getTime();
    const end = endTime.getTime();

    return this.errors.filter((e) => {
      const time = new Date(e.timestamp).getTime();
      return time >= start && time <= end;
    });
  }

  /**
   * Get top N most common errors
   */
  getTopErrors(limit: number = 10): Array<{ error: string; count: number }> {
    const grouped: Record<string, number> = {};

    this.errors.forEach((e) => {
      grouped[e.error] = (grouped[e.error] || 0) + 1;
    });

    return Object.entries(grouped)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([error, count]) => ({ error, count }));
  }

  /**
   * Create a batch and optionally flush
   */
  createBatch(): ErrorBatch {
    return {
      id: this.generateId(),
      errors: [...this.errors],
      createdAt: new Date().toISOString(),
      count: this.errors.length,
    };
  }

  /**
   * Flush errors using registered callback
   */
  async flush(): Promise<boolean> {
    if (!this.flushCallback || this.errors.length === 0) {
      return false;
    }

    const batch = this.createBatch();

    try {
      await this.flushCallback(batch);
      this.clear();
      return true;
    } catch (error) {
      console.warn('[ErrorReporter] Flush failed:', error);
      return false;
    }
  }

  /**
   * Register flush callback
   */
  setFlushCallback(callback: (batch: ErrorBatch) => Promise<void>): void {
    this.flushCallback = callback;
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Get statistics
   */
  getStats() {
    const byTab: Record<string, number> = {};
    const bySeverity = { warning: 0, error: 0, fatal: 0 };
    const byHour: Record<string, number> = {};

    this.errors.forEach((e) => {
      byTab[e.tab] = (byTab[e.tab] || 0) + 1;
      bySeverity[e.severity]++;

      const hour = new Date(e.timestamp).getHours();
      const key = `${hour}:00`;
      byHour[key] = (byHour[key] || 0) + 1;
    });

    return {
      total: this.errors.length,
      byTab,
      bySeverity,
      byHour,
      topErrors: this.getTopErrors(5),
    };
  }

  private generateId(): string {
    return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const errorReporter = new ErrorReporter();
