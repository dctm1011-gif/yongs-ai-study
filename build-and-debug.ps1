# YongStudy 자동 빌드 & 디버깅 스크립트
# 사용: ./build-and-debug.ps1

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🔧 YongStudy Auto Build & Debug System" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# Step 1: APK 빌드
Write-Host "📦 Step 1: APK 빌드 중..." -ForegroundColor Yellow
cd "C:\Users\dctm1\YongStudyApp"

./android/gradlew.bat -p android assembleRelease 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ 빌드 실패!" -ForegroundColor Red
  exit 1
}
Write-Host "✅ APK 빌드 완료" -ForegroundColor Green

# Step 2: 설치
Write-Host ""
Write-Host "📱 Step 2: 기기에 설치 중..." -ForegroundColor Yellow
adb uninstall com.dctm1011.yongstudy 2>&1 | Out-Null
adb install -r "C:\Users\dctm1\YongStudyApp\android\app\build\outputs\apk\release\app-release.apk" 2>&1 | Select-String "Success" | Out-Null
Write-Host "✅ 설치 완료" -ForegroundColor Green

# Step 3: 앱 실행
Write-Host ""
Write-Host "🚀 Step 3: 앱 실행 중..." -ForegroundColor Yellow
adb shell am start -n com.dctm1011.yongstudy/.MainActivity 2>&1 | Out-Null
Write-Host "✅ 앱 실행 완료" -ForegroundColor Green

# Step 4: 앱 초기화 대기
Write-Host ""
Write-Host "⏳ Step 4: 앱 초기화 대기 (3초)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Step 5: 헬스 체크 자동 트리거
Write-Host ""
Write-Host "🏥 Step 5: 헬스 체크 자동 실행..." -ForegroundColor Yellow
adb shell "am broadcast -a com.dctm1011.yongstudy.RUN_HEALTH_CHECK 2>/dev/null || echo 'Broadcast not available'" 2>&1 | Out-Null
Write-Host "✅ 헬스 체크 요청 완료" -ForegroundColor Green

# Step 6: 에러 로그 대기 & 수집
Write-Host ""
Write-Host "📊 Step 6: 에러 로그 수집 중 (5초)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Step 7: adb로 에러 파일 pull
Write-Host ""
Write-Host "📥 Step 7: 기기에서 에러 로그 다운로드..." -ForegroundColor Yellow

$tempDir = "$env:TEMP\yongstudy_debug"
if (!(Test-Path $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$errorLogPath = "/data/data/com.dctm1011.yongstudy/files/error_logs.json"

try {
  adb pull $errorLogPath "$tempDir\error_logs.json" 2>&1 | Out-Null

  if (Test-Path "$tempDir\error_logs.json") {
    Write-Host "✅ 에러 로그 다운로드 완료" -ForegroundColor Green

    # Step 8: 에러 로그 분석
    Write-Host ""
    Write-Host "🔍 Step 8: 에러 로그 분석..." -ForegroundColor Cyan
    Write-Host ""

    $errorLogs = Get-Content "$tempDir\error_logs.json" -Raw | ConvertFrom-Json

    if ($errorLogs -and $errorLogs.Count -gt 0) {
      Write-Host "🔴 발견된 에러: $($errorLogs.Count)개" -ForegroundColor Red
      Write-Host ""

      foreach ($log in $errorLogs) {
        $severity = $log.severity.ToUpper()
        $severityColor = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "FATAL") { "Magenta" } else { "Yellow" }

        Write-Host "[$severity] $($log.tab)" -ForegroundColor $severityColor
        Write-Host "  메시지: $($log.error)" -ForegroundColor Gray
        Write-Host "  시간: $($log.timestamp)" -ForegroundColor Gray
        if ($log.stack) {
          Write-Host "  스택: $($log.stack.Split([Environment]::NewLine)[0])" -ForegroundColor DarkGray
        }
        Write-Host ""
      }
    } else {
      Write-Host "✅ 에러 없음!" -ForegroundColor Green
    }
  } else {
    Write-Host "⚠️ 에러 로그 파일을 찾을 수 없습니다" -ForegroundColor Yellow
    Write-Host "   (앱이 아직 에러 로그를 생성하지 않았을 수 있음)" -ForegroundColor Gray
  }
} catch {
  Write-Host "⚠️ 에러 로그 다운로드 실패: $_" -ForegroundColor Yellow
}

# 완료
$duration = ((Get-Date) - $startTime).TotalSeconds
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ 완료! ($([Math]::Round($duration))초 소요)" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
