# 🔧 YongStudy 전체 디버깅 시스템 가이드

> 모든 기능이 정상 작동하는지 자동으로 확인하는 통합 디버깅 시스템

---

## 📊 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                   YongStudy 디버깅 시스템                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1️⃣ 코드 검증 (Pre-Build)                                    │
│     └─ TypeScript 컴파일 체크                                │
│     └─ 구조 검증                                             │
│     └─ 일반적인 문제 감지                                    │
│                                                               │
│  2️⃣ 헬스 체크 (App Level)                                    │
│     └─ English 탭: 데이터 로드 & 설정                       │
│     └─ TOEFL 탭: 데이터 & 알림 설정                         │
│     └─ Play 탭: Netlify API 연결                            │
│     └─ Papers 탭: 데이터 로드                                │
│     └─ Settings 탭: 저장 기능 & 공지사항 API                │
│                                                               │
│  3️⃣ Netlify 디버깅 (Backend Level)                          │
│     └─ 배포 후 자동 테스트 (test-netlify.yml)              │
│     └─ 일일 모니터링 (daily-netlify-check.yml)             │
│     └─ 함수별 상세 로깅 (_utils.mjs)                       │
│     └─ 배포 전 검증 (pre-build-netlify-check.yml)          │
│                                                               │
│  4️⃣ 공지사항 시스템                                          │
│     └─ 자동 업데이트 알림                                    │
│     └─ 읽음 상태 추적                                        │
│     └─ 중요도별 분류                                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 빌드 전 체크리스트 (3단계)

### Step 1️⃣: 코드 검증 (로컬)

```bash
# TypeScript 컴파일 확인
npx tsc --noEmit

# 의존성 확인
npm ci

# 구조 검증
npm run check:functions  # Netlify Functions 검증
```

**실패 시:**
- ❌ TypeScript 오류: 오류 메시지 참고하여 수정
- ❌ 의존성 오류: `npm install` 실행
- ❌ 구조 오류: 파일 누락 확인

---

### Step 2️⃣: Netlify 검증 (백엔드)

```bash
# 배포 상태 확인
npm run test:netlify

# 일일 모니터링 (선택)
npm run monitor:netlify
```

**예상 결과:**
```
✅ Health Check: 200
✅ Trending Videos: 200
✅ TOEFL Prefs GET: 200
✅ TOEFL Prefs OPTIONS: 204

Summary: 4/4 endpoints working
```

**실패 시:**
- ❌ 404 Not Found: Netlify 배포 미완료 (5-10분 대기)
- ❌ 500 Error: Functions 로그 확인
  - Netlify Dashboard → Functions → 함수명 → 로그

---

### Step 3️⃣: APK 빌드 & 헬스 체크 (앱 레벨)

```bash
# 1. APK 빌드
./android/gradlew.bat -p android assembleRelease

# 2. 기기에 설치
adb install -r android/app/build/outputs/apk/release/app-release.apk

# 3. 앱 실행 후 Settings 탭에서
#    "🏥 헬스 체크 실행" 버튼 클릭
```

**헬스 체크 검사 항목:**

| 탭 | 검사 내용 | 예상 결과 |
|------|---------|---------|
| English | 데이터 로드, 숨기기 설정 | ✅ 정상 |
| TOEFL | 데이터, 알림 설정 | ✅ 정상 또는 ⚠️ 경고 |
| Play | Netlify API 연결 | ✅ 정상 |
| Papers | 데이터 로드 | ✅ 정상 또는 ⚠️ 경고 |
| Settings | 저장 기능, 공지사항 API | ✅ 정상 |

**결과 해석:**
- 🟢 **정상 (Healthy)**: 모든 기능 작동
- 🟡 **경고 (Warning)**: 작동하지만 일부 미설정
- 🔴 **오류 (Error)**: 기능 불가

---

## 🔍 각 디버깅 시스템 상세 설명

