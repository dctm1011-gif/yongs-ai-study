import { Handler } from '@netlify/functions';

interface SyncSource {
  name: string;
  endpoint: string;
  storageKey: string;
}

interface SyncReport {
  timestamp: string;
  sources: Record<string, SyncResult>;
  overallStatus: string;
  successCount: number;
  failureCount: number;
  queuedRetries: string[];
}

interface SyncResult {
  name: string;
  status: 'success' | 'failed' | 'retry_queued';
  itemCount: number;
  checksum?: string;
  error?: string;
}

const SYNC_SOURCES: SyncSource[] = [
  { name: 'English', endpoint: '/api/english-daily', storageKey: 'sync_english' },
  { name: 'TOEFL', endpoint: '/api/toefl-daily', storageKey: 'sync_toefl' },
  { name: 'Papers', endpoint: '/api/papers-daily', storageKey: 'sync_papers' },
  { name: 'Investment', endpoint: '/api/investment-daily', storageKey: 'sync_investment' },
  { name: 'Trends', endpoint: '/api/trends-daily', storageKey: 'sync_trends' },
];

const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';

function calculateChecksum(data: any): string {
  try {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `chk_${Math.abs(hash).toString(36)}`;
  } catch {
    return 'chk_error';
  }
}

async function fetchDataSource(source: SyncSource): Promise<SyncResult> {
  try {
    const response = await fetch(`${NETLIFY_BASE_URL}${source.endpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const checksum = calculateChecksum(data);
    const itemCount = Array.isArray(data) ? data.length : Object.keys(data || {}).length;

    console.log(`✅ Synced ${source.name}: ${itemCount} items`);

    // Store sync metadata
    await storeMetadata(source.storageKey, {
      checksum,
      itemCount,
      lastSyncTime: new Date().toISOString(),
    });

    return {
      name: source.name,
      status: 'success',
      itemCount,
      checksum,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to sync ${source.name}:`, errorMsg);

    return {
      name: source.name,
      status: 'failed',
      itemCount: 0,
      error: errorMsg,
    };
  }
}

async function storeMetadata(
  key: string,
  metadata: { checksum: string; itemCount: number; lastSyncTime: string }
): Promise<void> {
  // Store in environment or file system if needed
  console.log(`Stored metadata for ${key}:`, metadata);
}

async function validateIntegrity(source: SyncSource, data: any): Promise<boolean> {
  try {
    // Basic validation
    if (source.name === 'TOEFL') {
      // Validate TOEFL scores are within range
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.score && (item.score < 0 || item.score > 120)) {
            console.warn(`Invalid TOEFL score: ${item.score}`);
            return false;
          }
        }
      }
    }

    if (source.name === 'Papers') {
      // Validate arXiv IDs
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.arxivId && !/^\d{4}\.\d{5}/.test(item.arxivId)) {
            console.warn(`Invalid arXiv ID: ${item.arxivId}`);
            return false;
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Integrity validation error:', error);
    return false;
  }
}

async function queueFailedItems(source: SyncSource, error: string): Promise<void> {
  try {
    // Queue retry for failed sync
    await fetch(`${NETLIFY_BASE_URL}/api/queue-sync-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: source.name,
        error,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      }),
    }).catch(() => {
      console.log('Failed to queue retry');
    });
  } catch (error) {
    console.error('Failed to queue retry for', source.name, error);
  }
}

const handler: Handler = async () => {
  console.log('Daily sync orchestration started at', new Date().toISOString());

  try {
    const results: Record<string, SyncResult> = {};
    const queuedRetries: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Fetch all data sources in parallel
    const syncPromises = SYNC_SOURCES.map((source) => fetchDataSource(source));
    const syncResults = await Promise.all(syncPromises);

    syncResults.forEach((result) => {
      results[result.name] = result;

      if (result.status === 'success') {
        successCount++;
      } else {
        failureCount++;
        queuedRetries.push(result.name);
      }
    });

    // Queue retries for failed sources
    for (const failedSource of SYNC_SOURCES.filter((s) =>
      syncResults.some((r) => r.name === s.name && r.status === 'failed')
    )) {
      const failedResult = results[failedSource.name];
      await queueFailedItems(failedSource, failedResult.error || 'Unknown error');
    }

    const report: SyncReport = {
      timestamp: new Date().toISOString(),
      sources: results,
      overallStatus: failureCount === 0 ? 'success' : failureCount < successCount ? 'partial' : 'failed',
      successCount,
      failureCount,
      queuedRetries,
    };

    console.log('Daily sync orchestration completed:', report);

    // Notify sync monitor
    await fetch(`${NETLIFY_BASE_URL}/api/sync-orchestration-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => {
      console.log('Failed to send orchestration report');
    });

    return {
      statusCode: 200,
      body: JSON.stringify(report),
    };
  } catch (error) {
    console.error('Daily sync orchestration failed:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Daily sync orchestration failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

export { handler };
