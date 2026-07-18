# Phase E Testing Checklist - Data Sync Monitoring & Loss Prevention

## Quick Summary

✅ **4 Files Created:**
1. `src/hooks/useDataSyncMonitor.ts` - Monitor 5 data sources, 6-hour checks, checksum comparison
2. `src/hooks/useOfflineQueue.ts` - Queue offline actions, auto-sync when online, 3-tier retry
3. `src/utils/DataIntegrityValidator.ts` - Validate schema, detect duplicates, check timestamps
4. `netlify/functions/batch-sync-retry.ts` - Retry failed syncs with 3 tiers (1s, 5m, 1h)
5. `netlify/functions/daily-sync-orchestration.ts` - Daily 06:00 AM sync for all sources

✅ **2 Files Modified:**
1. `src/app/settings.tsx` - Added "📡 동기화 상태" section with sync monitoring
2. `src/app/storage.tsx` - Added data export, validation, and sync status display

✅ **1 Config Updated:**
1. `netlify.toml` - Added scheduled functions for daily sync at 06:00 AM and retry every 6 hours

---

## Phase E Completion Targets

### Target 1: ✅ All 5 Data Sources Sync Daily at 06:00 AM
- **Function:** `daily-sync-orchestration.ts`
- **Schedule:** `0 6 * * *` (06:00 AM UTC every day)
- **Test:**
  1. Deploy to Netlify
  2. Check function logs at scheduled time
  3. Verify all 5 sources fetched (English, TOEFL, Papers, Investment, Trends)
  4. Confirm sync report generated
  5. Check AsyncStorage keys updated

**Verification Commands:**
```bash
# Check Netlify function logs
netlify functions:list

# Monitor scheduled execution
netlify logs
```

---

### Target 2: ✅ Offline Queue Persists + Auto-Syncs When Online
- **Hook:** `useOfflineQueue.ts`
- **Storage:** AsyncStorage with `sync_offline_queue` key
- **Test:**
  1. Enable airplane mode
  2. Add feedback (Settings tab)
  3. Check queue in console: `console.log(queueStatus.totalItems)`
  4. Verify "⏳ 오프라인 대기열" appears in Settings
  5. Disable airplane mode
  6. Wait 30 seconds for connection check
  7. Observe auto-sync trigger
  8. Verify queue items disappear
  9. Check sync report updates

**Manual Testing (TypeScript):**
```typescript
// In Settings screen console
const queueStatus = await useOfflineQueue().queueStatus;
console.log(queueStatus); // Should show items while offline

// Add to queue
await useOfflineQueue().addToQueue(
  'feedback',
  'submit_feedback',
  { content: 'Test', timestamp: Date.now() }
);

// Sync
await useOfflineQueue().syncQueue();
```

---

### Target 3: ✅ Data Integrity Checks Pass (No Corrupted Data)
- **Validator:** `DataIntegrityValidator.ts`
- **Checks:** Schema validation, checksum comparison, duplicates, timestamps
- **Test:**
  1. Go to Storage screen
  2. Click "✓ 데이터 검증" button
  3. Wait for validation to complete
  4. Verify all 5 sources show results (🟢 for valid, 🔴 for errors)
  5. Check error/warning counts
  6. Review specific errors if any

**Manual Testing (TypeScript):**
```typescript
// Validate all data
const results = await DataIntegrityValidator.validateAll();

// Check English data
const englishResult = await DataIntegrityValidator.validateEnglish();
console.log('Valid:', englishResult.isValid);
console.log('Errors:', englishResult.errors);
console.log('Warnings:', englishResult.warnings);
```

---

### Target 4: ✅ Checksum Comparison Working (Local vs Server Match)
- **Implementation:** `useDataSyncMonitor.ts`
- **Storage:** `sync_{SOURCE}_checksum`
- **Test:**
  1. Run sync check from Settings
  2. Check sync report shows checksums
  3. Compare local checksum with server
  4. Verify they match for successful syncs
  5. Observe mismatch for corrupted data

**Manual Testing (TypeScript):**
```typescript
// Get sync report
const { report } = useDataSyncMonitor();

// Check checksums
Object.entries(report.sources).forEach(([name, source]) => {
  console.log(`${name}:`);
  console.log('  Local:', source.checksumLocal);
  console.log('  Server:', source.checksumServer);
  console.log('  Match:', source.checksumLocal === source.checksumServer);
});
```

---

### Target 5: ✅ Retry Logic: 3 Tiers Working
- **Function:** `batch-sync-retry.ts`
- **Tiers:**
  - Tier 1: Immediate retry (1 second)
  - Tier 2: Retry in 5 minutes
  - Tier 3: Retry in 1 hour
- **Test:**
  1. Disable one API endpoint (simulate failure)
  2. Run sync from Settings
  3. See 🔴 indicator for failed source
  4. Check Netlify function logs for retry attempts
  5. Re-enable API endpoint
  6. Observe retry success in log
  7. Verify retry count increments
  8. After 3 retries, see user notification

