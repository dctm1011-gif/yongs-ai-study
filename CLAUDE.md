# YongStudy - 개발 규칙

## 주요 경로
- **앱**: `C:\Users\dctm1\YongStudyApp`
- **스크립트**: `./investment`, `./netlify/functions`

## 규칙
- 개인정보 업로드 금지 (로컬 전용)
- PowerShell: `dangerouslyDisableSandbox: true` 자동 적용
- API: Haiku만 사용

## 배포

### OTA (기본 — JS/TS 변경)
```bash
eas update --channel production --message "메시지"
```

### APK 빌드 (네이티브 변경 시)
```bash
bash C:\Users\dctm1\YongStudyApp\build-apk.sh
```
- `android/local.properties`: 반드시 슬래시 경로 (`C:/Users/...`)

## 투자 데이터 (daily 06:00 KST 자동 실행)
```bash
cd C:\Users\dctm1\YongStudyApp
# .env 로드 후:
cd investment && python generate_investment.py
```

## API 규칙
- Haiku만 사용
- 일일 $1+ 사용 시 즉시 중단
