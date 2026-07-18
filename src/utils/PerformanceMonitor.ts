import AsyncStorage from '@react-native-async-storage/async-storage';

interface PerformanceMetric {
  tabName: string;
  loadTime: number; // milliseconds
  timestamp: number;
  isCached: boolean;
  cacheHit?: boolean;
}

interface PerformanceSummary {
  avgLoadTime: number;
  minLoadTime: number;
  maxLoadTime: number;
  cacheHitRate: number;
  totalMeasurements: number;
  measurements: PerformanceMetric[];
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private readonly MAX_METRICS = 1000; // Store last 1000 measurements
  private startTimes: Map<string, number> = new Map();

  private constructor() {
    this.loadMetrics();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing for a tab
   */
  startTiming(tabName: string): void {
    this.startTimes.set(tabName, Date.now());
  }

  /**
   * End timing and record metric
   */
  recordMetric(
    tabName: string,
    isCached: boolean = false,
    cacheHit: boolean = false
  ): PerformanceMetric {
    const startTime = this.startTimes.get(tabName) || Date.now();
    const loadTime = Date.now() - startTime;

    const metric: PerformanceMetric = {
      tabName,
      loadTime,
      timestamp: Date.now(),
      isCached,
      cacheHit,
    };

    this.metrics.push(metric);

    // Keep only last MAX_METRICS
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    this.startTimes.delete(tabName);
    this.saveMetrics();

    console.log(
      `📊 Performance: ${tabName} loaded in ${loadTime}ms (${isCached ? 'cached' : 'fresh'}, cache-hit: ${cacheHit})`
    );

    return metric;
  }

  /**
   * Get performance summary for a specific tab
   */
  getSummary(tabName?: string): PerformanceSummary {
    const relevantMetrics = tabName
      ? this.metrics.filter(m => m.tabName === tabName)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        avgLoadTime: 0,
        minLoadTime: 0,
        maxLoadTime: 0,
        cacheHitRate: 0,
        totalMeasurements: 0,
        measurements: [],
      };
    }

    const loadTimes = relevantMetrics.map(m => m.loadTime);
    const cacheHits = relevantMetrics.filter(m => m.cacheHit).length;

    return {
      avgLoadTime: loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length,
      minLoadTime: Math.min(...loadTimes),
      maxLoadTime: Math.max(...loadTimes),
      cacheHitRate: (cacheHits / relevantMetrics.length) * 100,
      totalMeasurements: relevantMetrics.length,
      measurements: relevantMetrics.slice(-50), // Last 50 measurements
    };
  }

  /**
   * Get all performance summaries by tab
   */
  getAllSummaries(): Record<string, PerformanceSummary> {
    const tabs = Array.from(new Set(this.metrics.map(m => m.tabName)));
    const summaries: Record<string, PerformanceSummary> = {};

    for (const tab of tabs) {
      summaries[tab] = this.getSummary(tab);
    }

    return summaries;
  }

  /**
   * Check if performance meets target (< 500ms)
   */
  meetsTarget(targetMs: number = 500): Record<string, boolean> {
    const summaries = this.getAllSummaries();
    const results: Record<string, boolean> = {};

    for (const [tab, summary] of Object.entries(summaries)) {
      results[tab] = summary.avgLoadTime < targetMs;
    }

    return results;
  }

  /**
   * Get performance warning if any tab exceeds target
   */
  getWarnings(targetMs: number = 500): string[] {
    const summaries = this.getAllSummaries();
    const warnings: string[] = [];

    for (const [tab, summary] of Object.entries(summaries)) {
      if (summary.avgLoadTime > targetMs) {
        warnings.push(
          `⚠️ ${tab}: avg ${summary.avgLoadTime.toFixed(0)}ms (target: ${targetMs}ms)`
        );
      }
    }

    return warnings;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.startTimes.clear();
    AsyncStorage.removeItem('performance_metrics').catch(console.error);
  }

  /**
   * Private: Load metrics from storage
   */
  private async loadMetrics(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('performance_metrics');
      if (stored) {
        this.metrics = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load performance metrics:', error);
    }
  }

  /**
   * Private: Save metrics to storage
   */
  private async saveMetrics(): Promise<void> {
    try {
      await AsyncStorage.setItem('performance_metrics', JSON.stringify(this.metrics));
    } catch (error) {
      console.error('Failed to save performance metrics:', error);
    }
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * React hook for performance monitoring
 */
import { useEffect } from 'react';

export function usePerformanceMonitor(tabName: string) {
  useEffect(() => {
    const startTime = Date.now();
    performanceMonitor.startTiming(tabName);

    return () => {
      // Called when component unmounts
      const loadTime = Date.now() - startTime;
      if (loadTime > 100) { // Only record if it took meaningful time
        performanceMonitor.recordMetric(tabName, false, false);
      }
    };
  }, [tabName]);

  return {
    getSummary: (tab?: string) => performanceMonitor.getSummary(tab),
    getAllSummaries: () => performanceMonitor.getAllSummaries(),
  };
}
