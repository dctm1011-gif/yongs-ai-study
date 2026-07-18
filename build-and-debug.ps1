# YongStudy Auto Build & Debug System

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "YongStudy Auto Build and Debug System" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# Step 0: Analyze changes and decide if clean is needed
Write-Host "Step 0: Analyzing changes..." -ForegroundColor Cyan
cd "C:\Users\dctm1\YongStudyApp"

# Build time을 먼저 생성 (빌드에 포함되도록)
$buildTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$buildInfoFile = "C:\Users\dctm1\YongStudyApp\src\constants\buildInfo.ts"
$buildInfoContent = @"
export const LAST_BUILD_TIME = '$buildTime';
"@

try {
  if (-not (Test-Path "C:\Users\dctm1\YongStudyApp\src\constants")) {
    New-Item -ItemType Directory -Path "C:\Users\dctm1\YongStudyApp\src\constants" | Out-Null
  }
  Set-Content -Path $buildInfoFile -Value $buildInfoContent -Encoding UTF8
  Write-Host "  📦 빌드 시간 설정: $buildTime" -ForegroundColor Cyan
} catch {
  Write-Host "  ⚠️  빌드 시간 설정 실패: $_" -ForegroundColor Yellow
}

$needsClean = $false
$reason = ""
$configPatterns = @("gradle", "build.gradle", "app.json", "package.json", "package-lock.json", "android/", "eas.json", "src/app/")

try {
  # 1. Unstaged changes (git diff HEAD)
  $unstagedFiles = git diff HEAD --name-only 2>$null

  # 2. Staged changes (git diff --cached)
  $stagedFiles = git diff --cached --name-only 2>$null

  # 3. Untracked files (새로운 파일)
  $untrackedFiles = git ls-files --others --exclude-standard 2>$null

  # 모든 변경사항 합치기
  $allChanges = @()
  if ($unstagedFiles) { $allChanges += $unstagedFiles }
  if ($stagedFiles) { $allChanges += $stagedFiles }
  if ($untrackedFiles) { $allChanges += $untrackedFiles }

  Write-Host "  변경사항 감지:" -ForegroundColor Gray
  if ($allChanges) {
    Write-Host "    - Unstaged: $($unstagedFiles.Count) 파일" -ForegroundColor Gray
    Write-Host "    - Staged: $($stagedFiles.Count) 파일" -ForegroundColor Gray
    Write-Host "    - Untracked: $($untrackedFiles.Count) 파일" -ForegroundColor Gray
  } else {
    Write-Host "    - 변경사항 없음" -ForegroundColor Gray
  }

  # 메타 파일 패턴 확인
  foreach ($file in $allChanges) {
    foreach ($pattern in $configPatterns) {
      if ($file -like "*$pattern*") {
        $needsClean = $true
        $reason = "변경됨: $file"
        break
      }
    }
    if ($needsClean) { break }
  }

  # 4. node_modules 타임스탐프 확인 (npm install 후 변경 감지)
  if (-not $needsClean) {
    $nodeModulesTime = if (Test-Path "node_modules") {
      (Get-Item "node_modules").LastWriteTime
    } else {
      $null
    }

    $packageJsonTime = if (Test-Path "package.json") {
      (Get-Item "package.json").LastWriteTime
    } else {
      $null
    }

    if ($nodeModulesTime -and $packageJsonTime -and $nodeModulesTime -lt $packageJsonTime.AddSeconds(-60)) {
      $needsClean = $true
      $reason = "npm install 필요 감지 (node_modules 오래됨)"
    }
  }

} catch {
  # Git 또는 기타 에러 - 안전한 clean build
  $needsClean = $true
  $reason = "변경 파일 확인 불가: $_"
}

