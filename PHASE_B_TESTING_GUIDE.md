# Phase B: Error Logging & Monitoring System - Testing Guide

## Overview
This document provides comprehensive testing procedures for the error logging and auto-recovery system implemented in Phase B.

## System Components

### 1. Core Hooks
- **useErrorLogger.ts** - Global error logger with batching and offline queue support
- **useAutoRecovery.ts** - 3-tier auto-recovery mechanism
- **useErrorLog.ts** (existing) - Legacy error logging (kept for backward compatibility)

### 2. Utilities
- **ErrorReporter.ts** - Error aggregation and batch management
- **RecoveryStrategies.ts** - Recovery strategies for different error types

### 3. Netlify Functions
- **log-error.mjs** - Error log ingestion endpoint
- **get-error-stats.mjs** - Error statistics and trends endpoint

### 4. Dashboard
- **public/dashboard.html** - Real-time error monitoring dashboard

### 5. Modified Files
- **src/app/_layout.tsx** - Initialize error logger on app start
- **src/app/settings.tsx** - Added Debug Mode toggle

---

## Testing Procedures

### Test 1: Global Error Logging

**Objective:** Verify that errors are captured globally and logged correctly.

**Steps:**
1. Start the app
2. In Settings tab, verify "🐛 디버그 모드" section appears
3. Toggle Debug Mode ON
4. Go to Storage tab and check AsyncStorage
5. Look for 'errorLogs' key (should be empty initially)

**Expected Result:**
- Debug Mode toggle works
- errorLogs AsyncStorage key is initialized

---

### Test 2: Error Capture & Logging

**Objective:** Test that errors thrown in tabs are captured and logged.

**Steps:**

#### 2.1 Create Intentional Error in English Tab
1. Navigate to English tab
2. Add a test error by creating/triggering an exception:
   ```
   Example: Call undefined function or JSON.parse invalid data
   ```
3. Go to Settings → Error Logs
4. Verify error appears in the list

**Expected Result:**
- Error is captured with: tab, timestamp, severity, error message, stack trace
- Error appears in AsyncStorage errorLogs
- Error is timestamped correctly

#### 2.2 Multiple Errors
1. Trigger 5+ errors in different tabs (English, TOEFL, Papers, Play, Storage)
2. Check Settings → Error Logs
3. Verify all 5 errors are listed
4. Check that batch sending is triggered (every 5 errors or 5 minutes)

**Expected Result:**
- All errors are captured
- Errors sent to Netlify in batch (check browser console for POST requests)

---

### Test 3: Offline Error Queuing

**Objective:** Verify errors are queued when offline and synced when online.

**Steps:**

#### 3.1 Enable Airplane Mode
1. Enable Airplane Mode on device
2. Trigger 3-5 errors in different tabs
3. Check AsyncStorage for 'error_sync_queue' key
4. Verify queue contains pending batches

#### 3.2 Disable Airplane Mode
1. Disable Airplane Mode
2. Wait 30 seconds (network check interval)
3. Check AsyncStorage - queue should be empty
4. Verify errors sent to Netlify (check Netlify logs)

**Expected Result:**
- Errors queued when offline
- Queue persisted to AsyncStorage
- Errors synced immediately when network restored
- Queue cleared after successful sync

---

### Test 4: Debug Mode Toggle

**Objective:** Verify Debug Mode enables/disables console logging.

**Steps:**

#### 4.1 Debug Mode OFF
1. Go to Settings
2. Ensure Debug Mode is OFF (⚪ icon)
3. Trigger an error
4. Check browser console - error should NOT be logged

#### 4.2 Debug Mode ON
1. Toggle Debug Mode ON (🟢 icon)
2. Trigger an error
3. Check browser console - error SHOULD be logged with [tab] label
4. Verify format: `[TabName] SEVERITY: error message`

**Expected Result:**
- Console shows logs only when Debug Mode is ON
- Debug logs have proper formatting
- Setting persists across app restarts

---

### Test 5: Error Statistics Dashboard

**Objective:** Verify dashboard displays real-time error statistics.

**URL:** `https://illustrious-cuchufli-7c4e58.netlify.app/dashboard.html`

**Steps:**

1. **Open Dashboard**
   - Navigate to dashboard URL
   - Should load without errors
   - Status indicator shows "Live" (green dot)

2. **Trigger Errors**
   - Generate 10-15 errors across different tabs
   - Watch dashboard update every 10 seconds
   - Verify:
     - Total error count increases
     - Severity distribution (Fatal/Error/Warning) updates
     - Tab heatmap shows color-coded error counts

