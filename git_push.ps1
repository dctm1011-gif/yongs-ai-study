$gitPath = "C:\Users\dctm1\AppData\Local\GitHubDesktop\app-3.6.1\resources\app\git\cmd\git.exe"
$projectDir = Get-Location

Write-Host "[1] Git 상태 확인..."
& $gitPath status --short

Write-Host "`n[2] 모든 파일을 staging..."
& $gitPath add -A
Write-Host "[OK] Staging 완료"

Write-Host "`n[3] Commit..."
& $gitPath commit -m "Netlify TOEFL Writing save-response API 추가

- netlify/functions/save-response.mjs: Blobs 기반 응답 저장
- GitHub Pages에서도 TOEFL Writing 답변 저장 기능 작동"

Write-Host "`n[4] GitHub에 push..."
& $gitPath push origin main
Write-Host "[OK] Push 완료"

Write-Host "`n[OK] Netlify 배포 자동 시작 (GitHub 연동)"
Write-Host "[URL] https://dctm1011-gif.github.io/yongs-ai-study/"
