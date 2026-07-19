# YongStudy - Obsidian 정리 프로젝트 가이드

---

## 🔥 Netlify-Firebase 데이터 연동 결정 로그

### investment-daily.mjs: 출처(source) + 그래프 데이터(chartData) 추가 (2026-07-20)

**목적**: 투자 칼럼에 신뢰도(출처)와 시각적 추이(그래프)를 추가

**Firebase 데이터 흐름**:
- 저장 경로: `/investment/columns/{date}` (기존 경로 재사용, 새 경로 없음)
- 각 칼럼 객체에 필드 2개 추가:
  - `source: string` — 출처 텍스트 (예: "국토교통부 실거래가 공개시스템")
  - `chartData: { label: string; value: number }[]` — 그래프용 숫자 시계열 데이터
- 저장 방식: 기존과 동일하게 매일 06:00 KST(UTC 21:00) 스케줄 함수가 `set()`으로 전체 덮어쓰기

**결정 이유**: 실제 이미지(figure) 저장은 Firebase Storage 추가 연동과 서버 측 이미지 생성이 필요해 복잡도가 큼. 현재 investment-daily.mjs가 mock 데이터 생성 방식이라, 숫자 데이터 + 앱 내 자체 렌더링(막대그래프, 외부 차트 라이브러리 없이 View로 직접 구현)이 더 단순하고 일관됨.

**앱 반영**:
- `src/hooks/useInvestmentSync.ts`: `InvestmentColumn` 타입에 `source?`, `chartData?` 추가
- `src/app/investment.tsx`: 상세보기 모달에 `BarChart` 컴포넌트(자체 구현) + 출처 텍스트 렌더링

---

## 🔒 절대 규칙 (개인정보 보호)

### ❌ 휴대폰 데이터 서버 업로드 금지
- **규칙**: 휴대폰의 스크린샷, 갤러리, 기기 정보는 **로컬에서만 탐색**
- **절대 금지**: 서버, 클라우드, 외부 서비스에 업로드
- **적용**: `adb pull` 시 로컬 임시 폴더에만 저장 후 분석
- **삭제**: 분석 후 즉시 로컬 파일 삭제

### ⚠️ USB 연결 제거 시 앱 에러
- **문제**: USB 제거 → Metro Bundler `localhost:8081` 연결 불가
- **해결**: `npx expo start --lan` 으로 Wi-Fi(컴퓨터 IP) 연결
- **IP 주소**: `192.168.219.116:8081`
- **절차**:
  1. USB 제거 전: 컴퓨터와 핸드폰이 같은 Wi-Fi 네트워크 연결
  2. Metro Bundler: `npx expo start --lan` 으로 시작
  3. 앱에서 자동 재연결 또는 개발 메뉴에서 IP 변경

---

## 📌 프로젝트 개요

**목표:** YongStudyApp 개발 과정을 Obsidian 노트에 체계적으로 정리

**구조:**
- Step 0: 로컬 개발 & 테스트
  - 3-1. CI-CD에 Metro 번들러란?
  - 3-2. 빌드 우선순위 정책: 로컬 먼저

---

## 🎯 문서화 방식

### 요청 예시
```
사용자: "옵시디언 3-1에 Metro 번들러란? 관련 내용이 있고 그 아래에 지금 현상을 적어놓으라고"

내가 해야 할 일:
1. CLAUDE.md에서 해당 섹션 찾기
2. 그 섹션의 구조에 맞춰 내용 정리
3. 관련 로그/분석 결과 추가
4. Obsidian 형식 유지 (마크다운 + wikilinks)
```

---

## 📂 Step 0: 로컬 개발 & 테스트

### 3-1. CI-CD에 Metro 번들러란?

#### Metro 번들러의 역할

**정의:** React Native/Expo 앱의 JavaScript 번들러

**작동 흐름:**
```
src/ 디렉토리의 .ts/.tsx 파일들
    ↓ [1단계: Module Scanning]
모든 import/require 관계 분석
    ↓ [2단계: Dependency Analysis]
의존성 그래프 생성
    ↓ [3단계: Babel Transformation]
TypeScript/ES6 → JavaScript/ES5 변환
    ↓ [4단계: Bundle Creation]
모든 모듈을 하나의 번들 파일로 병합
    ↓ [5단계: Optimization]
Dead code elimination, minification
    ↓ [6단계: Output]
index.android.js / index.ios.js 생성
    ↓
모바일 런타임에서 실행
```

#### Metro 번들러의 특성

