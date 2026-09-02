$envVars = @{}
Get-Content "C:\Users\dctm1\YongStudyApp\.env" | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $envVars[$matches[1].Trim()] = $matches[2].Trim() }
}
$dbUrl = $envVars['EXPO_PUBLIC_FIREBASE_DATABASE_URL']
$apiKey = $envVars['ANTHROPIC_API_KEY']
$today = '2026-09-02'

$words = 'advocate (지지하다), bolster (강화하다), aggregate (합산하다), coherent (일관된), conduit (통로), aloof (냉담한), amiable (친절한), antecedent (선행하는), compelling (설득력 있는), conflate (혼합하다)'

$prompt = @"
Write a cohesive English paragraph (5-6 sentences) naturally using ALL these vocabulary words: $words

Bold each vocab word with **word** syntax. One coherent narrative only.

Return ONLY valid JSON (no code block, no extra text):
{"paragraph":"...","paragraph_ko":"...","wordNuances":[{"word":"..","meaning":"..","nuance":".."},...]}
"@

$body = @{
    model = 'claude-haiku-4-5-20251001'
    max_tokens = 2000
    messages = @(@{role='user';content=$prompt})
} | ConvertTo-Json -Depth 5

$resp = Invoke-RestMethod -Uri 'https://api.anthropic.com/v1/messages' -Method POST `
    -Headers @{'x-api-key'=$apiKey;'anthropic-version'='2023-06-01';'content-type'='application/json'} `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json'

$text = $resp.content[0].text.Trim()
$text = $text -replace '(?s)^```[a-z]*\r?\n?','' -replace '\r?\n?```$',''
$text = $text.Trim()
Write-Host "RAW: $($text.Substring(0, [Math]::Min(150,$text.Length)))"

$result = $text | ConvertFrom-Json
$result | Add-Member -NotePropertyName generatedAt -NotePropertyValue $today
$resultJson = $result | ConvertTo-Json -Depth 5

$fbBytes = [System.Text.Encoding]::UTF8.GetBytes($resultJson)
$wc = New-Object System.Net.WebClient
$wc.Headers.Add('Content-Type', 'application/json; charset=utf-8')
$fbResp = $wc.UploadData("$dbUrl/english/reviewStory/$today.json", 'PUT', $fbBytes)
Write-Host "Firebase PUT done: $([System.Text.Encoding]::UTF8.GetString($fbResp).Substring(0,50))"

Write-Host "`n=== 단락 ==="
Write-Host $result.paragraph
Write-Host "`n=== 한국어 ==="
Write-Host $result.paragraph_ko
Write-Host "`n뉘앙스 단어 수:" $result.wordNuances.Count
