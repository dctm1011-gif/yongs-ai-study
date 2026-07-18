# Data Synchronization Monitoring & Loss-Prevention System

## Overview

The YongStudy app now includes a comprehensive data synchronization monitoring system with offline queue support and data integrity validation. This guide explains all components and how to use them.

## Components

### 1. useDataSyncMonitor Hook (`src/hooks/useDataSyncMonitor.ts`)

Monitors sync status of all 5 data sources every 6 hours.

**Features:**
- Track 5 data sources: English, TOEFL, Papers, Investment, Trends
- Checksum comparison (local vs server)
- Automatic 6-hour checks
- Manual refresh available
- Sync metrics tracking

**Usage:**
```typescript
const { report, isMonitoring, runSyncCheck, metrics } = useDataSyncMonitor();

// Manually trigger sync check
await runSyncCheck();

// Access sync report
if (report) {
  console.log(`Success: ${report.successCount}/${report.sources.length}`);
}
```

**Report Structure:**
```typescript
{
  timestamp: string,
  sources: {
    [sourceName]: {
      name: string,
      status: 'synced' | 'syncing' | 'failed',
      lastSyncTime: string,
      itemCount: number,
      errorMessage?: string
    }
  },
  overallStatus: 'success' | 'partial' | 'failed',
  successCount: number,
  failureCount: number,
  averageSyncTime: number (ms),
  queueSize: number
}
```

### 2. useOfflineQueue Hook (`src/hooks/useOfflineQueue.ts`)

Manages offline data operations and queues them for sync.

**Features:**
- Queue user inputs when offline (feedback, reading progress, preferences)
- Auto-persist to AsyncStorage
- Auto-sync when online (batch + retry)
- 3 retry tiers with configurable delays
- 24-hour queue timeout
- Queue status monitoring

**Usage:**
```typescript
const { queueStatus, addToQueue, syncQueue, clearQueue } = useOfflineQueue();

// Add item to queue
const itemId = await addToQueue('feedback', 'submit_feedback', {
  content: 'User feedback text',
  timestamp: Date.now()
});

// View queue status
console.log(`Queue: ${queueStatus.totalItems} items, Online: ${queueStatus.isOnline}`);

// Manual sync
await syncQueue();

// Clear all queue
await clearQueue();
```

**Queue Item Structure:**
```typescript
{
  id: string,
  type: 'feedback' | 'reading' | 'preference' | 'custom',
  action: string,
  payload: any,
  timestamp: number,
  retryCount: number,
  lastRetryTime?: number,
  tab?: string
}
```

### 3. DataIntegrityValidator (`src/utils/DataIntegrityValidator.ts`)

Validates data structure and integrity for all data sources.

**Features:**
- Schema validation per data source
- Checksum comparison
- Duplicate detection
- Timestamp validation
- Custom validation rules

**Usage:**
```typescript
import { DataIntegrityValidator } from '../utils/DataIntegrityValidator';

// Validate specific source
const englishResult = await DataIntegrityValidator.validateEnglish();

// Validate all sources
const allResults = await DataIntegrityValidator.validateAll();

// Check validation result
if (englishResult.isValid) {
  console.log('✅ English data is valid');
} else {
  console.log('❌ Errors:', englishResult.errors);
  console.log('⚠️ Warnings:', englishResult.warnings);
}
```

**Validation Result:**
```typescript
{
  isValid: boolean,
  errors: string[],
  warnings: string[],
  duplicates: any[],
  checksumMatch: boolean
}
```

### 4. Batch Sync Retry Function (`netlify/functions/batch-sync-retry.ts`)

Netlify serverless function that handles retry logic for failed syncs.

**Features:**
- 3-tier retry system:
  - Tier 1: Immediate retry (1 second delay)
  - Tier 2: Retry in 5 minutes
  - Tier 3: Retry in 1 hour
- Max 3 retries per item
- User notification on critical failures
- Sync report logging

**Endpoint:** `POST /api/batch-sync-retry`

**Request Body:**
```typescript
{
  items: [
    {
      id: string,
      type: string,
      action: string,
      payload: any,
      retryCount: number
    }
  ],
  timestamp: string
}
```

**Response:**
```typescript
{
  success: boolean,
  processed: number,
  successful: number,
  failed: number,
  retries: Record<string, RetryResult>,
  timestamp: string
}
```

### 5. Daily Sync Orchestration (`netlify/functions/daily-sync-orchestration.ts`)

Scheduled function that runs daily at 06:00 AM UTC to sync all data sources.

**Features:**
- Fetches all 5 data sources in parallel
- Validates data integrity
- Queues failed items for retry
- Generates sync report
- Logs to server

**Schedule:** 0 6 * * * (Daily 06:00 AM UTC)

**Report Output:**
```typescript
{
  timestamp: string,
  sources: Record<string, SyncResult>,
  overallStatus: 'success' | 'partial' | 'failed',
  successCount: number,
  failureCount: number,
  queuedRetries: string[]
}
```

## UI Integration

### Settings Screen
- New "📡 동기화 상태" section
- Manual "🔄 동기화 확인" button
- Detailed sync status per data source
- Real-time queue size display
- Offline queue status indicator

