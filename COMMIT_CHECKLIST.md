# ✅ YongStudy 커밋 전 체크리스트 (자동화 버전)

> 에러 자동 감지 & 수정 → Netlify 검증 → 헬스 체크 → 커밋

---

## 🚀 빠른 시작 (한 줄)

```bash
npm run ready-to-commit && git add -A && git commit -m "message" && git push
```

---

## 📋 3단계 자동화 프로세스

### **Step 1️⃣: 코드 작성 후**

```bash
# 코드 수정/작성
vim src/app/english.tsx

# 자동 디버깅 & 수정 (필요한 경우만)
npm run auto-fix
```

**처리되는 항목:**
- ✅ TypeScript 오류 자동 감지
- ✅ 누락된 import 자동 추가
- ✅ 구문 오류 감지
- ✅ 미사용 코드 경고

**실패 시:**
```
❌ 자동 수정 불가 오류 감지
→ 에러 메시지 읽고 수동 수정
→ npm run auto-fix 재실행
```

---

### **Step 2️⃣: 커밋 직전 (모든 검증)**

```bash
npm run ready-to-commit
```

**이 명령어가 수행하는 것:**

#### A. 자동 디버깅 (auto-fix)
```
✅ TypeScript 컴파일
✅ 누락된 import 추가
✅ 구문 오류 감지
✅ 재빌드 확인
```

#### B. 사전 커밋 검증 (pre-commit-check)
```
✅ TypeScript 컴파일 확인
✅ Netlify API 상태 (4/4)
  ├─ Health Check
  ├─ Trending Videos
  ├─ TOEFL Prefs
  └─ Announcements
✅ 앱 헬스 체크
  ├─ English Tab
  ├─ TOEFL Tab
  ├─ Play Tab
  ├─ Papers Tab
  └─ Settings Tab
```

**예상 결과:**
```
════════════════════════════════════════════════════════════════
✅ 모든 검증 통과! (7/7)

커밋해도 됩니다! 🚀
```

---

### **Step 3️⃣: 커밋 & 푸시**

```bash
git add -A
git commit -m "feat: Add new feature"
git push origin main
```

**GitHub Actions 자동 실행:**
- 🟢 Pre-Build Health Check (TypeScript)
- 🟢 Test Netlify (배포 후)
- 🟢 Daily Monitoring (06:30 UTC)

---

## 🔍 개별 명령어 (선택적)

| 명령어 | 설명 | 시간 |
|--------|------|------|
| `npm run auto-fix` | 에러 자동 감지 & 수정 | 20초 |
| `npm run pre-commit-check` | 모든 검증 실행 | 30초 |
| `npm run ready-to-commit` | auto-fix + pre-commit-check | 50초 |
| `npm run test:netlify` | Netlify API만 테스트 | 10초 |
| `npm run monitor:netlify` | 모니터링 리포트 생성 | 20초 |

---

## 📊 체크리스트 (수동 체크)

### 커밋 전
- [ ] 코드 작성/수정 완료
- [ ] `npm run ready-to-commit` 실행 (✅ 통과 필수)
- [ ] 변경사항 확인: `git diff`
- [ ] 커밋 메시지 작성

### 커밋 후
- [ ] GitHub Actions 실행 대기 (2-3분)
- [ ] 모든 워크플로우 ✅ 통과 확인

### 배포 전
- [ ] APK 빌드: `./android/gradlew.bat -p android assembleRelease`
- [ ] 설치 & 실행: `adb install -r app-release.apk`
- [ ] Settings 탭에서 "🏥 헬스 체크 실행"
- [ ] 5개 탭 모두 ✅ 정상 확인

---

## 🆘 문제 해결

### 📌 Problem 1: auto-fix 실패

**원인:** 자동 수정 불가능한 오류

