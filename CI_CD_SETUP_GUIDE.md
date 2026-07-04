# YongStudyApp - GitHub Actions CI/CD 구축 가이드

**상태:** 준비 완료, 웹 설정 대기 중  
**생성 날짜:** 2026-07-04

---

## 현재 진행 상황

### ✅ 완료된 것
- GitHub Actions 워크플로우 파일 생성: `.github/workflows/build-apk.yml`
- EAS CLI 업그레이드 (v20.5.1)
- EAS 로컬 인증 확인 (dctm1011@naver.com)
- 로컬 git 저장소 상태 확인

### ❌ 남은 것 (웹에서 수동 설정)
- GitHub 저장소 생성
- EAS 토큰 발급
- GitHub Secrets 저장소 설정
- 코드 커밋 & push

---

## 단계별 수행 가이드 (집에서)

### Step 1️⃣: GitHub 저장소 생성 (5분)

**URL:** https://github.com/new

**설정값:**
```
Repository name: YongStudyApp
Description: AI-powered learning platform - React Native
Visibility: Public
Add .gitignore: Node
Create repository
```

**완료 후:**
- 생성된 저장소 URL 복사 (예: https://github.com/dctm1011/YongStudyApp)

---

### Step 2️⃣: EAS 토큰 발급 (5분)

**URL:** https://expo.dev/accounts/dctm1011/settings/access-tokens

**또는 수동:**
1. https://expo.dev 로그인
2. 좌측 Settings
3. Access Tokens
4. Create
5. Name: `github-actions-cicd`
6. Create Token
7. **긴 문자열 복사 (다시 안 보임)**

**예상 형식:**
```
ey1234567890abcdefghijklmnopqrstuvwxyz...
```

---

### Step 3️⃣: GitHub Secrets 저장 (5분)

**URL:** https://github.com/YOUR_USERNAME/YongStudyApp/settings/secrets/actions

**수행:**
1. New repository secret
2. Name: `EAS_TOKEN`
3. Secret: (Step 2에서 복사한 토큰 전체)
4. Add secret

---

### Step 4️⃣: 로컬에서 git 연결 (내 도움 필요)

**집에 가서 다음 정보와 함께 연락:**
```
1. GitHub 저장소 URL (Step 1 완료)
2. EAS 토큰 (Step 2 완료)
3. GitHub Username (dctm1011 확인)
```

**그럼 내가 해줄 것:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/YongStudyApp.git
git add .
git commit -m "Initial commit with CI/CD setup"
git branch -M main
git push -u origin main
```

---

### Step 5️⃣: 자동 빌드 확인 (5분)

Push 후:
1. GitHub Actions 탭 보기
2. "Build APK" 워크플로우 실행 중
3. 10-15분 대기
4. 완료 시 APK 다운로드 가능

**APK 다운로드 위치:**
```
GitHub 저장소 → Actions → 최신 build → Artifacts → YongStudyApp-APK
```

---

## 워크플로우 동작 방식

### 자동 실행 조건

**다음 중 하나가 발생하면:**
```
1. main 브랜치에 push
2. GitHub Actions 페이지에서 수동 실행
```

**자동 수행:**
```
1. Linux 환경에서 빌드 시작
2. Node.js 설치
3. npm install
4. EAS 빌드 (--non-interactive)
5. APK 생성
6. GitHub Artifacts에 저장
```

**빌드 시간:** 10-15분

---

## 집에서 질문 있으면

### 체크리스트
- [ ] Step 1: GitHub repo 생성
- [ ] Step 2: EAS 토큰 발급
- [ ] Step 3: GitHub Secrets 저장
- [ ] Step 4: 내게 정보 제공
- [ ] Step 5: 첫 빌드 확인

### 문제 발생 시
- EAS 토큰 분실: 새로 발급하면 됨
- GitHub repo 생성 실패: 이미 존재하는지 확인
- 빌드 실패: 로그 제공 (Actions 페이지에서 보기)

---

## 현재 파일 상태

### 생성된 파일
```
.github/workflows/build-apk.yml      ← GitHub Actions 워크플로우
eas.json (수정)                      ← requireCommit: false 추가
app.json                             ← OTA 설정 포함
GIT_ISSUE_RESOLUTION.md              ← Git 문제 분석 문서
build-apk.ps1                        ← 로컬 빌드 스크립트
```

### git 상태
```
변경됨:
  M eas.json
  M src/app/_layout.tsx

추적 안 됨:
  ?? GIT_ISSUE_RESOLUTION.md
  ?? build-apk.ps1
  ?? build.log
```

---

## 예상 결과

### 성공 시
```
코드 변경 → git push → GitHub Actions 자동 실행
                          ↓
                    10-15분 후 APK 생성
                          ↓
                    자동으로 GitHub에 저장
                          ↓
                    내 휴대폰에 설치 가능
```

### 향후 편한 점
- 코드 변경 후 `git push` 하면 됨
- APK는 자동으로 생성됨
- 수동으로 `eas build` 실행할 필요 없음
- OTA 배포 + APK 자동화 모두 완성

---

## 다음 대화 때 필요한 정보

**집에 가서 Step 1-3 완료 후:**

```
GitHub Username: ?
GitHub 저장소 URL: ?
EAS Token: ?
```

이 정보들을 알려주면 Step 4-5 자동으로 완료해드림.

---

## 참고 링크

- GitHub 저장소 생성: https://github.com/new
- EAS 토큰: https://expo.dev/accounts/dctm1011/settings/access-tokens
- GitHub Secrets: https://github.com/YOUR_USERNAME/YongStudyApp/settings/secrets/actions
- Expo 문서: https://docs.expo.dev/eas/automation/

---

**집에 가서 편한 시간에 Step 1-3 진행하고 정보 알려주세요!** 🚀
