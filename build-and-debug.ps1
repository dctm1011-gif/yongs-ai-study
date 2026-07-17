# YongStudy Auto Build & Debug System

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "YongStudy Auto Build and Debug System" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# Step 1: Build APK
Write-Host "Step 1: Building APK..." -ForegroundColor Yellow
cd "C:\Users\dctm1\YongStudyApp"

./android/gradlew.bat -p android assembleRelease 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build FAILED" -ForegroundColor Red
  exit 1
}
Write-Host "OK - APK built" -ForegroundColor Green

# Step 2: Install
Write-Host ""
Write-Host "Step 2: Installing APK..." -ForegroundColor Yellow
adb uninstall com.dctm1011.yongstudy 2>&1 | Out-Null
adb install -r "C:\Users\dctm1\YongStudyApp\android\app\build\outputs\apk\release\app-release.apk" 2>&1 | Select-String "Success" | Out-Null
Write-Host "OK - APK installed" -ForegroundColor Green

# Step 3: Launch app
Write-Host ""
Write-Host "Step 3: Launching app..." -ForegroundColor Yellow
adb shell am start -n com.dctm1011.yongstudy/.MainActivity 2>&1 | Out-Null
Write-Host "OK - App started" -ForegroundColor Green

# Step 4: Wait for init
Write-Host ""
Write-Host "Step 4: Waiting for app to initialize (3 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Step 5: Get error logs
Write-Host ""
Write-Host "Step 5: Retrieving error logs..." -ForegroundColor Yellow

$tempDir = "$env:TEMP\yongstudy_debug"
if (!(Test-Path $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$errorLogPath = "/data/data/com.dctm1011.yongstudy/files/error_logs.json"

try {
  adb pull $errorLogPath "$tempDir\error_logs.json" 2>&1 | Out-Null

  if (Test-Path "$tempDir\error_logs.json") {
    Write-Host "OK - Error logs downloaded" -ForegroundColor Green

    # Step 6: Parse logs
    Write-Host ""
    Write-Host "Step 6: Analyzing error logs..." -ForegroundColor Cyan
    Write-Host ""

    $errorLogs = Get-Content "$tempDir\error_logs.json" -Raw | ConvertFrom-Json

    if ($errorLogs -and $errorLogs.Count -gt 0) {
      Write-Host "ERRORS FOUND: $($errorLogs.Count)" -ForegroundColor Red
      Write-Host ""

      foreach ($log in $errorLogs) {
        $severity = $log.severity.ToUpper()
        $severityColor = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "FATAL") { "Magenta" } else { "Yellow" }

        Write-Host "[$severity] $($log.tab)" -ForegroundColor $severityColor
        Write-Host "  Message: $($log.error)" -ForegroundColor Gray
        Write-Host "  Time: $($log.timestamp)" -ForegroundColor Gray
        if ($log.stack) {
          Write-Host "  Stack: $($log.stack.Split([Environment]::NewLine)[0])" -ForegroundColor DarkGray
        }
        Write-Host ""
      }
    } else {
      Write-Host "OK - No errors detected" -ForegroundColor Green
    }
  } else {
    Write-Host "WARNING - Error log file not found" -ForegroundColor Yellow
    Write-Host "(App may not have generated error logs yet)" -ForegroundColor Gray
  }
} catch {
  Write-Host "WARNING - Failed to retrieve error logs: $_" -ForegroundColor Yellow
}

# Done
$duration = ((Get-Date) - $startTime).TotalSeconds
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "COMPLETE - Took $([Math]::Round($duration))s" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