### 1️⃣ Pre-Build Health Check (Code Level)

**위치:** `.github/workflows/pre-build-health-check.yml`

**실행 시점:**
- PR 생성 시 자동 실행
- 수동 트리거 (`workflow_dispatch`)

**검사 항목:**
```
✅ TypeScript 컴파일
✅ 구문 오류 감지
✅ debugger 문 확인
✅ 필수 파일 존재 확인
✅ 컴포넌트 구조 검증
```

**로그 확인:**
```
GitHub → Actions → Pre-Build Health Check → 실행 선택
```

---

### 2️⃣ App-Level Health Check (Settings 탭)

**위치:** `src/hooks/useHealthCheck.ts` + Settings 탭

**기능:**
- 각 탭의 기본 기능 검증
- API 연결 테스트
- 저장 기능 테스트
- 결과를 `lastHealthCheck` 로컬 저장

**사용 방법:**
```
1. 앱 실행 → Settings 탭
2. "🏥 헬스 체크 실행" 클릭
3. 진행 중... (3-5초)
4. 결과 표시
5. "📊 상세 결과" 탭에서 각 탭별 상태 확인
```

**결과 저장:**
- 로컬: AsyncStorage (`lastHealthCheck`)
- GitHub Actions: 이후 개선 가능

---

### 3️⃣ Netlify Functions 디버깅 (Backend Level)

**3가지 계층:**

#### 🟢 배포 후 자동 테스트
**위치:** `.github/workflows/test-netlify.yml`

**실행 시점:**
- `netlify/functions/` 파일 수정
- `netlify.toml` 수정
- 수동 트리거

**검사:**
```
✅ test 함수 (헬스 체크)
✅ trending-videos 함수
✅ toefl_prefs 함수
✅ english_prefs 함수
```

#### 🟡 일일 모니터링
**위치:** `.github/workflows/daily-netlify-check.yml`

**실행 시점:**
- 매일 06:30 UTC (KST 15:30)
- 수동 트리거

**결과:**
```
netlify-monitoring-report.json 생성
├─ 응답 시간
├─ 상태 코드
├─ 에러 메시지
└─ 타임스탠프 (30일 이력)
```

#### 🔴 함수별 상세 로깅
**위치:** `netlify/functions/_utils.mjs`

**로깅 형식:**
```javascript
// 1. 요청 시작
[trending-videos] Fetching trending videos { region: 'KR' }

// 2. API 호출
[trending-videos] Calling YouTube API { url: '...' }

// 3. 결과
[trending-videos] Successfully fetched trending videos { count: 3 }

// 4. 에러
[trending-videos] ERROR: YouTube API key not configured
```

**로그 확인:**
```
Netlify Dashboard → Functions → 함수명 → Logs
```

---

### 4️⃣ 공지사항 시스템

**위치:** `netlify/functions/announcements.mjs` + 앱

**기능:**
- 매일 업데이트 자동 알림
- 읽음/미읽 추적
- 중요도별 분류 (critical > high > normal)

**API 엔드포인트:**
```
GET /api/announcements       # 공지사항 조회
POST /api/announcements      # 공지사항 생성 (서버)
DELETE /api/announcements    # 공지사항 삭제 (서버)
```

**앱에서 확인:**
- 시작 시: 미읽 공지사항 자동 표시
- Settings 탭: "📢 공지사항 보기" 클릭
- 배지: 미읽 개수 표시

---

## 🛠️ 문제 해결 가이드

### 📌 Problem 1: APK 빌드 실패

**원인 분석:**
```bash
# Step 1: TypeScript 컴파일 확인
npx tsc --noEmit

# Step 2: 의존성 확인
npm ci

# Step 3: 빌드 재시도
./android/gradlew.bat -p android assembleRelease --stacktrace
```

**일반적인 원인:**
- ❌ TypeScript 오류
- ❌ 누락된 import
- ❌ 모듈 버전 충돌
- ❌ Gradle 캐시 오류