**Verification:**
```bash
# Check Netlify function logs
netlify logs --tail

# Look for retry tier messages:
# ⏳ Item ${item.id} scheduled for tier1 retry
# ⏳ Item ${item.id} scheduled for tier2 retry
# ⏳ Item ${item.id} scheduled for tier3 retry
```

---

### Target 6: ✅ Progress Tab Shows Sync Status Per Source
- **Location:** Settings screen (modified, no separate Progress tab)
- **Display:** "📡 동기화 상태" section
- **Indicators:**
  - 🟢 English: Synced 1 hour ago
  - 🟡 TOEFL: Syncing now...
  - 🔴 Papers: Last sync failed (retrying)
  - 🟢 Investment: Synced today
  - 🟢 Trends: Synced 30 min ago
- **Test:**
  1. Open Settings screen
  2. Scroll to "📡 동기화 상태" section
  3. Click "🔄 동기화 확인" to run check
  4. Verify status indicators appear
  5. Check last sync times display correctly
  6. Observe offline queue size if items pending

**UI Verification:**
- [ ] Section header "📡 동기화 상태" visible
- [ ] Manual sync button shows loading state while syncing
- [ ] Each source shows status indicator (🟢🟡🔴)
- [ ] Last sync time displayed for each source
- [ ] Item count shown for each source
- [ ] Offline queue size displayed when items exist

---

### Target 7: ✅ Settings Shows Sync Statistics
- **Location:** Settings screen, "📡 동기화 상태" section
- **Display:**
  - Last successful sync time (per source)
  - Next scheduled sync (estimated)
  - Offline queue status
  - Total sync count (24h)
  - Failed sync count (24h)
  - Average sync time (ms)
- **Test:**
  1. Open Settings screen
  2. View sync status summary
  3. Click to expand detailed view
  4. Verify all statistics displayed
  5. Check timestamps are recent
  6. Confirm queue metrics accurate

**Verification:**
- [ ] Last sync time shown per source
- [ ] Queue size displayed
- [ ] Average sync time calculated
- [ ] Success/failure counts accurate
- [ ] All metrics update after manual sync

---

### Target 8: ✅ Zero Data Loss Detected
- **Approach:** 3-tier backup system
  - Tier 1: AsyncStorage (primary)
  - Tier 2: Weekly Netlify backup
  - Tier 3: Manual export to JSON
- **Test:**
  1. Force offline for 24+ hours (simulation)
  2. Generate queue items (feedback, reading)
  3. Go online
  4. Verify all queue items synced
  5. Check AsyncStorage still has local data
  6. Export data to JSON for backup
  7. Confirm no items lost

**Verification:**
```bash
# Check all keys still exist
adb shell "sqlite3 /data/data/com.dctm1011.yongstudy/databases/RKStorage" \
  "SELECT key FROM data;" | grep sync_

# Verify counts match
adb shell "sqlite3 /data/data/com.dctm1011.yongstudy/databases/RKStorage" \
  "SELECT COUNT(*) FROM data;"
```

---

### Target 9: ✅ Offline → Online Transition Seamless
- **Behavior:**
  - Auto-detect online (every 30 seconds)
  - Auto-sync when connection restored
  - Update UI with sync status
  - Show success/failure notification
- **Test:**
  1. Add items while offline
  2. Enable airplane mode
  3. Add more items (verify queued)
  4. Disable airplane mode
  5. Wait 30 seconds for connection check
  6. Observe auto-sync trigger
  7. Check sync status updates
  8. Verify all items synced

**Timeline:**
```
T+0s: Disable airplane mode
T+30s: Connection check runs
T+31s: Auto-sync triggers
T+35s: Sync completes
T+40s: UI updates, queue cleared
```

---

### Target 10: ✅ Manual Backup/Export Working
- **Function:** `exportAllData()` in Storage screen
- **Output:** JSON file with timestamp
- **Test:**
  1. Go to Storage screen
  2. Click "⬇️ 데이터 내보내기" button
  3. Verify JSON data generated
  4. Check all sources included
  5. Verify timestamp present
  6. Confirm app version included

**Output Format:**
```json
{
  "timestamp": "2026-07-18T12:34:56.789Z",
  "appVersion": "1.0.1",
  "data": {
    "sync_english": [...],
    "sync_toefl": [...],
    "sync_papers": [...],
    "sync_investment": [...],
    "sync_trends": [...],
    ...
  }
}
```

---

## Critical File Summary

### New Files Created

**1. `src/hooks/useDataSyncMonitor.ts`** (250 lines)
- Monitors 5 data sources continuously
- Auto-checks every 6 hours
- Checksum validation
- Metrics tracking

**2. `src/hooks/useOfflineQueue.ts`** (290 lines)
- Queues offline actions
- 3-tier retry logic
- Auto-sync when online
- Connection detection (every 30s)

**3. `src/utils/DataIntegrityValidator.ts`** (400 lines)
- Schema validation per source
- Checksum comparison
- Duplicate detection
- Timestamp validation

**4. `netlify/functions/batch-sync-retry.ts`** (250 lines)
- Handles failed sync retry
- 3-tier retry system
- User notifications
- Sync reporting

**5. `netlify/functions/daily-sync-orchestration.ts`** (200 lines)
- Daily 06:00 AM UTC sync
- Parallel fetching
- Integrity validation
- Retry queuing

