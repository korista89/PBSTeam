# =============================================================
# 경은PBST - 로컬 AI 터널 자동 시작 스크립트
# 실행: PowerShell에서 .\start_tunnel.ps1
# =============================================================

$VERCEL_TOKEN = "YOUR_VERCEL_TOKEN_HERE"   # vercel.com → Account → Tokens에서 발급
$VERCEL_PROJECT_ID = "YOUR_PROJECT_ID"     # Settings → General → Project ID
$VERCEL_TEAM_ID = ""                       # 개인 계정이면 빈칸

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  경은PBST 로컬 AI 터널 시작" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. LM Studio 실행 확인
Write-Host "`n[1/3] LM Studio 서버 확인 중..." -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:1234/v1/models" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  ✅ LM Studio 정상 실행 중!" -ForegroundColor Green
} catch {
    Write-Host "  ❌ LM Studio가 실행되지 않았습니다." -ForegroundColor Red
    Write-Host "  → LM Studio 앱을 열고 'Start Server'를 눌러주세요." -ForegroundColor Yellow
    Read-Host "  준비되면 Enter를 누르세요"
}

# 2. cloudflared 터널 시작 (백그라운드)
Write-Host "`n[2/3] Cloudflare 터널 시작 중..." -ForegroundColor Yellow
$logFile = "$env:TEMP\cloudflared_tunnel.log"
$process = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel --url http://127.0.0.1:1234" `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $logFile `
    -PassThru -WindowStyle Hidden

# URL이 나올 때까지 대기 (최대 15초)
$tunnelUrl = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
            $tunnelUrl = $Matches[0]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "  ❌ 터널 URL을 감지하지 못했습니다. 터널 로그를 확인하세요: $logFile" -ForegroundColor Red
    exit 1
}

Write-Host "  ✅ 터널 URL: $tunnelUrl" -ForegroundColor Green

# 3. Vercel 환경변수 자동 업데이트
Write-Host "`n[3/3] Vercel 환경변수 업데이트 중..." -ForegroundColor Yellow

if ($VERCEL_TOKEN -eq "YOUR_VERCEL_TOKEN_HERE") {
    Write-Host "  ⚠️  Vercel 토큰이 설정되지 않았습니다." -ForegroundColor Yellow
    Write-Host "  → 수동으로 Vercel에 등록하세요:" -ForegroundColor Yellow
    Write-Host "     LOCAL_LLM_URL = $tunnelUrl/v1" -ForegroundColor White
} else {
    $headers = @{
        "Authorization" = "Bearer $VERCEL_TOKEN"
        "Content-Type"  = "application/json"
    }
    $body = @{
        key    = "LOCAL_LLM_URL"
        value  = "$tunnelUrl/v1"
        type   = "plain"
        target = @("production", "preview", "development")
    } | ConvertTo-Json

    $apiUrl = if ($VERCEL_TEAM_ID) {
        "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_TEAM_ID"
    } else {
        "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env"
    }

    try {
        Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
        Write-Host "  ✅ Vercel 환경변수 업데이트 완료!" -ForegroundColor Green
        Write-Host "  → Vercel이 자동으로 재배포됩니다 (약 1~2분)" -ForegroundColor Gray
    } catch {
        Write-Host "  ⚠️  Vercel API 오류: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  → 수동 등록: LOCAL_LLM_URL = $tunnelUrl/v1" -ForegroundColor White
    }
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  🟢 터널 실행 중 (이 창을 닫으면 터널이 끊깁니다)" -ForegroundColor Green
Write-Host "  터널 URL: $tunnelUrl" -ForegroundColor White
Write-Host "  종료하려면 Ctrl+C 를 누르세요" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Cyan

# 터널 프로세스 대기
Wait-Process -Id $process.Id
