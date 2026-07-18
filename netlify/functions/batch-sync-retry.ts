import { Handler } from '@netlify/functions';

interface SyncItem {
  id: string;
  type: string;
  action: string;
  payload: any;
  retryCount: number;
  lastRetryTime?: number;
}

interface RetryRequest {
  items: SyncItem[];
  timestamp: string;
}

interface RetryResponse {
  success: boolean;
  processed: number;
  successful: number;
  failed: number;
  retries: Record<string, RetryResult>;
  timestamp: string;
}

interface RetryResult {
  itemId: string;
  status: 'success' | 'retry_tier_2' | 'retry_tier_3' | 'max_retries_exceeded';
  retryCount: number;
  nextRetryTime?: number;
  error?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = {
  tier1: 1000, // 1 second (immediate retry)
  tier2: 5 * 60 * 1000, // 5 minutes
  tier3: 60 * 60 * 1000, // 1 hour
};

// Store for tracking failed syncs (in production, use a persistent store)
const failedSyncsStore: Map<string, SyncItem> = new Map();

async function syncItemToEndpoint(item: SyncItem): Promise<boolean> {
  try {
    // Determine endpoint based on type
    let endpoint = '/api/queue-sync';

    if (item.type === 'feedback') {
      endpoint = 'https://illustrious-cuchufli-7c4e58.netlify.app/api/app-feedback';
    } else if (item.type === 'reading') {
      endpoint = `https://illustrious-cuchufli-7c4e58.netlify.app/api/reading-progress`;
    } else if (item.type === 'preference') {
      endpoint = 'https://illustrious-cuchufli-7c4e58.netlify.app/api/update-preferences';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...item.payload,
        _queueId: item.id,
        _action: item.action,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error(`Sync failed for item ${item.id}:`, error);
    return false;
  }
}

function getNextRetryTime(retryCount: number): number | null {
  if (retryCount === 0) {
    return Date.now() + RETRY_DELAYS.tier1;
  } else if (retryCount === 1) {
    return Date.now() + RETRY_DELAYS.tier2;
  } else if (retryCount === 2) {
    return Date.now() + RETRY_DELAYS.tier3;
  }
  return null;
}

function getRetryTier(retryCount: number): string {
  if (retryCount === 0) return 'tier1';
  if (retryCount === 1) return 'tier2';
  if (retryCount === 2) return 'tier3';
  return 'exhausted';
}

async function notifyUserOfFailure(item: SyncItem, errorMsg: string): Promise<void> {
  try {
    // Send push notification to user
    await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'sync_failed',
        title: 'Sync Failed',
        message: `Failed to sync ${item.type} after 3 retries: ${errorMsg}`,
        itemId: item.id,
        severity: 'critical',
      }),
    }).catch((err) => {
      console.warn('Failed to send notification:', err);
    });
  } catch (error) {
    console.error('Error sending user notification:', error);
  }
}

const handler: Handler = async (event) => {
  console.log('Batch sync retry started');

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const request: RetryRequest = JSON.parse(event.body || '{}');

    if (!Array.isArray(request.items) || request.items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No items to process' }),
      };
    }

    const retries: Record<string, RetryResult> = {};
    let successful = 0;
    let failed = 0;

    for (const item of request.items) {
      console.log(`Processing item ${item.id} (retry count: ${item.retryCount})`);

      if (item.retryCount >= MAX_RETRIES) {
        // Max retries exceeded
        retries[item.id] = {
          itemId: item.id,
          status: 'max_retries_exceeded',
          retryCount: item.retryCount,
        };

        failed++;

        // Notify user of critical failure
        await notifyUserOfFailure(item, 'Maximum retries exceeded');
        continue;
      }

      // Attempt sync
      const syncSuccess = await syncItemToEndpoint(item);

      if (syncSuccess) {
        retries[item.id] = {
          itemId: item.id,
          status: 'success',
          retryCount: item.retryCount,
        };
        successful++;
        console.log(`✅ Item ${item.id} synced successfully`);
      } else {
        // Determine retry tier
        const nextRetryTime = getNextRetryTime(item.retryCount);
        const tier = getRetryTier(item.retryCount);

        if (item.retryCount === 0) {
          retries[item.id] = {
            itemId: item.id,
            status: 'retry_tier_2',
            retryCount: item.retryCount + 1,
            nextRetryTime,
          };
        } else if (item.retryCount === 1) {
          retries[item.id] = {
            itemId: item.id,
            status: 'retry_tier_3',
            retryCount: item.retryCount + 1,
            nextRetryTime,
          };
        } else {
          retries[item.id] = {
            itemId: item.id,
            status: 'max_retries_exceeded',
            retryCount: item.retryCount + 1,
          };
          failed++;
          await notifyUserOfFailure(item, `Tier ${tier} retry exhausted`);
          continue;
        }

        failed++;
        console.log(`⏳ Item ${item.id} scheduled for ${tier} retry at ${new Date(nextRetryTime).toISOString()}`);
      }
    }

    // Schedule tier 2 and tier 3 retries
    const tier2Items = request.items.filter((item) => item.retryCount === 0 && !retries[item.id]?.status?.includes('success'));
    const tier3Items = request.items.filter((item) => item.retryCount === 1 && !retries[item.id]?.status?.includes('success'));

    // In production, use a job queue (e.g., Bull, RabbitMQ) to schedule these
    if (tier2Items.length > 0) {
      setTimeout(async () => {
        console.log(`[Tier 2] Retrying ${tier2Items.length} items in 5 minutes`);
        // Retry tier 2 items
        for (const item of tier2Items) {
          item.retryCount = 1;
          item.lastRetryTime = Date.now();
          await syncItemToEndpoint(item);
        }
      }, RETRY_DELAYS.tier2);
    }

    if (tier3Items.length > 0) {
      setTimeout(async () => {
        console.log(`[Tier 3] Retrying ${tier3Items.length} items in 1 hour`);
        // Retry tier 3 items
        for (const item of tier3Items) {
          item.retryCount = 2;
          item.lastRetryTime = Date.now();
          await syncItemToEndpoint(item);
        }
      }, RETRY_DELAYS.tier3);
    }

    const response: RetryResponse = {
      success: failed === 0,
      processed: request.items.length,
      successful,
      failed,
      retries,
      timestamp: new Date().toISOString(),
    };

    console.log(`Batch sync retry completed: ${successful} successful, ${failed} failed`);

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Batch sync retry error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

export { handler };
