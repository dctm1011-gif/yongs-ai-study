$root = "C:\Users\dctm1\YongStudyApp"
$log  = "$root\investment\monthly_update.log"

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 월별 부동산 단지 업데이트 시작" | Tee-Object -FilePath $log -Append

Get-Content "$root\.env" | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
}

$result = & python "$root\investment\push_jukjeon_complexes.py" 2>&1
$result | Tee-Object -FilePath $log -Append

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 완료" | Add-Content $log
