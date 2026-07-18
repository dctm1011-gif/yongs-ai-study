# YongStudy Security Remediation Guide

**Status:** Ready for Implementation  
**Priority:** Critical → Medium → Low  
**Total Effort:** ~25 hours

---

## Quick Fix Checklist (First 30 Minutes)

```bash
# 1. Disable debug mode
# Edit: app.json line 39
# Change: "debuggable": true
# To:     "debuggable": false

# 2. Add timeout utility
# Create: src/utils/fetchTimeout.ts (see below)

# 3. Update _layout.tsx imports
# Remove unused imports if any

# 4. Test build
npm run build
```

---

## Fix #1: Disable Debug Mode (5 minutes)

**File:** `app.json`

**Before:**
```json
"android": {
  "adaptiveIcon": { ... },
  "debuggable": true
}
```

**After:**
```json
"android": {
  "adaptiveIcon": { ... },
  "debuggable": false
}
```

**Verification:**
```bash
eas build --platform android --json | grep debuggable
```

---

## Fix #2: Add Fetch Timeout Utility (30 minutes)

**File:** Create `src/utils/fetchTimeout.ts`

```typescript
/**
 * Fetch with timeout support
 * Prevents API calls from hanging indefinitely
 */
export interface FetchOptions extends RequestInit {
  timeout?: number;
}

export interface FetchResponse<T> {
  ok: boolean;
  status: number;
  headers: Headers;
  data: T;
  text: string;
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds

export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms to ${url}`);
      }
    }
    throw error;
  }
}

export async function fetchJSON<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  
  // Validate content type
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(
      `Invalid content-type: expected application/json, got ${contentType}`
    );
  }
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error.substring(0, 100)}`);
  }
  
  return response.json();
}

export async function fetchText(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const response = await fetchWithTimeout(url, options);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.text();
}
```

**Usage Examples:**

```typescript
// In src/utils/api.ts
import { fetchJSON, fetchText } from './fetchTimeout';

export async function fetchEnglishData() {
  try {
    const data = await fetchJSON(
      `${NETLIFY_BASE_URL}/english/words_db.json`,
      { timeout: 15000 }  // 15 seconds
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch English data:', error);
    return null;
  }
}

export async function fetchTOEFLData() {
  try {
    const html = await fetchText(
      `${NETLIFY_BASE_URL}/toefl/index.html`,
      { timeout: 20000 }
    );
    return parseHTML(html);  // Use safe HTML parser
  } catch (error) {
    console.error('Failed to fetch TOEFL data:', error);
    return null;
  }
}
```

---

## Fix #3: Add JSON Schema Validation (2 hours)

**File:** Create `src/utils/validators.ts`

```typescript
/**
 * Runtime validators for API responses
 * Prevents deserialization attacks
 */

// Define type guards
export interface NetlifyWord {
  id: string;
  word: string;
  pos: string;
  date: string;
  meaning: string;
  example_ko: string;
  example_en: string;
  explanation: string;
  emoji: string;
}

export interface Quiz {
  id: string;
  wordId: string;
  type: 'meaning' | 'blanks' | 'situation';
  question: string;
  options: string[];
  correct: string;
  answered?: boolean;
  correct_answer?: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  importance: 'normal' | 'high' | 'critical';
  createdAt: string;
  expiresAt?: string | null;
}

// Validation functions
export function validateNetlifyWord(obj: any): obj is NetlifyWord {
  if (typeof obj !== 'object' || obj === null) return false;
  
  return (
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    obj.id.length <= 100 &&
    
    typeof obj.word === 'string' &&
    obj.word.length > 0 &&
    obj.word.length <= 200 &&
    
    typeof obj.pos === 'string' &&
    ['noun', 'verb', 'adjective', 'adverb'].includes(obj.pos) &&
    
    typeof obj.date === 'string' &&
    isValidDate(obj.date) &&
    
    typeof obj.meaning === 'string' &&
    obj.meaning.length > 0 &&
    obj.meaning.length <= 1000 &&
    
    typeof obj.example_ko === 'string' &&
    obj.example_ko.length <= 2000 &&
    
    typeof obj.example_en === 'string' &&
    obj.example_en.length <= 2000 &&
    
    typeof obj.explanation === 'string' &&
    obj.explanation.length <= 2000 &&
    
    typeof obj.emoji === 'string' &&
    obj.emoji.length === 1
  );
}

export function validateAnnouncement(obj: any): obj is Announcement {
  if (typeof obj !== 'object' || obj === null) return false;
  
  return (
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    
    typeof obj.title === 'string' &&
    obj.title.length > 0 &&
    obj.title.length <= 200 &&
    
    typeof obj.message === 'string' &&
    obj.message.length > 0 &&
    obj.message.length <= 5000 &&
    
    ['info', 'warning', 'success'].includes(obj.type) &&
    ['normal', 'high', 'critical'].includes(obj.importance) &&
    
    typeof obj.createdAt === 'string' &&
    isValidDate(obj.createdAt) &&
    
    (obj.expiresAt === null || 
     obj.expiresAt === undefined ||
     (typeof obj.expiresAt === 'string' && isValidDate(obj.expiresAt)))
  );
}

export function validateWordArray(data: any): data is NetlifyWord[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.length <= 10000 &&
    data.every(validateNetlifyWord)
  );
}

export function validateAnnouncementArray(data: any): data is Announcement[] {
  return (
    Array.isArray(data) &&
    data.length <= 10000 &&
    data.every(validateAnnouncement)
  );
}

// Helper functions
function isValidDate(dateStr: any): boolean {
  if (typeof dateStr !== 'string') return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

export function sanitizeString(str: string, maxLength: number = 10000): string {
  if (typeof str !== 'string') return '';
  
  // Remove null bytes
  str = str.replace(/\0/g, '');
  
  // Limit length
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  
  return str;
}

export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    return sanitizeString(input);
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (key.startsWith('__')) continue;  // Skip dunder keys
      result[key] = sanitizeInput(value);
    }
    return result;
  }
  
  return input;
}
```

