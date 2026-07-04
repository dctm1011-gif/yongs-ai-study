# ============================================
# YongStudyApp - EAS Build Automation Script
# ============================================
# Purpose: Reliable APK building with automatic git/env validation
# Usage: .\build-apk.ps1

param(
  [string]$Environment = "preview",
  [switch]$Wait = $true
)

# Color output
function Write-Success {
  param([string]$Message)
  Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
  param([string]$Message)
  Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
  param([string]$Message)
  Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

# Step 1: Verify git is available
Write-Info "Step 1: Checking git availability..."
if ((Get-Command git -ErrorAction SilentlyContinue) -eq $null) {
  # Try to add git to PATH
  if (Test-Path "C:\Program Files\Git\cmd") {
    $env:PATH = "C:\Program Files\Git\cmd;$env:PATH"
    Write-Success "Git PATH added to current session"
  } else {
    Write-Error "Git not found. Install from: https://git-scm.com/download/win"
    exit 1
  }
}
git --version
Write-Success "Git is available"

# Step 2: Verify git repo
Write-Info "Step 2: Verifying git repository..."
try {
  $gitRoot = git rev-parse --show-toplevel
  Write-Success "Git repository found: $gitRoot"
} catch {
  Write-Error "Not a git repository or git failed"
  exit 1
}

# Step 3: Check for uncommitted changes
Write-Info "Step 3: Checking for uncommitted changes..."
$status = git status --porcelain
if ($status) {
  Write-Host "Modified files:" -ForegroundColor Yellow
  Write-Host $status
  $confirm = Read-Host "Proceed with build? (y/n)"
  if ($confirm -ne "y") {
    Write-Info "Build cancelled"
    exit 0
  }
}

# Step 4: Run EAS build
Write-Info "Step 4: Starting EAS build..."
Write-Info "Environment: $Environment"

$easBuildArgs = @(
  "build",
  "-p", "android",
  "-e", $Environment
)

if ($Wait) {
  $easBuildArgs += "--wait"
}

Write-Host "Command: eas $($easBuildArgs -join ' ')" -ForegroundColor Gray
Write-Host ""

& eas @easBuildArgs

if ($LASTEXITCODE -eq 0) {
  Write-Success "Build completed successfully!"
  Write-Info "APK will be available in EAS dashboard"
} else {
  Write-Error "Build failed with exit code: $LASTEXITCODE"
  exit $LASTEXITCODE
}