**해결:**
```bash
# 1. 에러 메시지 읽기
npm run auto-fix

# 2. 오류 파일 열기 및 수동 수정
# 예: src/app/english.tsx:42 - 타입 오류

# 3. 재시도
npm run auto-fix
```

### 📌 Problem 2: pre-commit-check 실패

**예 1: TypeScript 오류 (70% 확률)**
```
❌ TypeScript: 컴파일 오류
→ npm run auto-fix 실행
→ 수정 안 되면 수동 수정
```

**예 2: Netlify API 오류 (20% 확률)**
```
❌ Netlify API: 응답 없음 (Timeout)
→ 네트워크 확인
→ npm run test:netlify 재시도
→ 5-10분 대기 (배포 진행 중)
```

**예 3: 앱 헬스 체크 경고 (10% 확률)**
```
⚠️ App Health: 경고
→ 무시해도 됨 (미설정 기능)
→ 필요하면 수동 설정
```

---

## 🎯 이상적인 워크플로우

```
1️⃣ 코드 작성
   ↓
2️⃣ npm run auto-fix
   (에러 감지 & 자동 수정)
   ↓
   ├─ ✅ 성공
   │   ↓
   │   3️⃣ npm run ready-to-commit
   │   (모든 검증)
   │   ↓
   │   ├─ ✅ 통과
   │   │   ↓
   │   │   4️⃣ git add & commit & push
   │   │   (GitHub Actions 자동 실행)
   │   │   ↓
   │   │   5️⃣ APK 빌드 (선택)
   │   │   ↓
   │   │   6️⃣ 헬스 체크 (Settings 탭)
   │   │   ↓
   │   │   ✅ 완료
   │   │
   │   └─ ❌ 실패
   │       ↓
   │       "대기 중" 섹션 참고
   │
   └─ ❌ 실패
       ↓
       에러 메시지 읽고 수동 수정
       ↓
       npm run auto-fix 재시도
```

---

## 📈 성능 지표

| 항목 | 목표 시간 | 실제 시간 |
|------|---------|---------|
| auto-fix | 20초 | 20-25초 |
| pre-commit-check | 30초 | 30-45초 |
| 전체 (ready-to-commit) | 50초 | 50-70초 |
| GitHub Actions | 3-5분 | 3-7분 |

---

## 🔐 자동화 규칙

✅ **자동 수정되는 것:**
- TypeScript import 추가
- 구문 오류 감지

❌ **자동 수정 안 되는 것:**
- 타입 오류 (논리적 수정 필요)
- 함수 누락
- API 오류 (네트워크 문제)

---

## 🚨 긴급 푸시

긴급한 경우에만:

```bash
# 경고: 검증 스킵
git add -A
git commit -m "hotfix: urgent fix"
git push origin main
```

**⚠️ 주의:** 나중에 `npm run ready-to-commit` 실행하여 검증

---

## 📝 커밋 메시지 템플릿

```bash
# 기능 추가
npm run ready-to-commit && git commit -m "feat: Add English word filtering"

# 버그 수정
npm run ready-to-commit && git commit -m "fix: TOEFL daily reset not working"

# 성능 개선
npm run ready-to-commit && git commit -m "perf: Optimize Netlify response time"

# 문서화
npm run ready-to-commit && git commit -m "docs: Update debugging guide"
```

---

## 📞 빠른 참조

```bash
# 한 줄 커밋 (추천)
npm run ready-to-commit && git add -A && git commit -m "message" && git push

# 단계별 실행
npm run auto-fix                  # 자동 수정
npm run pre-commit-check          # 모든 검증
npm run ready-to-commit           # 둘 다 실행
git add -A && git commit && git push

# 개별 검증 (선택)
npm run test:netlify              # Netlify API만
npm run monitor:netlify           # 모니터링 리포트
npx tsc --noEmit                  # TypeScript만
```

---

**작성:** 2026-07-17  
**최종 업데이트:** 2026-07-17  
**상태:** ✅ 완성 (자동화 완전 구현)