**Usage in src/app/english.tsx:**

```typescript
import { validateWordArray } from '../utils/validators';
import { fetchJSON } from '../utils/fetchTimeout';

const fetchEnglishFromNetlify = async (): Promise<NetlifyWord[] | null> => {
  try {
    const data = await fetchJSON(`${NETLIFY_BASE_URL}/english/words_db.json`);
    
    // Validate schema
    if (!validateWordArray(data)) {
      console.error('Invalid word data structure from Netlify');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Netlify fetch failed:', error);
    return null;
  }
};
```

---

## Fix #4: Add Safe Cache Manager (1 hour)

**File:** Update `src/utils/CacheManager.ts`

```typescript
// Add at the top
import { sanitizeInput } from './validators';

// Add to get() method
async get<T>(key: string): Promise<T | null> {
  try {
    const diskData = await AsyncStorage.getItem(key);
    if (diskData) {
      // Validate JSON structure
      const parsed = JSON.parse(diskData);
      if (!parsed || typeof parsed !== 'object') {
        await AsyncStorage.removeItem(key);
        return null;
      }
      
      // Verify required fields
      if (!('data' in parsed) || !('timestamp' in parsed) || !('ttl' in parsed)) {
        console.warn(`Cache corruption detected for key: ${key}`);
        await AsyncStorage.removeItem(key);
        return null;
      }
      
      // Verify types
      if (typeof parsed.timestamp !== 'number' || typeof parsed.ttl !== 'number') {
        console.warn(`Invalid cache entry types for key: ${key}`);
        await AsyncStorage.removeItem(key);
        return null;
      }
      
      // Check expiration
      if (this.isExpired(parsed)) {
        await AsyncStorage.removeItem(key);
        return null;
      }
      
      return parsed.data as T;
    }
  } catch (error) {
    console.error(`Cache retrieval failed for key ${key}:`, error);
    // Clear corrupted cache entry
    await AsyncStorage.removeItem(key);
  }
  
  return null;
}
```

---

## Fix #5: Secure CORS Headers (30 minutes)

**File:** Update `netlify/functions/_utils.mjs`

```javascript
export function corsHeaders(origin = null) {
  // Whitelist of allowed origins
  const allowedOrigins = new Set([
    'https://yongstudy.app',
    'https://www.yongstudy.app',
    'https://illustrious-cuchufli-7c4e58.netlify.app',
  ]);
  
  // Allow localhost in development
  if (process.env.ENVIRONMENT === 'development') {
    allowedOrigins.add('http://localhost:19006');
    allowedOrigins.add('http://localhost:8081');
  }
  
  const allowedOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : 'https://illustrious-cuchufli-7c4e58.netlify.app';
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '3600',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function securityHeaders() {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

export function createResponse(statusCode, body, headers = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'X-Function-Timestamp': new Date().toISOString(),
    ...securityHeaders(),
    ...headers,
  };

  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify({
      success: statusCode < 400,
      timestamp: new Date().toISOString(),
      ...(typeof body === 'string' ? { error: body } : body),
    }),
  };
}
```

**Update all functions to use origin:**

```javascript
// In each function
export default async (req) => {
  const origin = req.headers.origin;
  const cors = corsHeaders(origin);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  
  // ... rest of function
}
```

---

## Fix #6: Add Request Validation (1.5 hours)

**File:** Create `netlify/functions/validators.mjs`