### Storage Screen
- Manual "🔄 동기화 상태 확인" button
- Data validation button ("✓ 데이터 검증")
- Data export button ("⬇️ 데이터 내보내기")
- Detailed sync status display
- Validation results per source

## Testing Checklist

### 1. All 5 Data Sources Syncing
- [ ] Check AsyncStorage keys exist for all 5 sources
- [ ] Verify checksum comparison working
- [ ] Confirm items counted correctly

### 2. Offline Mode
- [ ] Enable airplane mode
- [ ] Add feedback/reading progress
- [ ] Verify items appear in offline queue
- [ ] Check queue size in UI

### 3. Online Transition
- [ ] Disable airplane mode
- [ ] Observe auto-sync trigger
- [ ] Verify queue items disappear
- [ ] Check sync report updates

### 4. Retry Logic
- [ ] Disable one API endpoint
- [ ] See 🔴 indicator in Settings
- [ ] Verify retry attempts in Netlify logs
- [ ] Observe queue handling

### 5. Data Integrity
- [ ] Run validation from Storage screen
- [ ] Verify schema checks pass
- [ ] Check duplicate detection
- [ ] Confirm timestamp validation

### 6. Sync Statistics
- [ ] Check last sync time per source
- [ ] Verify average sync time calculation
- [ ] Confirm 24-hour sync count
- [ ] Check failed sync count

### 7. Manual Export
- [ ] Click "데이터 내보내기" button
- [ ] Verify JSON data generation
- [ ] Confirm all sources included

### 8. Scheduled Sync
- [ ] Check Netlify logs at 06:00 AM UTC
- [ ] Verify all 5 sources fetched
- [ ] Confirm integrity checks run
- [ ] Check retry queue formation

### 9. Data Loss Prevention
- [ ] Force offline for 24+ hours
- [ ] Generate queue items
- [ ] Go online
- [ ] Verify sync completes in < 1 minute

### 10. Queue Management
- [ ] Queue multiple items
- [ ] Verify persistent storage
- [ ] Check retry count increments
- [ ] Confirm max retry handling

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Daily sync success rate | > 99.5% | TBD |
| Average sync time | < 2 sec | TBD |
| Queue clear time | < 5 min | TBD |
| Data loss incidents | 0 | TBD |
| Offline queue timeout | > 24 hrs | TBD |
| Checksum accuracy | 100% | TBD |

## AsyncStorage Keys

Sync-related keys stored in AsyncStorage:

```
// Sync reports
lastSyncReport                 // Latest sync report
sync_{SOURCE}_lastSync         // Last sync time per source
sync_{SOURCE}_checksum         // Checksum of latest data
sync_{SOURCE}_checksum_cache   // Cached checksum for comparison

// Offline queue
sync_offline_queue             // Current queue items
queue_metrics                  // Queue statistics

// Health checks
lastHealthCheck                // Latest health check report

// Feedback
app_feedback                   // User feedback list
```

## Monitoring Dashboard Integration

The system sends data to the dashboard for display:

**Endpoint:** `POST /api/sync-monitor-report`

**Payload:**
```typescript
{
  timestamp: string,
  sources: Record<string, SyncSource>,
  overallStatus: string,
  successCount: number,
  failureCount: number,
  averageSyncTime: number,
  queueSize: number
}
```

## Troubleshooting

### Queue Not Clearing
1. Check internet connection (connection test in 30-second interval)
2. Verify API endpoints are accessible
3. Check Netlify function logs for errors
4. Review queue items for invalid payloads

### Data Integrity Failures
1. Check AsyncStorage quota (Android: 6MB, iOS: Unlimited)
2. Verify schema against expected format
3. Check for timestamp issues (future dates)
4. Validate URL formats for URLs fields

### Sync Report Not Updating
1. Verify scheduled functions enabled in netlify.toml
2. Check Netlify deployment logs
3. Ensure API endpoints respond correctly
4. Check network connectivity

### High Retry Count
1. Monitor API endpoint health
2. Check server response times
3. Verify payload size (should be < 1MB)
4. Review network latency

## Best Practices

1. **Offline-First Design**
   - Always assume offline operation possible
   - Queue all write operations
   - Sync when connection restored

2. **Data Validation**
   - Run validation on app startup
   - Check checksums before processing
   - Detect duplicates early

3. **Monitoring**
   - Review sync reports daily
   - Check queue metrics regularly
   - Monitor API response times

4. **Error Handling**
   - Implement exponential backoff
   - Notify user of sync failures
   - Provide manual sync option

5. **User Communication**
   - Show sync status in UI
   - Display queue size when items pending
   - Alert on critical failures

## Future Improvements

- [ ] Implement persistent job queue (e.g., Bull)
- [ ] Add analytics dashboard
- [ ] Implement conflict resolution
- [ ] Add differential sync (delta updates)
- [ ] Implement end-to-end encryption
- [ ] Add bandwidth optimization
- [ ] Implement adaptive retry timing

---

**Version:** 1.0  
**Last Updated:** 2026-07-18  
**Status:** Production Ready