if ($needsClean) {
  Write-Host "⚠️  Clean build 필요: $reason" -ForegroundColor Yellow
  Write-Host "Gradle 캐시 초기화 중..." -ForegroundColor Gray
  ./android/gradlew.bat -p android clean 2>&1 | Out-Null
  Write-Host "✅ 캐시 초기화 완료" -ForegroundColor Green
} else {
  Write-Host "✅ 소스 코드만 변경됨 - 캐시 유지 (빠른 빌드)" -ForegroundColor Green
}
Write-Host ""

# Step 1: Build APK
Write-Host "Step 1: Building APK..." -ForegroundColor Yellow

./android/gradlew.bat -p android assembleRelease 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build FAILED" -ForegroundColor Red
  exit 1
}
Write-Host "OK - APK built" -ForegroundColor Green

# Step 2: Install with verification
Write-Host ""
Write-Host "Step 2: Installing APK..." -ForegroundColor Yellow

# Install new version (기존 데이터 유지)
$apkPath = "C:\Users\dctm1\YongStudyApp\android\app\build\outputs\apk\release\app-release.apk"
if (!(Test-Path $apkPath)) {
  Write-Host "❌ APK 파일을 찾을 수 없음: $apkPath" -ForegroundColor Red
  exit 1
}

$installOutput = adb install -r $apkPath 2>&1
if ($installOutput -like "*Success*") {
  Write-Host "✅ APK 설치 완료" -ForegroundColor Green
} else {
  Write-Host "❌ APK 설치 실패" -ForegroundColor Red
  Write-Host $installOutput -ForegroundColor Red
  exit 1
}

# Step 3: Launch app
Write-Host ""
Write-Host "Step 3: Launching app..." -ForegroundColor Yellow

adb shell am start -n com.dctm1011.yongstudy/.MainActivity 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ 앱 실행 완료" -ForegroundColor Green
  Start-Sleep -Milliseconds 500
} else {
  Write-Host "⚠️  앱 실행 명령 전송됨 (백그라운드 확인 필요)" -ForegroundColor Yellow
}

# Step 4: Wait for initialization and trigger health check
Write-Host ""
Write-Host "Step 4: Initializing and running health check (8 seconds)..." -ForegroundColor Yellow
Write-Host "Please see the app screen for health check progress..." -ForegroundColor Gray
Start-Sleep -Seconds 8

# Step 5: Retrieve AsyncStorage data directly
Write-Host ""
Write-Host "Step 5: Reading AsyncStorage from device..." -ForegroundColor Yellow

