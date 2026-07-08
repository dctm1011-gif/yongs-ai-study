# APK 파일 자동 차단 해제 스크립트

# APK 파일 경로 (다운로드 폴더)
$apkPath = "$env:USERPROFILE\Downloads\*.apk"
$apkFiles = Get-ChildItem -Path $apkPath -ErrorAction SilentlyContinue

if ($apkFiles) {
    Write-Host "🔓 APK 파일 차단 해제 중..." -ForegroundColor Green

    foreach ($file in $apkFiles) {
        # Zone.Identifier 스트림 제거 (차단 해제)
        Unblock-File -Path $file.FullName -ErrorAction SilentlyContinue
        Write-Host "✅ 해제됨: $($file.Name)" -ForegroundColor Green
    }
} else {
    Write-Host "❌ APK 파일을 찾을 수 없습니다" -ForegroundColor Red
}

# Windows Defender 제외 폴더 추가
$downloadFolder = "$env:USERPROFILE\Downloads"
Write-Host "📁 Windows Defender 예외 추가 중..." -ForegroundColor Cyan

try {
    Add-MpPreference -ExclusionPath $downloadFolder -ErrorAction SilentlyContinue
    Write-Host "✅ Downloads 폴더를 Defender 제외에 추가했습니다" -ForegroundColor Green
} catch {
    Write-Host "⚠️ 권한 부족: 관리자로 실행해주세요" -ForegroundColor Yellow
}