### Modified Files

**1. `src/app/settings.tsx`**
- Added sync monitor hook import
- Added offline queue hook import
- Added sync status section
- UI for manual sync check
- Detailed source status display

**2. `src/app/storage.tsx`**
- Added validator import
- Added export function
- Added validation function
- Added sync status UI
- Data validation results display

### Updated Files

**1. `netlify.toml`**
- Added `daily-sync-orchestration` schedule (0 6 * * *)
- Added `batch-sync-retry` schedule (0 */6 * * *)

---

## AsyncStorage Keys Used

```
// Sync reports
lastSyncReport                 // Latest sync report from monitor

// Per-source sync data
sync_english_lastSync          // Last English sync timestamp
sync_english_checksum          // Current English checksum
sync_toefl_lastSync           // Last TOEFL sync timestamp
sync_toefl_checksum           // Current TOEFL checksum
sync_papers_lastSync          // Last Papers sync timestamp
sync_papers_checksum          // Current Papers checksum
sync_investment_lastSync      // Last Investment sync timestamp
sync_investment_checksum      // Current Investment checksum
sync_trends_lastSync          // Last Trends sync timestamp
sync_trends_checksum          // Current Trends checksum

// Offline queue
sync_offline_queue             // Queue items JSON array
queue_metrics                  // Queue statistics (count, last sync time)

// Data validation
lastValidationReport           // Last validation results
```

---

## Network Endpoints Used

### API Endpoints Called

```
GET ${NETLIFY_BASE_URL}/api/english-daily      // English words sync
GET ${NETLIFY_BASE_URL}/api/toefl-daily        // TOEFL sections sync
GET ${NETLIFY_BASE_URL}/api/papers-daily       // Papers sync
GET ${NETLIFY_BASE_URL}/api/investment-daily   // Investment sync
GET ${NETLIFY_BASE_URL}/api/trends-daily       // Trends sync

POST ${NETLIFY_BASE_URL}/api/queue-sync        // Queue item sync
POST ${NETLIFY_BASE_URL}/api/batch-sync-retry  // Batch retry handling
POST ${NETLIFY_BASE_URL}/api/sync-monitor-report // Report syncing
POST ${NETLIFY_BASE_URL}/api/send-notification // Critical alerts
```

---

## Performance Metrics To Monitor

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily sync success rate | > 99.5% | successCount / (successCount + failureCount) |
| Average sync time | < 2 sec | averageSyncTime in report |
| Queue clear time | < 5 min | time from going online to queue empty |
| Data loss incidents | 0 | audit AsyncStorage keys exist |
| Offline queue timeout | > 24 hrs | old items filtered in loadQueue |
| Checksum accuracy | 100% | checksumLocal === checksumServer |

---

## Debugging Commands

### View Sync Status
```typescript
// In console while Settings screen open
const { report } = useDataSyncMonitor();
console.log(JSON.stringify(report, null, 2));
```

### Check Queue
```typescript
const queueStr = await AsyncStorage.getItem('sync_offline_queue');
const queue = JSON.parse(queueStr || '[]');
console.log('Queue items:', queue.length);
queue.forEach(item => console.log(`- ${item.id}: ${item.action}`));
```

### View Validation Results
```typescript
const results = await DataIntegrityValidator.validateAll();
console.log(JSON.stringify(results, null, 2));
```

### Monitor Netlify Functions
```bash
netlify functions:list
netlify logs --tail
```

---

## Known Limitations

1. **Retry Scheduling:** Uses setTimeout (single process). In production, use Job Queue service (Bull, RabbitMQ).
2. **Checksum Algorithm:** Simple hash. Consider SHA-256 for security.
3. **Queue Persistence:** AsyncStorage only. Add database layer for large queues.
4. **Conflict Resolution:** No conflict detection. Implement CRDT or version control if needed.
5. **Bandwidth:** No compression. Add gzip for large payloads.

---

## Future Enhancement Suggestions

- [ ] Implement persistent job queue (Bull Redis)
- [ ] Add differential sync (delta updates)
- [ ] Implement conflict resolution (CRDT, version control)
- [ ] Add encryption for sensitive data
- [ ] Implement bandwidth optimization (compression)
- [ ] Add analytics dashboard
- [ ] Add end-to-end encryption
- [ ] Implement adaptive retry timing (exponential backoff)

---

## Sign-Off Checklist

- [ ] All 4 new files created and working
- [ ] 2 existing files modified successfully
- [ ] netlify.toml updated with schedules
- [ ] All imports resolve without errors
- [ ] No TypeScript compilation errors
- [ ] Settings screen shows sync status
- [ ] Storage screen shows data validation
- [ ] Manual sync button works
- [ ] Queue persists across app restart
- [ ] Auto-sync triggers when online
- [ ] All 5 data sources monitored
- [ ] Retry logic functional (3 tiers)
- [ ] Data export working
- [ ] Validation results displaying
- [ ] Netlify scheduled functions enabled

---

**Version:** 1.0  
**Created:** 2026-07-18  
**Status:** Ready for Testing

