import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QueueItem {
  id: string;
  type: 'feedback' | 'reading' | 'preference' | 'custom';
  action: string;
  payload: any;
  timestamp: number;
  retryCount: number;
  lastRetryTime?: number;
  tab?: string;
  version?: number;
  backupData?: any;
}

export interface QueueStatus {
  totalItems: number;
  items: QueueItem[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime?: string;
  failedItems: QueueItem[];
}

interface SyncResult {
  success: boolean;
  itemId: string;
  error?: string;
}

const QUEUE_STORAGE_KEY = 'sync_offline_queue';
const QUEUE_METRICS_KEY = 'queue_metrics';
const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';
const QUEUE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETRIES = 3;

export function useOfflineQueue() {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    totalItems: 0,
    items: [],
    isOnline: true,
    isSyncing: false,
    failedItems: [],
  });

  // Load queue from storage
  const loadQueue = useCallback(async () => {
    try {
      const queueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      const queue = queueStr ? JSON.parse(queueStr) : [];

      // Filter out old items (> 24 hours)
      const now = Date.now();
      const validQueue = queue.filter((item: QueueItem) => now - item.timestamp < QUEUE_TIMEOUT);

      // Remove expired items
      if (validQueue.length < queue.length) {
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(validQueue));
      }

      const failedItems = validQueue.filter((item: QueueItem) => item.retryCount >= MAX_RETRIES);

      setQueueStatus((prev) => ({
        ...prev,
        totalItems: validQueue.length,
        items: validQueue,
        failedItems,
      }));

      return validQueue;
    } catch (error) {
      console.error('Failed to load queue:', error);
      return [];
    }
  }, []);

  // Add item to queue with version tracking
  const addToQueue = useCallback(
    async (
      type: QueueItem['type'],
      action: string,
      payload: any,
      tab?: string,
      version?: number
    ): Promise<string> => {
      try {
        const queueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
        const queue = queueStr ? JSON.parse(queueStr) : [];

        // Get current version if not provided
        const itemVersion = version || (payload?.version || 1);

        const newItem: QueueItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type,
          action,
          payload,
          timestamp: Date.now(),
          retryCount: 0,
          tab,
          version: itemVersion,
        };

        queue.push(newItem);
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));

        // Update metrics
        const baseMetrics = await AsyncStorage.getItem(QUEUE_METRICS_KEY);
        const metrics = baseMetrics ? JSON.parse(baseMetrics) : { totalQueued: 0, totalSynced: 0 };
        metrics.totalQueued = (metrics.totalQueued || 0) + 1;
        await AsyncStorage.setItem(QUEUE_METRICS_KEY, JSON.stringify(metrics));

        // Refresh queue status
        await loadQueue();

        console.log(`✅ Added to queue: ${action} (v${itemVersion}, ID: ${newItem.id})`);
        return newItem.id;
      } catch (error) {
        console.error('Failed to add item to queue:', error);
        throw error;
      }
    },
    [loadQueue]
  );

  // Process sync for a single item with version management
  const syncItem = useCallback(async (item: QueueItem): Promise<SyncResult> => {
    try {
      // Determine endpoint based on type
      let endpoint = '/api/queue-sync';

      if (item.type === 'feedback') {
        endpoint = '/api/app-feedback';
      } else if (item.type === 'reading') {
        endpoint = `/api/reading-progress`;
      } else if (item.type === 'preference') {
        endpoint = '/api/update-preferences';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Include version info in payload for conflict resolution
      const payload = {
        ...item.payload,
        _queueId: item.id,
        _action: item.action,
        _version: item.version || 1,
        _timestamp: new Date(item.timestamp).toISOString(),
      };

      // If backup exists, include it for recovery
      if (item.backupData) {
        payload._backup = item.backupData;
      }

      const response = await fetch(`${NETLIFY_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Log successful sync with version info
      console.log(`✅ Synced ${item.type} (v${item.version || 1}): ${item.action}`);

      return { success: true, itemId: item.id };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Sync failed for ${item.id}: ${errorMsg}`);
      return { success: false, itemId: item.id, error: errorMsg };
    }
  }, []);

  // Process entire queue (retry logic)
  const syncQueue = useCallback(async () => {
    if (queueStatus.isSyncing || !queueStatus.isOnline) {
      return;
    }

    setQueueStatus((prev) => ({ ...prev, isSyncing: true }));

    try {
      const queueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      let queue = queueStr ? JSON.parse(queueStr) : [];

      if (queue.length === 0) {
        setQueueStatus((prev) => ({ ...prev, isSyncing: false }));
        return;
      }

      const results: SyncResult[] = [];

      // Process items with retry logic (Tier 1: immediate)
      for (const item of queue) {
        if (item.retryCount >= MAX_RETRIES) {
          continue; // Skip already failed items
        }

        const result = await syncItem(item);
        results.push(result);

        if (!result.success) {
          // Update retry count
          item.retryCount += 1;
          item.lastRetryTime = Date.now();
        }
      }

      // Remove successfully synced items
      queue = queue.filter((item: QueueItem) => {
        const result = results.find((r) => r.itemId === item.id);
        return result ? !result.success : true;
      });

      // Save updated queue
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));

      // Update metrics
      const metrics = await getMetrics();
      const successCount = results.filter((r) => r.success).length;
      metrics.totalSynced += successCount;
      metrics.lastSyncTime = new Date().toISOString();
      await AsyncStorage.setItem(QUEUE_METRICS_KEY, JSON.stringify(metrics));

      // Reload queue status
      await loadQueue();

      console.log(`✅ Sync completed: ${successCount} items synced, ${queue.length} items remaining`);

      // Post sync report to server
      await fetch(`${NETLIFY_BASE_URL}/api/queue-sync-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          totalProcessed: results.length,
          successCount,
          failureCount: results.filter((r) => !r.success).length,
          remainingInQueue: queue.length,
        }),
      }).catch(() => {
        console.log('Failed to log sync report');
      });
    } catch (error) {
      console.error('Queue sync failed:', error);
    } finally {
      setQueueStatus((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [queueStatus.isSyncing, queueStatus.isOnline, syncItem, loadQueue]);

  // Monitor online/offline status and auto-sync
  useEffect(() => {
    let isCheckingConnection = false;

    const checkConnection = async () => {
      if (isCheckingConnection) return;
      isCheckingConnection = true;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(NETLIFY_BASE_URL, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const isOnline = response.ok || response.status === 404; // 404 means server is reachable

        setQueueStatus((prev) => {
          const wasOffline = !prev.isOnline;
          const nowOnline = isOnline;

          // Auto-sync when coming back online
          if (wasOffline && nowOnline) {
            console.log('📡 Back online - syncing queue...');
            setTimeout(() => {
              syncQueue();
            }, 1000);
          }

          return { ...prev, isOnline: isOnline };
        });
      } catch (error) {
        console.log('Connection check failed:', error);
        setQueueStatus((prev) => ({ ...prev, isOnline: false }));
      } finally {
        isCheckingConnection = false;
      }
    };

    // Initial check
    checkConnection();

    // Check connection every 30 seconds
    const intervalId = setInterval(checkConnection, 30000);

    return () => clearInterval(intervalId);
  }, [syncQueue]);

  // Load queue on mount
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Get detailed metrics with queue information
  const getMetrics = useCallback(async () => {
    try {
      const metricsStr = await AsyncStorage.getItem(QUEUE_METRICS_KEY);
      const metrics = metricsStr
        ? JSON.parse(metricsStr)
        : { totalQueued: 0, totalSynced: 0, lastSyncTime: null };

      // Add queue details
      const queueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      const queue = queueStr ? JSON.parse(queueStr) : [];

      return {
        ...metrics,
        queueDetails: {
          totalItems: queue.length,
          byType: queue.reduce((acc: Record<string, number>, item: QueueItem) => {
            acc[item.type] = (acc[item.type] || 0) + 1;
            return acc;
          }, {}),
          failedItems: queue.filter((item: QueueItem) => item.retryCount >= MAX_RETRIES).length,
          averageRetries: queue.length > 0
            ? Math.round(queue.reduce((sum: number, item: QueueItem) => sum + item.retryCount, 0) / queue.length)
            : 0,
        },
      };
    } catch {
      return {
        totalQueued: 0,
        totalSynced: 0,
        lastSyncTime: null,
        queueDetails: { totalItems: 0, byType: {}, failedItems: 0, averageRetries: 0 },
      };
    }
  }, []);

  // Remove item from queue
  const removeFromQueue = useCallback(async (itemId: string) => {
    try {
      const queueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      let queue = queueStr ? JSON.parse(queueStr) : [];
      queue = queue.filter((item: QueueItem) => item.id !== itemId);
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      await loadQueue();
    } catch (error) {
      console.error('Failed to remove item:', error);
    }
  }, [loadQueue]);

  // Clear all queue
  const clearQueue = useCallback(async () => {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify([]));
      await loadQueue();
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  }, [loadQueue]);

  return {
    queueStatus,
    addToQueue,
    syncQueue,
    removeFromQueue,
    clearQueue,
    loadQueue,
    getMetrics,
  };
}
