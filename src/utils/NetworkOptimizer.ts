/**
 * Network Request Optimizer
 * Handles request batching, retry logic, timeout, and connection pooling
 */

interface PendingRequest {
  key: string;
  url: string;
  options?: RequestInit;
  priority: number;
  timestamp: number;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

interface RequestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  batchedRequests: number;
  averageResponseTime: number;
  totalBandwidthSaved: number;
}

export class NetworkOptimizer {
  private static instance: NetworkOptimizer;
  private requestQueue: PendingRequest[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchInterval = 100; // milliseconds - batching window
  private maxBatchSize = 5; // max requests per batch
  private maxRetries = 3;
  private retryDelay = 1000; // milliseconds
  private requestTimeout = 10000; // milliseconds (10 seconds)
  private abortControllers: Map<string, AbortController> = new Map();
  private stats: RequestStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    batchedRequests: 0,
    averageResponseTime: 0,
    totalBandwidthSaved: 0,
  };
  private requestTimes: number[] = [];
  private isProcessing = false;

  private constructor() {}

  static getInstance(): NetworkOptimizer {
    if (!NetworkOptimizer.instance) {
      NetworkOptimizer.instance = new NetworkOptimizer();
    }
    return NetworkOptimizer.instance;
  }

  /**
   * Fetch with automatic batching and retry logic
   */
  async fetch<T>(
    url: string,
    key?: string,
    priority: number = 0,
    options?: RequestInit
  ): Promise<T> {
    const requestKey = key || url;
    this.stats.totalRequests++;

    return new Promise((resolve, reject) => {
      const request: PendingRequest = {
        key: requestKey,
        url,
        options,
        priority: priority,
        timestamp: Date.now(),
        resolve,
        reject,
      };

      this.requestQueue.push(request);
      this.sortQueueByPriority();
      this.scheduleBatch();
    });
  }

  /**
   * Cancel pending request
   */
  cancelRequest(key: string): void {
    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
    }

    // Remove from queue
    this.requestQueue = this.requestQueue.filter(req => req.key !== key);
  }

  /**
   * Get network statistics
   */
  getStats(): RequestStats {
    const avgTime = this.requestTimes.length > 0
      ? this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length
      : 0;

    return {
      ...this.stats,
      averageResponseTime: avgTime,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      batchedRequests: 0,
      averageResponseTime: 0,
      totalBandwidthSaved: 0,
    };
    this.requestTimes = [];
  }

  /**
   * Private: Schedule batch processing with debouncing
   */
  private scheduleBatch(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    if (this.isProcessing) return;

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.batchInterval);
  }

  /**
   * Private: Process batched requests
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) return;

    this.isProcessing = true;

    try {
      const batchSize = Math.min(this.maxBatchSize, this.requestQueue.length);
      const batch = this.requestQueue.splice(0, batchSize);
      this.stats.batchedRequests += batch.length;

      const startTime = Date.now();

      // Execute batch requests in parallel
      const promises = batch.map(request =>
        this.executeRequestWithRetry(request)
      );

      await Promise.allSettled(promises);

      const responseTime = Date.now() - startTime;
      this.requestTimes.push(responseTime);

      // Keep only last 100 response times for average calculation
      if (this.requestTimes.length > 100) {
        this.requestTimes.shift();
      }
    } finally {
      this.isProcessing = false;

      // Process remaining requests
      if (this.requestQueue.length > 0) {
        this.scheduleBatch();
      }
    }
  }

  /**
   * Private: Execute single request with retry logic
   */
  private async executeRequestWithRetry(request: PendingRequest): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s
          await this.delay(this.retryDelay * Math.pow(2, attempt - 1));
        }

        const result = await this.executeRequest(request);
        this.stats.successfulRequests++;
        request.resolve(result);
        return;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (
          error instanceof Error &&
          error.message.includes('HTTP 4')
        ) {
          break;
        }

        // Don't retry if request was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          break;
        }
      }
    }

    this.stats.failedRequests++;
    request.reject(lastError || new Error('Request failed'));
  }

  /**
   * Private: Execute single HTTP request with timeout
   */
  private async executeRequest(request: PendingRequest): Promise<any> {
    const controller = new AbortController();
    this.abortControllers.set(request.key, controller);

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.requestTimeout);

    try {
      const response = await fetch(request.url, {
        ...request.options,
        signal: controller.signal,
        // Enable compression if supported
        headers: {
          ...request.options?.headers,
          'Accept-Encoding': 'gzip, deflate',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timeoutId);
      this.abortControllers.delete(request.key);
    }
  }

  /**
   * Private: Delay for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Private: Sort queue by priority (higher priority first)
   */
  private sortQueueByPriority(): void {
    this.requestQueue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.timestamp - b.timestamp; // Older requests first
    });
  }
}

export const networkOptimizer = NetworkOptimizer.getInstance();
