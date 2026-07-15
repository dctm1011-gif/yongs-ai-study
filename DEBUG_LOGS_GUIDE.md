# YongStudy 앱 개발 및 디버깅 가이드

**생성일:** 2026-07-10  
**프로젝트:** YongStudy (React Native + Expo)  
**목표:** 콘텐츠 로딩 실패 문제 해결을 위한 in-app 디버깅 시스템 구축

---

## 📋 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [앱/웹 개발 기본 개념](#앱웹-개발-기본-개념)
3. [발생했던 주요 에러들](#발생했던-주요-에러들)
4. [해결된 문제들](#해결된-문제들)
5. [현재 디버깅 시스템](#현재-디버깅-시스템)
6. [로그 해석 방법](#로그-해석-방법)

---

## 프로젝트 개요

### 📱 YongStudy 앱 구조

```
YongStudyApp/
├── src/app/
│   ├── _layout.tsx          ← 메인 네비게이션 (4개 탭)
│   ├── index.tsx            ← 홈 탭 (사용자 진행도)
│   ├── english.tsx          ← 영어 탭 (단어+퀴즈 학습)
│   ├── toefl.tsx            ← TOEFL 탭 (4개 섹션: Reading/Writing/Speaking/Listening)
│   └── papers.tsx           ← 논문 탭 (arXiv 논문 검색)
├── src/components/
│   └── debug-panel.tsx      ← 🐛 디버그 패널 (실시간 로그 보기)
├── .debug-logs/             ← 자동 생성 로그 저장소
│   ├── debug-20260710-153045.log
│   ├── debug-20260710-153245.log
│   └── debug-index.json     ← 세션 목록
├── package.json
├── app.json
└── DEBUG_MONITOR.js         ← 로그 수집 및 파일 저장
```

### 🎯 4개 탭의 역할

| 탭 | 역할 | 데이터 소스 | 저장소 |
|----|------|-----------|--------|
| 홈 | 사용자 레벨/경험치/스트릭 표시 | localStorage | Device |
| 영어 | 단어 학습 + 5지선다형 퀴즈 | Netlify HTML (정규식 파싱) | Cache (1시간) |
| TOEFL | 4개 섹션 (Reading/Writing/Speaking/Listening) | Netlify HTML (정규식 파싱) | Cache (1시간) |
| 논문 | arXiv 논문 목록 (좋아요/읽음 토글) | Netlify JSON | Cache (1시간) |

---

## 앱/웹 개발 기본 개념

### 1️⃣ React Native vs 웹 개발의 차이점

#### React Native (모바일 앱)
```typescript
// ✅ 모바일에서 사용 가능
import { AsyncStorage } from '@react-native-async-storage/async-storage';

// ❌ 모바일에서 사용 불가 (웹 API)
const data = localStorage.getItem('key'); // 에러!
```

#### 웹 (브라우저)
```typescript
// ✅ 웹에서 사용 가능
const data = localStorage.getItem('key');

// ❌ 웹에서 사용 불가 (모바일 API)
import AsyncStorage from '@react-native-async-storage/async-storage'; // 에러!
```

#### 해결책: Storage Adapter (양쪽 모두 호환)
```typescript
const Storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    }
    return null; // 모바일에서는 AsyncStorage 필요 (별도 구현)
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    }
  }
};
```

### 2️⃣ 네트워크 요청 플로우

```
앱 시작
   ↓
1. loadData() 호출
   ├─ 로컬 캐시 확인 (1시간 유효)
   │  ├─ 유효 → 캐시 데이터 사용 ✓
   │  └─ 만료 → fetchAndCache() 진행
   │
2. fetchAndCache() - Netlify에서 데이터 가져오기
   ├─ fetch(URL) - 네트워크 요청
   │  └─ HTTP 200 OK → HTML/JSON 수신
   │
3. 데이터 파싱
   ├─ HTML 정규식 매칭
   │  └─ const WORDS = [...] 찾기
   │
4. JSON 파싱
   │  └─ JSON.parse() 실행
   │
5. 상태 업데이트
   ├─ setWords(data)
   ├─ setQuiz(data)
   └─ 화면에 표시 ✓
   
실패 시 → Fallback 데이터 표시
```

### 3️⃣ 캐싱 전략 (1시간 TTL)

```javascript
const CACHE_DURATION = 60 * 60 * 1000; // 1시간 = 3,600,000ms

// 캐시 확인 로직
if (cachedTime && !isExpired) {
  // ✅ 캐시 있음 + 만료 안됨 → 캐시 사용
  setData(JSON.parse(cached));
  return;
}

// ❌ 캐시 없거나 만료됨 → 다시 다운로드
await fetchAndCache();
```

### 4️⃣ 정규식 (Regex) 패턴 매칭

Netlify에서 HTML 콘텐츠를 가져온 후, JavaScript 변수를 추출합니다:

```html
<!-- Netlify 서버의 HTML 응답 -->
<script>
  const WORDS = [
    { word: "serendipity", meaning_ko: "행운" },
    { word: "eloquent", meaning_ko: "웅변적인" }
  ];

  const QUIZ = [
    { question: "What means 'serendipity'?", answer: 0 }
  ];
</script>
```

```typescript
// 앱에서 이 데이터를 추출
const html = await response.text();
const wordsMatch = html.match(/const WORDS = (\[[\s\S]*?\]);/);
const quizMatch = html.match(/const QUIZ = (\[[\s\S]*?\]);/);

// 추출 결과
if (wordsMatch) {
  const wordsData = JSON.parse(wordsMatch[1]); // [0]은 전체, [1]은 괄호 안
  // wordsData = [{ word: "serendipity", ... }, ...]
}
```

### 5️⃣ 상태 관리 (State)

```typescript
// 각 탭은 3개의 상태를 가짐
const [data, setData] = useState(DEFAULT_DATA);        // 표시할 데이터
const [loading, setLoading] = useState(true);          // 로딩 중?
const [error, setError] = useState(false);             // 에러 발생?

// 데이터 로딩 3단계
useEffect(() => {
  loadData();  // 1. 시작
}, []);

// 2. 로딩 중 → 스켈레톤 표시
if (loading) return <Skeleton />;

// 3. 에러 → 에러 메시지
if (error) return <ErrorMessage />;

// 4. 완료 → 데이터 표시
return <DataDisplay data={data} />;
```

---

## 발생했던 주요 에러들

### ❌ 에러 1: AsyncStorage가 react-native에 없음

**증상:**
```
error TS2305: Module 'react-native' has no exported member 'AsyncStorage'.
```

**원인:**
```typescript
// ❌ 잘못된 import
import { AsyncStorage } from 'react-native';
// AsyncStorage는 react-native에 없음! (웹 환경에서 특히)
```

**해결:**
```typescript
// ✅ Platform 확인 후 선택적 사용
import { Platform } from 'react-native';

const Storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key); // 웹: localStorage
    }
    return null; // 모바일: 별도 처리 필요
  }
};
```

---

### ❌ 에러 2: useNativeDriver가 웹에서 작동 안함

**증상:**
```
Animated: `useNativeDriver` is not supported because the native animated module is missing
```

**원인:**
```typescript
// ❌ 웹에서도 useNativeDriver 사용
Animated.timing(value, {
  toValue: 1,
  duration: 300,
  useNativeDriver: true  // ← 웹에서 없음!
});
```

**해결:**
```typescript
// ✅ Platform별로 다르게 설정
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

Animated.timing(value, {
  toValue: 1,
  duration: 300,
  useNativeDriver: USE_NATIVE_DRIVER  // ← 웹: false, 모바일: true
});
```

---

### ❌ 에러 3: fetch() timeout이 표준이 아님

**증상:**
```
Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.
```

**원인:**
```typescript
// ❌ fetch API는 표준 timeout을 지원 안함
const response = await fetch(url, {
  timeout: 10000  // ← 표준이 아님
});
```

**해결:**
```typescript
// ✅ 표준 fetch API 사용 (또는 AbortController로 timeout 구현)
const response = await fetch(url);
// 또는
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
const response = await fetch(url, { signal: controller.signal });
clearTimeout(timeout);
```

---

### ❌ 에러 4: Error 객체의 .message가 없음

**증상:**
```
error TS2339: Property 'message' does not exist on type '{}'.
```

**원인:**
```typescript
// ❌ catch에서 에러 타입이 unknown
try {
  // ...
} catch (err) {
  console.error(err?.message);  // ← TypeScript: err는 뭔데요?
}
```

**해결:**
```typescript
// ✅ catch에서 명시적으로 타입 지정
try {
  // ...
} catch (err: any) {
  console.error(err?.message || String(err));
}
```

---

### ❌ 에러 5: 콘텐츠가 앱에 표시 안됨 (2주간 미해결)

**증상:**
```
사용자 보고: "탭마다 데이터가 안보여"
- 영어 탭: 단어 없음
- TOEFL 탭: 섹션 없음  
- 논문 탭: 논문 없음
- 심지어 기본 테스트 데이터도 표시 안됨
```

**가능한 원인들:**
1. Netlify fetch 실패
2. 정규식 매칭 실패
3. JSON 파싱 에러
4. State 업데이트 실패
5. 레이아웃 문제 (display: none 등)

**진단 방법:**
→ **디버그 패널 로그에서 정확한 원인 파악 가능!** 🔍

---

## 해결된 문제들

### ✅ 문제 1: 웹과 모바일 호환성

| 문제 | 해결 |
|------|------|
| AsyncStorage 없음 | Platform 기반 Storage adapter |
| useNativeDriver 에러 | Platform.OS 체크로 조건부 사용 |
| fetch timeout | 표준 API만 사용 |
| 타입 에러 | 모든 catch 문에 `any` 타입 |

### ✅ 문제 2: Expo SDK 버전 호환성

```
SDK 57 → SDK 54로 다운그레이드
- expo-router 제거 (호환 안됨)
- @react-navigation 으로 대체
- expo-updates 제거 (호환 안됨)
```

### ✅ 문제 3: 의존성 충돌

```
npm install --force --legacy-peer-deps 로 해결
72개 패키지 설치 성공
```

### ✅ 문제 4: TypeScript 컴파일 에러

```
모든 에러 수정 완료 (0개 남음)
- AsyncStorage import 제거
- 타입 지정 추가
- 불필요한 파일 정리
```

---

## 현재 디버깅 시스템

### 🐛 Debug Panel 구조

```
┌─────────────────────────────────┐
│  🐛 Debug Panel                 │ ✕
├─────────────────────────────────┤
│ [LOG]   10:23:45 [ENGLISH] ✓    │
│ [ERROR] 10:23:46 ✗ Fetch failed │
│ [WARN]  10:23:47 Retry attempt  │
│ [LOG]   10:23:48 Using fallback │
│                                 │
│ ↑ (스크롤 가능, 최대 100줄)    │
│                                 │
├─────────────────────────────────┤
│           [Clear Logs]          │
└─────────────────────────────────┘

위치: 우측 하단 고정
색상:
  🔵 LOG   = 파란색 (정보)
  🔴 ERROR = 빨간색 (실패)
  🟠 WARN  = 주황색 (경고)
```

### 📊 로그 수집 흐름

```
1️⃣ 앱 실행
   └─ DEBUG_MONITOR.js 시작
      └─ .debug-logs/ 디렉토리 생성
      └─ debug-YYYYMMDD-HHMMSS.log 파일 생성

2️⃣ 모든 콘솔 출력 후킹
   console.log()    → .log 파일에 저장
   console.error()  → .log 파일에 저장
   console.warn()   → .log 파일에 저장

3️⃣ 디버그 패널에 실시간 표시
   addLog() 호출 → React state 업데이트
              → 화면에 즉시 표시

4️⃣ 세션 종료 시 메타데이터 저장
   debug-index.json 생성
   {
     "sessions": [
       {
         "id": "20260710-153045",
         "startTime": "2026-07-10T15:30:45Z",
         "endTime": "2026-07-10T15:35:12Z",
         "totalLogs": 256,
         "errorCount": 2,
         "warningCount": 5,
         "tabsTested": ["english", "toefl", "papers"]
       }
     ]
   }
```

---

## 로그 해석 방법

### 정상 흐름 로그 예시

```
[2026-07-10T15:30:45.123Z] [LOG] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2026-07-10T15:30:45.234Z] [LOG] [ENGLISH] Fetch START: https://illustrious-...
[2026-07-10T15:30:45.345Z] [LOG] [ENGLISH] URL: https://illustrious-cuchufli-7c4e58.netlify.app/english/index.html
[2026-07-10T15:30:45.456Z] [LOG] [ENGLISH] fetch() called...
[2026-07-10T15:30:45.789Z] [LOG] [ENGLISH] ✓ Response received in 234 ms
[2026-07-10T15:30:45.890Z] [LOG] [ENGLISH] Status: 200 | OK: true
[2026-07-10T15:30:45.901Z] [LOG] [ENGLISH] ✓ HTML received: 2048 bytes
[2026-07-10T15:30:45.912Z] [LOG] [ENGLISH] Regex matching...
[2026-07-10T15:30:45.923Z] [LOG] [ENGLISH] Match results:
[2026-07-10T15:30:45.934Z] [LOG]   └─ WORDS found: true (524 bytes)
[2026-07-10T15:30:45.945Z] [LOG]   └─ QUIZ found: true (1024 bytes)
[2026-07-10T15:30:45.956Z] [LOG] [ENGLISH] Parsing JSON objects...
[2026-07-10T15:30:45.967Z] [LOG] [ENGLISH] Parsing WORDS JSON...
[2026-07-10T15:30:45.978Z] [LOG] [ENGLISH] ✓ WORDS parsed: 10 words
[2026-07-10T15:30:45.989Z] [LOG] [ENGLISH] Parsing QUIZ JSON...
[2026-07-10T15:30:46.000Z] [LOG] [ENGLISH] ✓ QUIZ parsed: 5 questions
[2026-07-10T15:30:46.011Z] [LOG] [ENGLISH] Saving to storage...
[2026-07-10T15:30:46.022Z] [LOG] [ENGLISH] ✓ Storage saved
[2026-07-10T15:30:46.033Z] [LOG] [ENGLISH] ✓✓✓ SUCCESS! Data loaded and displayed
[2026-07-10T15:30:46.044Z] [LOG] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2026-07-10T15:30:46.055Z] [LOG] [ENGLISH] Fetch cycle COMPLETE
```

✅ **결론: 완벽히 성공!**

---

### 실패 흐름 로그 예시 1: Netlify 접근 불가

```
[2026-07-10T15:31:45.123Z] [LOG] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2026-07-10T15:31:45.234Z] [LOG] [ENGLISH] Fetch START: https://illustrious-...
[2026-07-10T15:31:45.345Z] [LOG] [ENGLISH] fetch() called...
[2026-07-10T15:32:00.000Z] [ERROR] [ENGLISH] ✗✗✗ FATAL ERROR: Failed to fetch
```

❌ **문제: 네트워크 연결 실패**
- Netlify 서버 다운?
- 인터넷 연결 끊김?
- CORS 에러?

💡 **해결책:**
1. Netlify 상태 확인: https://illustrious-cuchufli-7c4e58.netlify.app/english/index.html
2. 인터넷 연결 확인
3. 브라우저 개발자 도구 Network 탭에서 요청 확인

---

### 실패 흐름 로그 예시 2: Regex 매칭 실패

```
[2026-07-10T15:31:45.123Z] [LOG] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2026-07-10T15:31:45.234Z] [LOG] [ENGLISH] fetch() called...
[2026-07-10T15:31:45.789Z] [LOG] [ENGLISH] ✓ Response received in 234 ms
[2026-07-10T15:31:45.890Z] [LOG] [ENGLISH] ✓ HTML received: 2048 bytes
[2026-07-10T15:31:45.901Z] [LOG] [ENGLISH] Regex matching...
[2026-07-10T15:31:45.912Z] [LOG] [ENGLISH] Match results:
[2026-07-10T15:31:45.923Z] [ERROR] [ENGLISH] ✗ WORDS pattern not found!
[2026-07-10T15:31:45.934Z] [LOG] [ENGLISH] HTML snippet: <!DOCTYPE html>...
[2026-07-10T15:31:45.945Z] [ERROR] [ENGLISH] ✗ Parsing failed: Regex match returned null
```

❌ **문제: Netlify 콘텐츠 형식 변경**
- `const WORDS = [...]` 이 없음
- HTML 구조 변경
- 변수명 변경됨

💡 **해결책:**
1. Netlify 파일 직접 확인
2. 정규식 패턴 수정
3. 새로운 형식에 맞게 파싱 로직 업데이트

---

### 실패 흐름 로그 예시 3: JSON 파싱 실패

```
[2026-07-10T15:31:45.901Z] [LOG] [ENGLISH] Regex matching...
[2026-07-10T15:31:45.912Z] [LOG] [ENGLISH] Match results:
[2026-07-10T15:31:45.923Z] [LOG]   └─ WORDS found: true (524 bytes)
[2026-07-10T15:31:45.934Z] [LOG] [ENGLISH] Parsing JSON objects...
[2026-07-10T15:31:45.945Z] [LOG] [ENGLISH] Parsing WORDS JSON...
[2026-07-10T15:31:45.956Z] [ERROR] [ENGLISH] ✗ JSON parse error: Unexpected token
```

❌ **문제: JSON 형식이 유효하지 않음**
- 콤마 빠짐
- 따옴표 오류
- 배열/객체 괄호 오류

💡 **해결책:**
1. Netlify 콘텐츠의 JSON 형식 확인
2. JSON validator 사용 (https://jsonlint.com)
3. Netlify의 생성 스크립트 확인

---

## 🚀 다음 단계

### 1. 앱 테스트 시작
```bash
# Expo 서버가 localhost:8082에서 실행 중
# 브라우저에서 열기: http://localhost:8082
```

### 2. 각 탭 테스트
- [ ] 홈 탭: 진행도 표시 확인
- [ ] 영어 탭: 단어 표시 확인
- [ ] TOEFL 탭: 4개 섹션 표시 확인
- [ ] 논문 탭: 논문 목록 표시 확인

### 3. 디버그 패널 확인
- [ ] 🐛 버튼 클릭 → 로그 모달 열림
- [ ] 각 탭 이동 시 로그 실시간 표시
- [ ] 색상 코딩 정상 (파란/빨간/주황)

### 4. 로그 파일 확인
```
C:\Users\dctm1\YongStudyApp\.debug-logs\
├── debug-20260710-xxxxxx.log
└── debug-index.json
```

### 5. 문제 있으면 즉시 수정
- 로그에서 정확한 원인 파악
- 코드 수정
- 다시 테스트

---

## 📚 참고 자료

- [React Native Platform API](https://reactnative.dev/docs/platform)
- [Expo Documentation](https://docs.expo.dev)
- [localStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [Regular Expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
- [JSON.parse()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)

---

**작성자:** Claude  
**마지막 업데이트:** 2026-07-10  
**상태:** 디버깅 시스템 구축 완료, 앱 테스트 진행 중