3. **Verify Charts**
   - Hourly trend shows bars for each hour
   - Recent errors list shows last 50 errors
   - Top errors section shows most common errors
   - Each error card shows: tab, timestamp, severity

4. **Auto-Refresh**
   - Dashboard should auto-refresh every 10 seconds
   - Timestamp updates in header
   - Stop generating errors - count should stabilize

**Expected Result:**
- Dashboard loads successfully
- Real-time updates work correctly
- All statistics display accurately
- No errors in browser console

---

### Test 6: Auto-Recovery (Tier 1-3)

**Objective:** Verify auto-recovery mechanisms work for different error types.

**Note:** These tests require modifying code to trigger specific error scenarios.

#### 6.1 AsyncStorage Error Recovery

**Scenario:** AsyncStorage becomes inaccessible

**Setup:**
```typescript
// In a component, simulate error:
try {
  await autoRecoveryManager.executeRecovery(
    async () => {
      // This will fail on purpose
      throw new Error('AsyncStorage quota exceeded');
    },
    'testAsyncStorageOp',
    'TestTab',
    'asyncStorageError'
  );
} catch (e) {
  console.log('Recovery failed:', e);
}
```

**Expected:**
- Tier 1: Retry same operation (should show attempt in logs)
- Tier 2: Clear cache and retry
- Tier 3: Reset tab to defaults
- Recovery attempt recorded in AsyncStorage

#### 6.2 API Timeout Recovery

**Scenario:** API request times out

**Setup:**
```typescript
await autoRecoveryManager.executeRecovery(
  async () => {
    // Simulate timeout
    throw new Error('API timeout after 10s');
  },
  'apiCallTest',
  'Play',
  'apiTimeout'
);
```

**Expected:**
- Tier 1: Retry request
- Tier 2: Increase timeout and retry
- Tier 3: Use cached data fallback
- Recovery logged with tier information

#### 6.3 JSON Parse Error Recovery

**Scenario:** Corrupted JSON in AsyncStorage

**Setup:**
```typescript
await AsyncStorage.setItem('test_key', '{invalid json');
await autoRecoveryManager.executeRecovery(
  async () => {
    const value = await AsyncStorage.getItem('test_key');
    return JSON.parse(value!); // Will fail
  },
  'jsonParseTest',
  'Storage',
  'jsonParseError'
);
```

**Expected:**
- Tier 1: Attempt partial recovery
- Tier 2: Reset to empty default
- Tier 3: Remove corrupted key
- Recovery recorded in AsyncStorage

---

### Test 7: Error Batch Sending

**Objective:** Verify errors are batch-sent to Netlify efficiently.

**Steps:**

1. **Batch Threshold (5 errors)**
   - Trigger exactly 5 errors in 30 seconds
   - Monitor network requests (DevTools)
   - Should see POST to `/.netlify/functions/log-error`
   - Batch should contain all 5 errors

2. **Time-Based Flushing (5 minutes)**
   - Trigger 2-3 errors
   - Wait 5+ minutes
   - Batch should send automatically
   - Check Netlify function logs for confirmation

3. **Batch Format**
   - Open DevTools → Network tab
   - Trigger 5 errors
   - Click on log-error POST request
   - Verify payload structure:
     ```json
     {
       "id": "batch-...",
       "errors": [...],
       "createdAt": "2026-07-18...",
       "status": "pending"
     }
     ```

**Expected Result:**
- Batches sent after 5 errors OR 5 minutes
- Correct JSON format
- All errors in batch properly formatted
- Netlify responds with success status

---

### Test 8: Error Stats Endpoint

**Objective:** Verify error statistics API returns correct data.

**Steps:**

1. **Generate Diverse Errors**
   - Trigger 20+ errors across all tabs
   - Mix severity levels (warning/error/fatal)
   - Span across 2+ hours

2. **Call Stats Endpoint**
   ```bash
   curl https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/get-error-stats
   ```

3. **Verify Response Structure**
   ```json
   {
     "summary": {
       "total": 20,
       "in24h": 20,
       "severity": { "fatal": 2, "error": 15, "warning": 3 }
     },
     "byTab": { "English": 5, "TOEFL": 7, ... },
     "hourlyTrend": { "10:00": 5, "11:00": 8, ... },
     "topErrors": [...],
     "timestamp": "2026-07-18..."
   }
   ```