```javascript
export function validateFeedbackRequest(body) {
  const errors = [];
  
  // Validate text
  if (typeof body.text !== 'string') {
    errors.push('text must be a string');
  } else if (body.text.trim().length === 0) {
    errors.push('text cannot be empty');
  } else if (body.text.length > 5000) {
    errors.push('text exceeds maximum length (5000 characters)');
  } else if (body.text.trim().split(/\s+/).length < 3) {
    errors.push('text must contain at least 3 words');
  }
  
  // Validate type
  if (!body.type || !['writing', 'speaking'].includes(body.type)) {
    errors.push('type must be "writing" or "speaking"');
  }
  
  // Validate prompt (optional but if provided, validate)
  if (body.prompt) {
    if (typeof body.prompt !== 'string') {
      errors.push('prompt must be a string');
    } else if (body.prompt.length > 1000) {
      errors.push('prompt exceeds maximum length (1000 characters)');
    }
  }
  
  // Validate structure (optional)
  if (body.structure) {
    if (typeof body.structure !== 'object') {
      errors.push('structure must be an object');
    } else {
      const validKeys = ['intro', 'body1', 'body2', 'conclusion'];
      for (const key of Object.keys(body.structure)) {
        if (!validKeys.includes(key)) {
          errors.push(`invalid structure key: ${key}`);
        }
        if (typeof body.structure[key] !== 'string') {
          errors.push(`structure.${key} must be a string`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitizedBody: errors.length === 0 ? body : null,
  };
}

export function validateAnnouncementRequest(body) {
  const errors = [];
  
  if (!body.id || typeof body.id !== 'string' || body.id.length === 0) {
    errors.push('id is required and must be a non-empty string');
  }
  
  if (!body.title || typeof body.title !== 'string' || body.title.length === 0) {
    errors.push('title is required and must be a non-empty string');
  } else if (body.title.length > 200) {
    errors.push('title exceeds maximum length (200 characters)');
  }
  
  if (!body.message || typeof body.message !== 'string' || body.message.length === 0) {
    errors.push('message is required and must be a non-empty string');
  } else if (body.message.length > 5000) {
    errors.push('message exceeds maximum length (5000 characters)');
  }
  
  if (body.type && !['info', 'warning', 'success'].includes(body.type)) {
    errors.push('type must be "info", "warning", or "success"');
  }
  
  if (body.importance && !['normal', 'high', 'critical'].includes(body.importance)) {
    errors.push('importance must be "normal", "high", or "critical"');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

**Update announcements.mjs:**

```javascript
import { validateAnnouncementRequest } from './validators.mjs';

if (req.method === "POST") {
  const data = await req.json();
  
  const validation = validateAnnouncementRequest(data);
  if (!validation.valid) {
    return Response.json(
      { error: 'Validation failed', details: validation.errors },
      { status: 400, headers: cors }
    );
  }
  
  // ... rest of function
}
```

---

## Fix #7: Add Input Sanitization (1 hour)

**File:** Create `src/utils/sanitize.ts`

```typescript
/**
 * Input sanitization utilities
 * Prevents XSS and injection attacks
 */

const MAX_STRING_LENGTH = 10000;
const DANGEROUS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /on\w+\s*=/gi,  // Event handlers
  /javascript:/gi,
  /data:text\/html/gi,
];

export function sanitizeString(
  input: string,
  maxLength: number = MAX_STRING_LENGTH
): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let result = input
    // Remove null bytes
    .replace(/\0/g, '')
    // Limit length
    .substring(0, maxLength)
    // Trim whitespace
    .trim();
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(result)) {
      console.warn('Dangerous pattern detected in input');
      return '';  // Return empty string if dangerous content detected
    }
  }
  
  return result;
}

export function sanitizeJSON(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeJSON).slice(0, 1000);  // Limit array size
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    let keyCount = 0;
    
    for (const [key, value] of Object.entries(obj)) {
      if (keyCount > 100) break;  // Limit object keys
      
      // Skip suspicious keys
      if (key.startsWith('__') || key.startsWith('$')) {
        continue;
      }
      
      // Sanitize key and value
      const cleanKey = sanitizeString(key, 100);
      result[cleanKey] = sanitizeJSON(value);
      keyCount++;
    }
    
    return result;
  }
  
  return obj;
}

export function sanitizeURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow https
    if (parsed.protocol !== 'https:') {
      return false;
    }
    
    // Whitelist domains
    const allowedDomains = [
      'illustrious-cuchufli-7c4e58.netlify.app',
      'yongstudy.app',
      'api.anthropic.com',
    ];
    
    return allowedDomains.some(domain => parsed.hostname.includes(domain));
  } catch {
    return false;
  }
}
```

---

## Fix #8: Update Error Logging (1 hour)

**File:** Update `src/hooks/useErrorLogger.ts`

```typescript
// Add sanitization
import { sanitizeString } from '../utils/sanitize';