---

### 📌 Problem 2: 헬스 체크 실패

**각 탭별 대응:**

**English 탭:**
```
⚠️ 데이터 로드 불가
→ AsyncStorage에 데이터가 없음
→ 해결: 단어 추가 후 저장
```

**TOEFL 탭:**
```
⚠️ 기본 데이터 로드 실패
→ 초기 데이터 미설정
→ 해결: 앱 재시작
```

**Play 탭:**
```
❌ API 오류: 500
→ Netlify Functions 에러
→ 해결: `npm run test:netlify` → 로그 확인
```

**Settings 탭:**
```
❌ 저장 기능 실패
→ AsyncStorage 권한 문제
→ 해결: 앱 권한 확인 및 재설치
```

---

### 📌 Problem 3: Netlify Functions 404

**원인:**
- Netlify에 Functions 배포 안 됨
- netlify.toml 설정 오류

**해결:**
```bash
# 1. netlify.toml 확인
cat netlify.toml

# 2. 강제 재배포
git push origin main

# 3. Netlify 배포 완료 대기 (5-10분)

# 4. 테스트
npm run test:netlify
```

---

## 📈 성능 메트릭

### API 응답 시간 목표
```
trending-videos: < 2초
toefl_prefs:     < 1초
english_prefs:   < 1초
announcements:   < 1초
```

### 앱 헬스 체크 시간
```
전체: 3-5초
개별: 100-500ms
```

---

## 🔄 자동화 워크플로우

```
개발자가 코드 푸시
  ↓
1️⃣ Pre-Build Health Check
   └─ TypeScript 컴파일 & 구조 검증
   └─ 실패 → 푸시 거부
  ↓
2️⃣ Netlify 배포 (자동)
   └─ netlify.toml 에 따라 Functions 배포
  ↓
3️⃣ Post-Deploy Test (test-netlify.yml)
   └─ 30초 대기 (배포 시간)
   └─ 모든 엔드포인트 테스트
   └─ 실패 → Slack/GitHub 알림
  ↓
4️⃣ APK 빌드 (수동)
   └─ Gradle Release APK 빌드
   └─ 기기에 설치
  ↓
5️⃣ App-Level Health Check (수동)
   └─ Settings 탭에서 "🏥 헬스 체크 실행"
   └─ 모든 탭 검증
   └─ 결과 저장
```

---

## 📋 배포 체크리스트

### 코드 푸시 전
- [ ] `npx tsc --noEmit` 통과
- [ ] 새 콘솔 에러 없음
- [ ] 모든 import 정상

### APK 빌드 전
- [ ] `npm run test:netlify` 4/4 통과
- [ ] Netlify 배포 완료 (5-10분)
- [ ] 5개 탭 코드 변경 없음

### APK 설치 후
- [ ] 앱 실행 성공
- [ ] Settings 탭에서 "🏥 헬스 체크 실행"
- [ ] 5개 탭 모두 ✅ 정상
- [ ] 각 탭 기능 수동 테스트

### 배포 후
- [ ] 공지사항 추가 (옵션)
- [ ] 일일 모니터링 검토 (06:30 UTC 이후)
- [ ] 사용자 피드백 수집

---

## 📞 빠른 참조

**로컬 테스트:**
```bash
npm run test:netlify        # Netlify endpoints
npm run monitor:netlify     # Daily check
npm run check:functions     # Code analysis
npx tsc --noEmit           # TypeScript
```

**GitHub Actions 확인:**
```
GitHub → Actions → 워크플로우명 → 최신 실행 선택
```

**Netlify 로그 확인:**
```
Netlify Dashboard → Site → Functions → 함수명 → Logs
```

**앱 헬스 체크:**
```
Settings 탭 → "🏥 헬스 체크 실행" → 결과 확인
```

---

**생성:** 2026-07-17  
**최종 업데이트:** 2026-07-17  
**상태:** ✅ 완성
