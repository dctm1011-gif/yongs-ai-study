# Netlify 디버깅 시스템 가이드 📋

## 📍 빠른 시작

### 1️⃣ 배포 상태 확인
```bash
# 즉시 테스트
npm run test:netlify

# 또는
npm run check:functions
```

### 2️⃣ 모니터링 실행
```bash
npm run monitor:netlify
```

### 3️⃣ APK 빌드 전 검증
```bash
# GitHub Actions에서 자동 실행 또는
# 수동으로 배포 전 상태 확인
```

---

## 🔍 디버깅 시스템 구성

### 1. **Function 로깅 (_utils.mjs)**
모든 Function이 상세한 로그를 출력합니다.

**로그 형식:**
```
[function-name] message data
[function-name] ERROR: error message
[function-name] DEBUG: debug info
```

**예시:**
```
[trending-videos] Fetching trending videos { region: 'KR' }
[trending-videos] Calling YouTube API { url: '...' }
[trending-videos] Successfully fetched trending videos { count: 3 }
```

### 2. **배포 후 자동 테스트 (test-netlify.yml)**
매 배포마다 모든 엔드포인트를 자동으로 테스트합니다.

**실행 조건:**
- `netlify/functions/` 파일 수정
- `netlify.toml` 수정
- GitHub Actions 수동 실행

**결과:** 모든 엔드포인트가 200 상태 코드 반환 확인

### 3. **일일 모니터링 (daily-netlify-check.yml)**
매일 오전 6:30에 Netlify Functions 상태를 확인합니다.

**실행 시간:** 매일 06:30 UTC (KST 15:30)

**리포트:** `netlify-monitoring-report.json` 생성

**포함 내용:**
- 각 엔드포인트 응답 시간
- 상태 코드
- 에러 메시지
- 타임스탬프

### 4. **APK 빌드 전 검증 (pre-build-netlify-check.yml)**
APK 빌드 전에 백엔드 서비스가 정상인지 확인합니다.

**자동 실행:** 수동 트리거 (workflow_dispatch)

**검증 항목:**
- Health Check 엔드포인트
- Trending Videos API
- TOEFL Prefs API

**실패 시:** 빌드 중단 (백엔드 서비스 장애 방지)

---

## 🧪 로컬 테스트 방법

### A. Function 코드 분석
```bash
npm run check:functions
```

**확인 사항:**
- ✅ Handler 함수 존재
- ✅ Try-catch 에러 핸들링
- ✅ 환경 변수 null 체크
- ✅ 로깅 코드

### B. 엔드포인트 테스트
```bash
npm run test:netlify
```

**테스트 항목:**
```
✅ Health Check: /.netlify/functions/test
✅ Trending Videos: /.netlify/functions/trending-videos
✅ TOEFL Prefs GET: /api/toefl_prefs
✅ TOEFL Prefs OPTIONS: /api/toefl_prefs
```

### C. 모니터링 실행
```bash
npm run monitor:netlify
```

**출력 예시:**
```
✅ Health Check
   URL: /.netlify/functions/test
   Status: 200
   Response Time: 0.45s

✅ Trending Videos
   URL: /.netlify/functions/trending-videos
   Status: 200
   Response Time: 1.23s

Summary: 4/4 endpoints working
```

---

## ⚠️ 일반적인 문제 & 해결책

### 📌 문제 1: Functions 404 Not Found

**원인:**
- Netlify에 Functions이 배포되지 않음
- netlify.toml 설정 오류
- 빌드 프로세스 실패

**해결:**
```bash
# 1. netlify.toml 확인
cat netlify.toml

# 2. Functions 디렉토리 확인
ls netlify/functions/

# 3. 배포 로그 확인
# → Netlify Dashboard → Deployments → Build log

# 4. 강제 재배포
git push origin main
```

### 📌 문제 2: 시간 초과 (Timeout)

**원인:**
- YouTube API 느림
- 네트워크 연결 불안정
- Netlify 서버 부하

**해결:**
```bash
# 1. API 응답 시간 확인
npm run monitor:netlify

# 2. 로그에서 응답 시간 확인
# Response Time: X.XXs (10초 초과면 문제)

# 3. YouTube API 할당량 확인
# → Google Cloud Console → YouTube API → Quotas
```

