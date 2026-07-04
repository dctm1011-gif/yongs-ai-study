# Yong Study - Android APK 빌드 가이드

## 준비물
- Node.js & npm ✓
- Expo CLI ✓
- (선택) Android Studio & JDK

## 빌드 방법

### 방법 1: EAS 클라우드 빌드 (추천, 가장 간단)

```bash
# 1. EAS CLI 설치
npm install -g eas-cli

# 2. Expo 계정으로 로그인
eas login

# 3. APK 빌드
eas build --platform android --local

# 4. 빌드 완료 후 APK 다운로드
# → Android 기기에 설치
```

### 방법 2: 로컬 빌드

```bash
# 1. 프로젝트 준비
cd YongStudyApp

# 2. 필요한 패키지 설치
npm install

# 3. APK 빌드 (시간 걸림, ~15분)
npm run build:android

# 4. APK 위치
# → android/app/build/outputs/apk/release/app-release.apk
```

### 방법 3: Expo Go에서 테스트 (빌드 전 확인)

```bash
# 1. Expo Go 앱 설치 (Google Play Store)

# 2. 프로젝트 시작
npm run android

# 3. QR 코드를 Expo Go에서 스캔
# → 즉시 테스트 가능!
```

---

## 앱 정보
- **앱 이름**: Yong Study
- **버전**: 1.0.0
- **기능**:
  - 📱 홈 화면: 경험치 바 + 레벨 + 배지
  - 📚 영어 탭: 단어 학습 & 퀴즈
  - 🎓 TOEFL 탭: Reading/Writing/Speaking/Listening
  - 📄 논문 탭: 자동 분류 & 검색
  - 🔥 경험치 시스템: 매일 증가!

---

## 설치 및 실행
1. APK 다운로드
2. Android 기기에 설치
3. "Yong Study" 앱 실행
4. 자동으로 Netlify 웹사이트 로드

---

## 주의사항
- ✅ 인터넷 필수 (웹 기반)
- ✅ 모든 데이터는 localStorage에 저장 (기기 로컬)
- ✅ WebView로 동작 (웹과 동일한 성능)

---

## 문제 해결

### "Expo CLI 설치 안 됨"
```bash
npm install -g expo-cli
```

### "빌드 실패"
```bash
# 의존성 재설치
rm -rf node_modules
npm install

# 캐시 삭제
npm cache clean --force
```

### "APK가 너무 크다"
- 정상: ~80-150MB (WebView 포함)

---

**완성! 🎉**