4. **Verify Accuracy**
   - Total count matches actual errors
   - Severity distribution correct
   - byTab counts match dashboard
   - Hourly trend shows realistic distribution

**Expected Result:**
- API returns 200 OK
- All fields populated correctly
- Counts match actual data
- Timestamps accurate

---

### Test 9: Settings Tab Integration

**Objective:** Verify Settings tab properly displays error information.

**Steps:**

1. **Error Log Display**
   - Navigate to Settings
   - Scroll to "🔴 에러 로그" section
   - If errorLogs > 0, badge shows count
   - Click "🔍 에러 로그 확인"
   - Details show: tab, timestamp, severity, stack trace

2. **Debug Mode Toggle**
   - Scroll to "🐛 디버그 모드"
   - Toggle ON
   - Alert confirms: "콘솔에 모든 에러 로그가 표시됩니다"
   - Toggle OFF
   - Alert confirms: "에러는 백그라운드에서만 기록됩니다"

3. **Error Clearing**
   - In Error Log Details, click "🗑️ 에러 로그 삭제"
   - Confirm deletion
   - Error list should be empty
   - AsyncStorage errorLogs should be cleared

**Expected Result:**
- All UI elements render correctly
- Alerts show appropriate messages
- Deletion works and data is cleared
- Settings persist across sessions

---

### Test 10: Performance Impact

**Objective:** Verify error logging doesn't impact app performance.

**Steps:**

1. **Memory Usage**
   - Open DevTools → Performance
   - Record baseline memory
   - Trigger 100+ errors over 1 minute
   - Record final memory
   - Memory growth should be <5MB

2. **Frame Rate**
   - Record DevTools FPS during normal use
   - Trigger continuous errors
   - FPS should remain stable (>30 FPS)
   - No janky animations

3. **AsyncStorage Performance**
   - Time reading errorLogs with 200+ entries
   - Should complete in <100ms
   - Clearing should be instant

**Expected Result:**
- No noticeable performance impact
- Memory stays within reasonable bounds
- Frame rate unaffected
- AsyncStorage operations fast

---

## Verification Checklist

- [ ] useErrorLogger hook initialized on app start
- [ ] Errors captured globally and logged
- [ ] AsyncStorage errorLogs populated correctly
- [ ] Offline queue persists to storage
- [ ] Errors sync when network restored
- [ ] Debug Mode toggle works bidirectionally
- [ ] Console logs show/hide based on Debug Mode
- [ ] Dashboard loads and auto-refreshes
- [ ] Error statistics API returns correct data
- [ ] Batch sending works (5 errors or 5 minutes)
- [ ] Settings tab displays errors correctly
- [ ] Error clearing works in Settings
- [ ] All 3 recovery tiers execute in sequence
- [ ] Recovery attempts logged
- [ ] No performance degradation
- [ ] Heatmap color-coding accurate
- [ ] Hourly trend shows correct distribution
- [ ] Top errors ranking accurate

---

## Dashboard URL

**Live Dashboard:** https://illustrious-cuchufli-7c4e58.netlify.app/dashboard.html

**Features:**
- Real-time error monitoring
- 24-hour error statistics
- Error heatmap by tab
- Hourly trend graph
- Recent errors (last 50)
- Top errors ranking
- Severity distribution
- Auto-refresh every 10 seconds

---

## Troubleshooting

### Dashboard Not Updating

1. Check browser console for errors
2. Verify Netlify functions are deployed
3. Check browser DevTools → Network → get-error-stats
4. Look for CORS errors

### Errors Not Being Logged

1. Verify useErrorLogger initialized in _layout.tsx
2. Check AsyncStorage is accessible
3. Enable Debug Mode to see console logs
4. Check if error is async and properly awaited

### Offline Queue Not Syncing

1. Verify network connectivity check works
2. Check AsyncStorage error_sync_queue key
3. Ensure Netlify endpoint is reachable
4. Check browser console for fetch errors

### Performance Issues

1. Reduce batchSize in useErrorLogger
2. Increase batchInterval (time between flushes)
3. Clear old errors regularly
4. Check for memory leaks in AsyncStorage

---

## Notes

- Error logging is async and non-blocking
- Offline errors are queued and synced automatically
- Dashboard refreshes every 10 seconds
- Recovery attempts are logged separately
- Debug Mode is persisted to AsyncStorage
- All errors stored for 24 hours by default
- Batch size: 5 errors or 5 minutes
- Network check interval: 30 seconds

---

**Status:** ✅ Phase B Complete - Ready for Testing
**Last Updated:** 2026-07-18