### 📌 문제 3: CORS 에러

**원인:**
- Access-Control-Allow-Origin 헤더 누락
- 요청 방식 불일치

**해결:**
```javascript
// _utils.mjs에서 CORS 헤더 확인
export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
```

### 📌 문제 4: 환경 변수 없음

**원인:**
- YouTube API Key 미설정
- Netlify 환경 변수 누락

**해결:**
```bash
# 1. Netlify Dashboard → Site settings → Build & deploy
# 2. Environment variables 확인
# 3. YOUTUBE_API_KEY 설정 확인

# 로그에 표시됨:
# [trending-videos] ERROR: YouTube API key not configured
```

---

## 📊 모니터링 리포트 분석

### 리포트 파일: `netlify-monitoring-report.json`

**구조:**
```json
{
  "tests": [
    {
      "timestamp": "2026-07-17T06:30:00.000Z",
      "results": [
        {
          "name": "Health Check",
          "url": "/.netlify/functions/test",
          "status": 200,
          "success": true,
          "responseTime": 0.45,
          "timestamp": "2026-07-17T06:30:00.000Z"
        }
      ]
    }
  ]
}
```

### 분석 방법

**1. 최신 상태 확인**
```bash
tail netlify-monitoring-report.json | jq '.tests[-1]'
```

**2. 평균 응답 시간 계산**
```bash
jq '[.tests[].results[].responseTime] | add/length' netlify-monitoring-report.json
```

**3. 실패율 확인**
```bash
jq '[.tests[].results[] | select(.success==false)] | length' netlify-monitoring-report.json
```

---

## 🚀 GitHub Actions 워크플로우

### 1️⃣ test-netlify.yml
- **실행:** 배포 시 + 수동 트리거
- **목적:** Functions 즉시 검증
- **실패 시:** 알림

### 2️⃣ daily-netlify-check.yml
- **실행:** 매일 06:30 UTC
- **목적:** 일일 모니터링
- **결과:** 리포트 저장

### 3️⃣ pre-build-netlify-check.yml
- **실행:** APK 빌드 전 (수동)
- **목적:** 백엔드 서비스 검증
- **실패 시:** 빌드 중단

---

## 📋 체크리스트

### APK 배포 전
- [ ] `npm run test:netlify` 모두 통과
- [ ] `npm run monitor:netlify` 4/4 endpoints 정상
- [ ] YouTube API Key 설정 확인
- [ ] Netlify 환경 변수 설정 확인
- [ ] 최근 리포트(`netlify-monitoring-report.json`) 확인

### APK 배포 후
- [ ] 배포된 APK에서 기능 테스트
- [ ] YouTube 트렌딩 영상 로드 확인
- [ ] TOEFL 데이터 저장/로드 확인
- [ ] 이상 발생 시 로그 분석

### 매일 아침
- [ ] GitHub Actions 일일 리포트 확인
- [ ] `netlify-monitoring-report.json` 최신 상태 확인
- [ ] 에러 발생 시 즉시 대응

---

## 📞 문제 해결 절차

**Step 1:** 로컬 테스트
```bash
npm run test:netlify
npm run monitor:netlify
```

**Step 2:** 로그 분석
```bash
# Netlify Dashboard → Functions → 각 함수 로그
# 또는 GitHub Actions → 워크플로우 실행 로그
```

**Step 3:** 환경 변수 확인
```bash
# Netlify Dashboard → Site settings → Environment
```

**Step 4:** 배포 재시도
```bash
git push origin main
# 또는 Netlify Dashboard에서 수동 배포
```

**Step 5:** 모니터링 확인
```bash
npm run monitor:netlify
```

---

## 📈 성능 최적화

### 응답 시간 개선
```javascript
// 캐싱 활용
headers: {
  'Cache-Control': 'max-age=3600',  // 1시간 캐시
}
```

### 동시성 제한
```javascript
// 한 번에 너무 많은 요청 방지
const maxResults = 5;  // 최대 5개
```

### 타임아웃 설정
```bash
# npm run test:netlify에서 10초 타임아웃
timeout: 10000
```

---

**마지막 업데이트:** 2026-07-17  
**관리자:** Netlify 모니터링 시스템
