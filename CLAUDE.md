# YongStudy - Claude 작업 규칙

## 프로젝트 위치

| 프로젝트 | 경로 | 설명 |
|---------|------|------|
| **YongStudyApp** | `C:\Users\dctm1\YongStudyApp` | React Native/Expo 학습 앱 (메인) |
| **WirelessDebugHelper** | `C:\Users\dctm1\WirelessDebugHelper` | Android 앱 — 무선 ADB + 승인 알림 |
| **HW_LAB** | `C:\Users\dctm1\Projects\HW_LAB` | React Native 앱 |
| **HERALD PCB** | `C:\Users\dctm1\Projects\HERALD` | KiCad PCB 스키매틱 |
| **english-bot** | `C:\Users\dctm1\english-bot` | Discord Node.js 영어 학습 봇 |
| **claude-token-monitor** | `C:\Users\dctm1\claude-token-monitor` | Claude 토큰 사용량 모니터 |
| ↳ investment 생성 | `C:\Users\dctm1\YongStudyApp\investment` | Python 투자 데이터 생성 (YongStudyApp 서브) |
| ↳ Netlify 함수 | `C:\Users\dctm1\YongStudyApp\netlify\functions` | 스케줄 함수 (investment/english/toefl-daily.mjs) |

## 절대 규칙 (개인정보 보호)
- 휴대폰 스크린샷/갤러리/기기 정보는 로컬에서만 탐색
- 서버/클라우드/외부 서비스 업로드 절대 금지
- `adb pull` 시 로컬 임시 폴더에만 저장, 분석 후 즉시 삭제

## PowerShell 자동 실행
- 모든 PowerShell 명령은 `dangerouslyDisableSandbox: true` 자동 적용 (승인 프롬프트 없음)

## 기기 연결
- ADB 무선: `adb connect 192.168.219.135:42255`
- 같은 Wi-Fi에서만 작동 (포트는 재부팅마다 바뀔 수 있음)

## 빌드 명령

### ✅ JS 변경 시 — OTA 업데이트 (기본, 항상 우선)
JS/TS/스타일 변경(네이티브 모듈 추가 없음)은 전부 OTA로 배포한다. APK 빌드 불필요.
```bash
cd /c/Users/dctm1/YongStudyApp
eas update --channel production --message "변경 내용 한 줄 요약"
```
- 앱 재시작 시 자동 적용 (runtimeVersion 1.0.0 → Android production 채널)
- 네이티브 변경(새 패키지 설치, android/ 수정 등)은 아래 APK 빌드 필요

### ⚠️ 로컬 빌드 주의사항
- `android/local.properties`는 반드시 **슬래시** 경로 사용 (`C:/Users/...` ← 맞음, `C:\Users\...` ← 틀림)
- 역슬래시는 Java properties 파서가 이스케이프로 처리해 SDK 경로를 깨뜨림 → Gradle 설정 단계 실패
- Gradle이 설정 단계에서 실패하면 빌드 태스크가 하나도 실행되지 않아 기존 APK가 그대로 남음
- `tee`로 로그를 파이프하면 종료코드가 0으로 보여 성공처럼 보이므로 반드시 `BUILD SUCCESSFUL` 문자열로 확인

### 로컬 APK 빌드 (권장: 스크립트 사용)
```bash
# Git Bash에서 실행 — local.properties 자동 수정 + .env 로드 + 결과 검증
bash C:\Users\dctm1\YongStudyApp\build-apk.sh
# 출력: android/app/build/outputs/apk/release/app-release.apk
```

### 수동 빌드 (직접)
```bash
# 1. local.properties 확인 (슬래시 경로인지 반드시 체크)
cat android/local.properties
# 올바른 형태: sdk.dir=C:/Users/dctm1/AppData/Local/Android/Sdk

# 2. .env 로드 후 빌드
cd C:\Users\dctm1\YongStudyApp
set -a && source .env && set +a
cd android && ./gradlew assembleRelease
# 출력: android/app/build/outputs/apk/release/app-release.apk
```

### APK 설치
```bash
adb install -r "C:\Users\dctm1\YongStudyApp\android\app\build\outputs\apk\release\app-release.apk"
```

### WirelessDebugHelper APK
```bash
cd C:\Users\dctm1\WirelessDebugHelper
./gradlew assembleDebug
```

## Firebase 데이터 경로
- 투자 칼럼: `/investment/columns/{YYYY-MM-DD}` → `{ columns[], termOfDay, newsArticles[], timestamp }`
- 승인 요청: `/approvals/pending/{key}` → `{ toolName, summary, status, createdAt }`
- 개발 로그: `/devlog/events`

## 투자 데이터 생성
API 키는 `.env`(git 추적 안 됨)에 저장돼 있음. 실행 전 로드:
```powershell
cd C:\Users\dctm1\YongStudyApp
Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }
cd investment
python generate_investment.py
```
- Netlify 함수가 매일 06:00 KST에 자동 실행 (`netlify/functions/investment-daily.mjs`)
- 코드 변경 후에는 반드시 `git push` 해야 Netlify에 반영됨

## 2주택 이상 소유 비율 갱신 (연 1회, 수동)
```powershell
cd C:\Users\dctm1\YongStudyApp
Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }
cd investment
python fetch_multi_owner_ratio.py
```
- 출처: KOSIS 국가통계포털 Open API, 표 DT_1OH0407(거주지역/주택소유물건수별 주택소유 가구수)
- 통계청이 그 해 자료를 보통 11월경 갱신 → 출력된 값을 `realestate_api.py`의 `MULTI_OWNER_RATIO`와
  `src/hooks/useInvestmentSync.ts`의 `MULTI_OWNER_RATIO_FALLBACK`에 수동으로 복사해 넣을 것 (자동 반영 아님)

## API 비용 규칙
- 모든 Claude API 호출은 `claude-haiku-4-5-20251001` 사용
- Sonnet/Opus는 명시적 요청 시만
- 일일 $1+ 사용 시 즉시 중단 후 보고