| 특성 | 설명 |
|------|------|
| **침묵하는 진행** | 실시간 진행 바 없음, 완료까지 로그 제한적 |
| **메모리 집약** | 큰 프로젝트는 300MB+ 메모리 소비 |
| **캐시 의존** | 이전 빌드 재사용 → 빠른 리빌드 |
| **포트 고정** | 기본 포트 8081에서 개발 서버 실행 |
| **I/O 바운드** | 디스크 읽기/쓰기 많음 |

#### 번들링 로그 패턴

```
Starting Metro Bundler
  ↓ 번들러 시작
warning: Bundler cache is empty, rebuilding (this may take a minute)
  ↓ 캐시 초기화 선언
Waiting on http://localhost:8081
  ↓ 포트 8081에서 대기
Logs for your project will appear below.
  ↓ 로그 준비 완료
[침묵 구간 1-2분]
  ↓ Module scanning, Babel transformation, Bundle creation 진행
  ↓ (로그 출력 안 함, 백그라운드 진행)
[번들 완료 또는 에러 메시지]
```

---

### 📊 YongStudy 번들링 현상 분석 (2026-07-11)

#### 발견된 문제

**증상:**
```
Starting Metro Bundler
Waiting on http://localhost:8081
Logs for your project will appear below.
[그 이후 로그 없음 - 30분 이상]
```

**근본 원인들 (누적):**

1. **TypeScript 파일 인코딩 오류** ✅ 해결
   - 파일: `src/app/_layout.tsx`
   - 문제: 한글 문자 깨짐 (?? 표시)
   - 결과: 따옴표 미폐쇄 → 구문 오류 → 번들링 중단
   - 해결: 파일 전체 재작성 (UTF-8 인코딩)

2. **패키지 버전 호환성** ✅ 해결
   - 문제: Expo SDK 54와 불일치하는 8개 패키지
   - 예: react 18.2.0 (expected: 19.1.0)
   - 결과: 번들러 경고 + 번들링 시간 증가
   - 해결: package.json 버전 업데이트

3. **Metro 캐시 문제** ✅ 관리 중
   - 문제: 이전 빌드 캐시가 번들러 혼란 야기
   - 해결: `--clear` 옵션으로 캐시 초기화

#### 현재 상태 (최신 분석)

**타이밍:** 2026-07-11 ~ 현재

**관찰 결과:**
```
Metro 프로세스 PID: 19444
메모리 사용: 142.05 → 142.18 MB (천천히 증가)
CPU 활용도: 29%
상태: 번들링 진행 중 (느림)

→ 번들러가 실제로 작동 중입니다!
→ 하지만 매우 느리게 진행 (I/O 바운드 추정)
```

**진행 단계:**
```
✅ Stage 1: Starting Metro Bundler
✅ Stage 2: Bundler cache rebuild
✅ Stage 3: Port listening (8081)
⏳ Stage 4-6: Module scanning ~ Bundle creation (진행 중)
   - Module scanning & dependency analysis
   - Babel transformation (TS → JS, ES6 → ES5)
   - Bundle creation & merging
⏳ Stage 7+: Output generation, device upload
```

**예상 완료 시간:**
- 첫 번들: 2-5분 (느린 I/O)
- 현재 경과: 5분+

#### 모니터링 데이터

```
[모니터링 구간 - 30초]
[5초]  메모리: 142.05MB | CPU: 8.859초 | ✅ 변화
[10초] 메모리: 142.05MB | CPU: 8.875초 | ⚠️ 정체
[15초] 메모리: 142.07MB | CPU: 8.875초 | ✅ 변화
[20초] 메모리: 142.11MB | CPU: 8.875초 | ✅ 변화
[25초] 메모리: 142.18MB | CPU: 8.890초 | ✅ 변화
[30초] 메모리: 142.18MB | CPU: 8.890초 | ⚠️ 정체

결론: 메모리 천천히 증가, CPU 낮음 → I/O 대기 추정
```

#### 다음 단계

- [ ] 번들링 완료 대기 (5-10분 더)
- [ ] 완료되지 않으면 다른 방식 시도
- [ ] 앱 로드 상태 확인
- [ ] 🐛 Debug Panel 작동 확인

---

### 3-2. 빌드 우선순위 정책: 로컬 먼저

#### 정책

**모든 빌드는 이 순서로 진행:**
```
로컬 빌드 검증 → 성공 → 기기 테스트 → EAS 빌드 → 배포
```