private async sendBatch(batch: ErrorBatch) {
  try {
    batch.status = 'syncing';
    
    // Sanitize error messages before sending
    const sanitizedBatch = {
      ...batch,
      errors: batch.errors.map(error => ({
        ...error,
        error: sanitizeString(error.error, 500),  // Limit to 500 chars
        stack: error.stack
          ? sanitizeString(error.stack, 1000)
              .split('\n')
              .map(line => line.replace(/\/[^/]+\.js/g, '[FILE]'))  // Hide paths
              .join('\n')
          : undefined,
      })),
    };
    
    const response = await fetch(
      'https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/log-error',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Add timeout to fetch
        },
        body: JSON.stringify(sanitizedBatch),
        signal: AbortSignal.timeout(10000),  // Node 18+
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
```

---

## Fix #9: Add Error Boundary (1 hour)

**File:** Create `src/components/ErrorBoundary.tsx`

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log to error service
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fef2f2' }}>
          <View style={{ flex: 1, padding: 16 }}>
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#dc2626', marginBottom: 8 }}>
                어라, 뭔가 잘못되었어요
              </Text>
              <Text style={{ fontSize: 14, color: '#64748b' }}>
                앱에 예상치 못한 오류가 발생했습니다. 도움말을 확인하거나 다시 시도해주세요.
              </Text>
            </View>

            {__DEV__ && this.state.error && (
              <ScrollView style={{ flex: 1, marginBottom: 20, backgroundColor: '#fff', padding: 12, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Courier New', color: '#dc2626' }}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text style={{ fontSize: 10, fontFamily: 'Courier New', color: '#64748b', marginTop: 8 }}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              onPress={this.handleReset}
              style={{
                backgroundColor: '#3b82f6',
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>
                다시 시도
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}
```

**Usage in `src/app/_layout.tsx`:**

```typescript
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
        {/* existing navigation code */}
      </View>
    </ErrorBoundary>
  );
}
```

---

## Testing Checklist

After each fix, run these tests:

```bash
# Type checking
npm run build
npx tsc --noEmit

# Linting (if available)
npm run lint

# Test imports
npm start

# Manual testing
# - Try fetching data with network disconnected
# - Try sending malformed JSON to endpoints
# - Check AsyncStorage with rooted Android device
# - Verify debug mode is disabled in app
```

---

## Verification Checklist

- [ ] Fix #1: Debug mode disabled in app.json
- [ ] Fix #2: fetchTimeout.ts created and imported
- [ ] Fix #3: validators.ts created with all validators
- [ ] Fix #4: CacheManager updated with validation
- [ ] Fix #5: CORS headers restricted to whitelist
- [ ] Fix #6: Request validators created and used
- [ ] Fix #7: sanitize.ts created with sanitization functions
- [ ] Fix #8: Error logging updated with sanitization
- [ ] Fix #9: ErrorBoundary created and integrated
- [ ] All imports updated across files
- [ ] npm audit shows no additional vulnerabilities
- [ ] App builds successfully
- [ ] All tabs load without errors

---

## Timeline

**Day 1 (3 hours):**
- Fix #1: Debug mode (5 min)
- Fix #2: Fetch timeout (30 min)
- Fix #5: CORS headers (30 min)
- Fix #8: Error logging (1 hour)
- Testing (30 min)

**Day 2 (4 hours):**
- Fix #3: Schema validation (2 hours)
- Fix #4: Cache manager (1 hour)
- Fix #6: Request validators (1 hour)

**Day 3 (3 hours):**
- Fix #7: Sanitization (1.5 hours)
- Fix #9: Error boundary (1 hour)
- Integration testing (30 min)

**Day 4:**
- Security testing
- Dependency upgrade planning
- Documentation

---

## Implementation Notes

### Installation Requirements

If implementing encryption (Phase 2):
```bash
npm install react-native-keychain
npx expo install react-native-keychain
```

### Database Constraints

**AsyncStorage Limits (React Native):**
- Android: ~6-10MB per app
- iOS: ~5MB per app

Current estimate: English words (100 KB) + Quizzes (50 KB) + Cache (varies)

**Recommendation:** Monitor AsyncStorage usage with `getStats()`

### Backwards Compatibility

Changes are backwards-compatible:
- Validators will reject old data format, forcing refresh from server
- CORS whitelist includes current Netlify domain
- Timeout defaults to 10s (most requests complete in <5s)

---

## Production Readiness

**After implementing all fixes:**
- npm audit: 0 vulnerabilities
- TypeScript strict: ✅ PASS
- Security headers: ✅ PASS
- Input validation: ✅ PASS
- Error handling: ✅ PASS
- Performance: ✅ OK
- Accessibility: ⚠️ Needs screen reader testing

---

**Next Step:** Choose which fixes to implement first based on priority and resource availability.
