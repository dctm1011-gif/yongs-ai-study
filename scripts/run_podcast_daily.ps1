# YongStudy - 뉴스/팟캐스트 수집 자동 실행
# Task Scheduler에서 매일 05:00 KST 실행

$logFile = "C:\Users\dctm1\YongStudyApp\scripts\podcast_daily.log"
$scriptDir = "C:\Users\dctm1\YongStudyApp"

Add-Content $logFile "`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 시작"

# .env 로드
$envFile = "$scriptDir\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
    Add-Content $logFile "  .env 로드 완료"
} else {
    Add-Content $logFile "  [!] .env 파일 없음"
    exit 1
}

# Python 스크립트 실행
$pythonScript = "$scriptDir\scripts\generate_podcast_daily.py"
$result = & python $pythonScript 2>&1

Add-Content $logFile $result
Add-Content $logFile "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 완료"