#### 왜 로컬 빌드를 먼저 하는가?

| 비교항목 | 로컬 빌드 | EAS 빌드 |
|---------|---------|---------|
| **빌드 시간** | 5-15분 | 10-20분 |
| **에러 메시지** | 🟢 상세함 | 🔴 "Unknown error" |
| **실시간 테스트** | ✅ 즉시 | ❌ 다운로드 필요 |
| **크레딧 소모** | ❌ 없음 | ✅ 소모됨 |
| **피드백 주기** | 🟢 빠름 | 🔴 느림 |

#### 워크플로우

```
1️⃣ 코드 변경
   ↓
2️⃣ 로컬 빌드
   $ npx expo run:android
   
   ├─ ✅ 성공 → 3️⃣로 (99% 이전 에러 잡힘)
   └─ ❌ 실패 → 컴파일 에러 출력 → 수정 후 재시도
   ↓
3️⃣ 로컬 기기 테스트
   $ adb install -r [APK]
   $ adb shell am start -n com.dctm1011.yongstudy/.MainActivity
   
   ├─ ✅ 정상 작동 → 4️⃣로
   └─ ❌ 크래시 → 로그 확인 & 수정 → 2️⃣로
   ↓
4️⃣ EAS 빌드 (선택사항)
   $ eas build --platform android
   
   (배포 전 최종 클라우드 검증 필요 시에만)
```

#### 로컬 빌드 실패 시 해결책

**Gradle 컴파일 에러:**
```
해결: CLAUDE.md의 Android 설정 섹션 참고
     (android/gradle.properties, app/build.gradle 등)
```

**APK 설치 실패 - 서명 충돌:**
```
Error: INSTALL_FAILED_UPDATE_INCOMPATIBLE

원인: 기존 앱과 새 APK의 서명이 다름
해결:
  $ adb uninstall com.dctm1011.yongstudy
  $ adb install -r [APK 경로]
```

**앱 실행 후 크래시:**
```
1. 로그 확인:
   $ adb logcat | grep YongStudy
   
2. 로그에서 에러 라인 찾기
3. 소스 코드 수정
4. 로컬 빌드 다시 시작
```

#### 현재 상태 (2026-07-13)

```
🟢 로컬 빌드: 성공 (Build 11)
   - 빌드 시간: 7m 43s
   - 작업 수: 209개 (188 실행, 21 캐시)
   - APK 생성 완료

🟢 설치 & 실행: 성공
   - 기존 앱 제거 (adb uninstall)
   - 새 APK 설치 (adb install -r)
   - 앱 정상 실행 확인

⏳ 다음 단계:
   → 기능 테스트 진행 (최소 Hello World)
   → 기본 탭 네비게이션 추가 (점진적)
   → 데이터 표시 추가 (마지막)
   → EAS 배포는 이후
```

#### 적용 규칙

| 상황 | 로컬 빌드 | EAS 빌드 |
|------|---------|---------|
| 코드 수정 | 필수 | 불필요 |
| 설정 변경 | 필수 | 필수 |
| 테스트 전 | 필수 | 선택 |
| 배포 전 | 필수 | 선택 |

---

## 💡 사용 가이드

### Obsidian 기록 워크플로우

**사용자가 요청할 때:**
```
"옵시디언에 [내용] 기록해"
```

**내가 할 일:**
1. Obsidian Vault 위치 확인: `C:\Users\dctm1\OneDrive\문서\Obsidian Vault`
2. CLAUDE.md에서 해당 섹션의 최신 분석 내용 확인
3. 3개 위치에 동시 기록:
   - 📍 3-1-CI-CD/📌 index.md (해당 주제별 상세 기록)
   - 📍 2-3-YongStudy 시스템 구성도/📌 index.md (전체 진행 상황)
   - 📍 0-2-현재_진행_상황.md (최신 업데이트)
4. Wikilinks 형식 유지 ([[파일명|표시텍스트]])
5. 마크다운 형식 준수

### CLAUDE.md의 역할

**=의 저장소:**
- 현재 기술적 분석
- 문제 분석 및 해결 과정
- 모니터링 데이터
- 실시간 로그 기록

**업데이트 주기:** 기술적 변화 시마다 즉시 업데이트

---

**생성:** 2026-07-11  
**마지막 수정:** 2026-07-13  
**상태:** 구축 중 (Step 0 - 3-1 진행 중)

---

## 🤖 자동 작업 규칙 (2026-07-13)

### PowerShell Auto-Allow
**규칙:** PowerShell 명령 실행 시 `dangerouslyDisableSandbox: true` 자동 설정

**적용 대상:**
- npm/npx 빌드 명령
- gradle 빌드 명령
- adb 기기 명령
- git 작업
- 파일 시스템 작업

**예시:**
```powershell
# ✅ 자동 allow (매번 권한 프롬프트 없음)
cd C:\Users\dctm1\YongStudyApp
npx expo run:android
```

**원칙:** 사용자가 한 번 allow한 유사 명령은 자동 실행, 새로운 타입의 명령만 확인

### 자동 디버깅
**규칙:** 사용자가 명시적으로 요청하지 않아도 자동으로 문제 해결

**적용 범위:**
- 빌드 에러 자동 수정
- 로그 모니터링
- 앱 크래시 분석
- 설정 파일 자동 수정

**보고:** 
- 주요 성과만 요약
- 자세한 로그는 요청할 때만 제시

---

## 🤖 자동 APK 설치 & 로그 모니터링 (2026-07-11)

### 워크플로우

**유선 연결 전제:**
```
핸드폰 ←(USB 유선)→ 컴퓨터
adb devices: device 상태 확인됨
```

**자동 설치 프로세스:**
```
1️⃣ EAS Build 완료 확인
   └─ eas build:list로 최신 빌드 상태 체크
   
2️⃣ APK URL 자동 추출
   └─ https://expo.dev/artifacts/eas/[ID].apk
   
3️⃣ 핸드폰에 자동 설치
   └─ adb install -r [APK 경로]
   
4️⃣ 앱 자동 실행
   └─ adb shell am start -n com.dctm1011.yongstudy/.MainActivity
   
5️⃣ 실시간 로그 모니터링
   └─ adb logcat | grep YongStudy
   
6️⃣ 크래시 감지
   └─ "FATAL EXCEPTION" 또는 "Error" 감지 시 즉시 표시
```

### 구현 방식

**Python/PowerShell 자동화 스크립트:**
```
매 5분마다:
1. eas build:list로 새 빌드 확인
2. 완료되었으면 APK 다운로드
3. adb install로 설치
4. adb shell로 앱 실행
5. adb logcat 모니터링 시작
6. 에러 감지 시 즉시 보고
```

### 언제 필요한가?

| 상황 | 자동 설치 필요? |
|------|----------------|
| 로컬 웹 개발 (Expo) | ❌ 불필요 |
| 단일 APK 테스트 | ❌ 한 번만 설치 |
| **반복 빌드/테스트** | ✅ **필수** |
| **크래시 디버깅** | ✅ **필수** |
| **CI/CD 검증** | ✅ **필수** |

### 자동 디버깅 프로세스

**실시간 로그 모니터링:**

```powershell
# 1단계: APK 설치 후 앱 실행 (위의 자동 설치 프로세스)
adb install -r [APK 경로]
adb shell am start -n com.dctm1011.yongstudy/.MainActivity

# 2단계: 로그 버퍼 초기화
adb logcat -c

# 3단계: 실시간 모니터링 (필터링)
adb logcat | grep -E "YongStudy|Error|Exception|FATAL|Crash"
```

**자동 디버깅 매트릭:**

| 감지 항목 | 출력 | 대응 |
|----------|------|------|
| `FATAL EXCEPTION` | 🔴 **크래시** | 즉시 로그 출력 + 에러 분석 |
| `Error` | 🟠 **경고** | 에러 메시지 기록 |
| `Exception` | 🟠 **경고** | 스택 트레이스 수집 |
| 아무것도 없음 | 🟢 **정상** | 앱 정상 실행 중 |

**대응 플로우:**

```
빌드 완료
  ↓
APK 다운로드 & 설치
  ↓
앱 자동 실행
  ↓
adb logcat 모니터링 시작
  ↓
├─ FATAL 감지 → 즉시 중단 & 에러 분석
├─ Error 감지 → 기록 & 계속 모니터링
└─ 정상 실행 → 🟢 테스트 완료
```

### 현재 상태

```
🟢 준비 완료:
  ✅ 핸드폰 USB 유선 연결
  ✅ adb devices 인식
  ✅ 빌드 파이프라인 구성
  ✅ 자동 설치 스크립트 준비
  ✅ 자동 디버깅 활성화

⏳ 다음:
  → 최종 빌드 진행 중 (Hermes 완전 비활성화)
  → 빌드 완료 후 자동 설치 & 로그 모니터링
```
