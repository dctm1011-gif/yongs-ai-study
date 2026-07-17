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

# Step 4: Wait for initialization and trigger health check
Write-Host ""
Write-Host "Step 4: Initializing and running health check (8 seconds)..." -ForegroundColor Yellow
Write-Host "Please see the app screen for health check progress..." -ForegroundColor Gray
Start-Sleep -Seconds 8

# Step 5: Retrieve runtime errors from server
Write-Host ""
Write-Host "Step 5: Collecting runtime errors from server..." -ForegroundColor Yellow

try {
  $response = Invoke-WebRequest -Uri "https://illustrious-cuchufli-7c4e58.netlify.app/api/runtime-errors" -Method Get -ErrorAction Stop
  $runtimeErrors = $response.Content | ConvertFrom-Json

  if ($runtimeErrors -and $runtimeErrors.Count -gt 0) {
    Write-Host "OK - Retrieved $($runtimeErrors.Count) runtime errors" -ForegroundColor Green

    # Step 6: Display runtime errors
    Write-Host ""
    Write-Host "Step 6: Analyzing Runtime Errors..." -ForegroundColor Cyan
    Write-Host ""

    Write-Host "RUNTIME ERRORS: $($runtimeErrors.Count)" -ForegroundColor Red
    Write-Host ""

    foreach ($err in $runtimeErrors) {
      $severity = $err.severity.ToUpper()
      $severityColor = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "FATAL") { "Magenta" } else { "Yellow" }

      Write-Host "[$severity] $($err.tab)" -ForegroundColor $severityColor
      Write-Host "  Message: $($err.error)" -ForegroundColor Gray
      Write-Host "  Time: $(Convert-ToLocalTime $err.timestamp)" -ForegroundColor Gray
      Write-Host ""
    }
  } else {
    Write-Host "OK - No runtime errors detected" -ForegroundColor Green
  }
} catch {
  Write-Host "WARNING - Failed to retrieve runtime errors: $_" -ForegroundColor Yellow
  Write-Host "This could mean:" -ForegroundColor Gray
  Write-Host "  • Health check has not run yet" -ForegroundColor Gray
  Write-Host "  • Network connection issue" -ForegroundColor Gray
  Write-Host "  • Server is unavailable" -ForegroundColor Gray
}

# Step 7: Get local error logs if available
Write-Host ""
Write-Host "Step 7: Retrieving local error logs..." -ForegroundColor Yellow

$tempDir = "$env:TEMP\yongstudy_debug"
if (!(Test-Path $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$errorLogPath = "/data/data/com.dctm1011.yongstudy/files/error_logs.json"

try {
  adb pull $errorLogPath "$tempDir\error_logs.json" 2>&1 | Out-Null

  if (Test-Path "$tempDir\error_logs.json") {
    Write-Host "OK - Local error logs downloaded" -ForegroundColor Green

    $errorLogs = Get-Content "$tempDir\error_logs.json" -Raw | ConvertFrom-Json

    if ($errorLogs -and $errorLogs.Count -gt 0) {
      Write-Host ""
      Write-Host "LOCAL ERROR LOGS: $($errorLogs.Count)" -ForegroundColor Red
      Write-Host ""

      foreach ($log in $errorLogs) {
        $severity = $log.severity.ToUpper()
        $severityColor = if ($severity -eq "ERROR") { "Red" } elseif ($severity -eq "FATAL") { "Magenta" } else { "Yellow" }

        Write-Host "[$severity] $($log.tab)" -ForegroundColor $severityColor
        Write-Host "  Message: $($log.error)" -ForegroundColor Gray
        Write-Host "  Time: $(Convert-ToLocalTime $log.timestamp)" -ForegroundColor Gray
        if ($log.stack) {
          Write-Host "  Stack: $($log.stack.Split([Environment]::NewLine)[0])" -ForegroundColor DarkGray
        }
        Write-Host ""
      }
    } else {
      Write-Host "OK - No local errors detected" -ForegroundColor Green
    }
  } else {
    Write-Host "WARNING - Local error log file not found" -ForegroundColor Yellow
  }
} catch {
  Write-Host "WARNING - Failed to retrieve local error logs: $_" -ForegroundColor Yellow
}

# Helper function to convert timestamp to local time
function Convert-ToLocalTime {
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
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "COMPLETE - Took $([Math]::Round($duration))s" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