$tempDir = "$env:TEMP\yongstudy_debug"
if (!(Test-Path $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$asyncStoragePath = "/data/data/com.dctm1011.yongstudy/files/RCTAsyncStorage_V1"

try {
  # AsyncStorage folder fetch
  adb pull $asyncStoragePath "$tempDir\RCTAsyncStorage" 2>&1 | Out-Null

  if (Test-Path "$tempDir\RCTAsyncStorage") {
    Write-Host "OK - AsyncStorage files retrieved" -ForegroundColor Green

    # Health check results parsing
    Write-Host ""
    Write-Host "Step 6: Parsing Health Check Results..." -ForegroundColor Cyan
    Write-Host ""

    $healthCheckFile = Get-ChildItem "$tempDir\RCTAsyncStorage" -Filter "*lastHealthCheck*" -ErrorAction SilentlyContinue | Select-Object -First 1

    if ($healthCheckFile) {
      try {
        $healthCheckContent = Get-Content $healthCheckFile.FullName -Raw
        $healthCheckData = $healthCheckContent | ConvertFrom-Json

        Write-Host "HEALTH CHECK RESULTS:" -ForegroundColor Cyan
        Write-Host "=========================================================" -ForegroundColor Cyan

        if ($healthCheckData.summary) {
          Write-Host "Summary: $($healthCheckData.summary.healthy)/$($healthCheckData.summary.total) healthy" -ForegroundColor White
          if ($healthCheckData.summary.errors -gt 0) {
            Write-Host "  [ERROR] Errors: $($healthCheckData.summary.errors)" -ForegroundColor Red
          }
          if ($healthCheckData.summary.warnings -gt 0) {
            Write-Host "  [WARNING] Warnings: $($healthCheckData.summary.warnings)" -ForegroundColor Yellow
          }
          Write-Host ""
        }

        foreach ($result in $healthCheckData.results) {
          $statusIcon = if ($result.status -eq "healthy") { "[OK]" } elseif ($result.status -eq "warning") { "[WARN]" } else { "[ERR]" }

          $color = if ($result.status -eq "healthy") { "Green" } elseif ($result.status -eq "warning") { "Yellow" } else { "Red" }

          Write-Host "$statusIcon $($result.tab)" -ForegroundColor $color
          Write-Host "   $($result.message)" -ForegroundColor Gray

          if ($result.errors -and $result.errors.Count -gt 0) {
            foreach ($err in $result.errors) {
              Write-Host "   - $err" -ForegroundColor (if ($result.status -eq "error") { "Red" } else { "Yellow" })
            }
          }
          Write-Host ""
        }
      } catch {
        Write-Host "ERROR parsing health check: $_" -ForegroundColor Red
      }
    } else {
      Write-Host "[WARNING] No health check data found" -ForegroundColor Yellow
      Write-Host "   Make sure to click Health Check button in Settings tab" -ForegroundColor Gray
    }

    # Error logs parsing
    Write-Host ""
    Write-Host "Step 7: Parsing Error Logs..." -ForegroundColor Cyan
    Write-Host ""

    $errorLogFile = Get-ChildItem "$tempDir\RCTAsyncStorage" -Filter "*errorLogs*" -ErrorAction SilentlyContinue | Select-Object -First 1

    if ($errorLogFile) {
      try {
        $errorLogContent = Get-Content $errorLogFile.FullName -Raw
        $errorLogData = $errorLogContent | ConvertFrom-Json

        if ($errorLogData -and $errorLogData.Count -gt 0) {
          Write-Host "ERROR LOGS: $($errorLogData.Count) total" -ForegroundColor Red
          Write-Host "=========================================================" -ForegroundColor Red
          Write-Host ""

          foreach ($log in $errorLogData) {
            $severity = $log.severity.ToUpper()
            $severityColor = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "FATAL") { "Magenta" } else { "Yellow" }

            Write-Host "[$severity] $($log.tab)" -ForegroundColor $severityColor
            Write-Host "  Message: $($log.error)" -ForegroundColor Gray
            Write-Host "  Time: $(ConvertToLocalTime $log.timestamp)" -ForegroundColor DarkGray
            if ($log.stack) {
              $stackLine = $log.stack.Split([Environment]::NewLine)[0]
              Write-Host "  Stack: $stackLine" -ForegroundColor DarkGray
            }
            Write-Host ""
          }
        } else {
          Write-Host "[OK] No error logs detected" -ForegroundColor Green
        }
      } catch {
        Write-Host "ERROR parsing error logs: $_" -ForegroundColor Red
      }
    } else {
      Write-Host "[OK] No error logs found (clean run)" -ForegroundColor Green
    }

  } else {
    Write-Host "WARNING - AsyncStorage directory not found" -ForegroundColor Yellow
    Write-Host "App data may not be accessible or app hasn't initialized yet" -ForegroundColor Gray
  }
} catch {
  Write-Host "WARNING - Failed to retrieve AsyncStorage: $_" -ForegroundColor Yellow
}

# Helper function to convert timestamp to local time
function ConvertToLocalTime {
  param([string]$timestamp)
  try {
    $utcTime = [DateTime]::Parse($timestamp)
    return $utcTime.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
  } catch {
    return $timestamp
  }
}

# Done
$duration = ((Get-Date) - $startTime).TotalSeconds
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "COMPLETE - Took $([Math]::Round($duration))s" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan
