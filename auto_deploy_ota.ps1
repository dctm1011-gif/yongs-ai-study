# Yong Study App - OTA 자동 배포 스크립트
# Task Scheduler에서 자동 실행됨

$projectPath = "C:\Users\dctm1\YongStudyApp"
$logPath = "C:\Users\dctm1\YongStudyApp\logs\ota_deploy.log"
$logDir = Split-Path -Parent $logPath

# 로그 디렉토리 생성
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Add-Content -Path $logPath -Encoding utf8
    Write-Host "$timestamp - $Message"
}

Write-Log "=== OTA 배포 시작 ==="

try {
    Set-Location $projectPath
    Write-Log "프로젝트 경로: $projectPath"

    # git 상태 확인 (변경사항 있는지 체크)
    $gitStatus = & git status --porcelain

    if ($gitStatus) {
        Write-Log "변경사항 감지: 코드 변경됨"

        # 변경사항 커밋 (옵션: 원할 시 활성화)
        # & git add -A
        # & git commit -m "Auto OTA update - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    } else {
        Write-Log "변경사항 없음 - 건너뜀"
        exit 0
    }

    # OTA 업데이트 배포
    Write-Log "eas update 실행 중..."
    $output = & eas update --auto --message "Automated OTA update - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Log "✅ OTA 배포 성공"
        Write-Log $output
    } else {
        Write-Log "❌ OTA 배포 실패"
        Write-Log $output
        exit 1
    }

    Write-Log "=== OTA 배포 완료 ==="
}
catch {
    Write-Log "❌ 에러 발생: $_"
    exit 1
}
