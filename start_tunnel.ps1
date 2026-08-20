# =============================================================
# 경은PBST - 로컬 AI 터널 자동 시작 스크립트
# 실행: PowerShell에서 .\start_tunnel.ps1
# =============================================================

# 토큰은 이 파일(git 추적됨)에 절대 직접 붙여넣지 말 것 - 공개 GitHub 저장소에 올라갈 수 있음.
# 대신 실행 전에 한 번만 환경변수로 설정: $env:VERCEL_TOKEN = "발급받은 토큰"
$VERCEL_TOKEN = $env:VERCEL_TOKEN
if (-not $VERCEL_TOKEN) { $VERCEL_TOKEN = "YOUR_VERCEL_TOKEN_HERE" }
$VERCEL_PROJECT_ID = "prj_XKReCjAFJ3bzYFV3m5cAruaIdJHu"   # pbs-team 프로젝트 ID (확인 완료)
$VERCEL_TEAM_ID = "team_MdTGyz07UGIlSIeDpTpNxy57"         # korista89's projects 팀 ID (확인 완료)

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
# cloudflared는 터널 URL을 stderr로 출력하는 경우가 많아, stdout/stderr를 각각 다른 파일로
# 받아서(Start-Process는 두 스트림에 같은 파일을 쓸 수 없음) 둘 다 검색한다.
$logFileOut = "$env:TEMP\cloudflared_tunnel.out.log"
$logFileErr = "$env:TEMP\cloudflared_tunnel.err.log"
$process = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel --url http://127.0.0.1:1234" `
    -RedirectStandardOutput $logFileOut `
    -RedirectStandardError $logFileErr `
    -PassThru -WindowStyle Hidden

# URL이 나올 때까지 대기 (최대 15초)
$tunnelUrl = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $content = (Get-Content $logFileOut -Raw -ErrorAction SilentlyContinue) + (Get-Content $logFileErr -Raw -ErrorAction SilentlyContinue)
    if ($content -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
        $tunnelUrl = $Matches[0]
        break
    }
}

if (-not $tunnelUrl) {
    Write-Host "  ❌ 터널 URL을 감지하지 못했습니다. 터널 로그를 확인하세요: $logFileOut / $logFileErr" -ForegroundColor Red
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
    $teamQuery = if ($VERCEL_TEAM_ID) { "?teamId=$VERCEL_TEAM_ID" } else { "" }
    $envListUrl = "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env$teamQuery"
    $envBaseUrl = "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env"

    try {
        # LOCAL_LLM_URL은 이전에 (수동으로든 이 스크립트로든) 이미 한 번 등록되어 있어 그냥
        # POST(생성)하면 Vercel이 400을 반환한다. 기존 항목을 찾아서 있으면 PATCH(갱신)한다.
        $existing = Invoke-RestMethod -Uri $envListUrl -Method Get -Headers $headers -ErrorAction Stop
        $existingVar = $existing.envs | Where-Object { $_.key -eq "LOCAL_LLM_URL" } | Select-Object -First 1

        if ($existingVar) {
            # LOCAL_LLM_URL is a "Sensitive" var on this project - Vercel rejects a PATCH that
            # tries to change key/type on a sensitive var (400 BAD_REQUEST), even when the
            # values sent are identical to the current ones. Only "value" may be sent.
            $updateBody = @{ value = "$tunnelUrl/v1" } | ConvertTo-Json
            $updateUrl = "$envBaseUrl/$($existingVar.id)$teamQuery"
            Invoke-RestMethod -Uri $updateUrl -Method Patch -Headers $headers -Body $updateBody -ErrorAction Stop | Out-Null
        } else {
            $createBody = @{
                key    = "LOCAL_LLM_URL"
                value  = "$tunnelUrl/v1"
                type   = "plain"
                target = @("production", "preview", "development")
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$envBaseUrl$teamQuery" -Method Post -Headers $headers -Body $createBody -ErrorAction Stop | Out-Null
        }
        Write-Host "  ✅ Vercel 환경변수 업데이트 완료!" -ForegroundColor Green

        # 환경변수만 바꿔서는 이미 배포된 서버리스 함수에 반영되지 않는다 (Vercel은 env를 배포
        # 시점에 굽는다). 최신 production 배포를 그대로 다시 배포시켜 새 값을 반영시킨다.
        try {
            $projectInfo = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID$teamQuery" -Method Get -Headers $headers -ErrorAction Stop
            $latestDeploymentId = $projectInfo.targets.production.id
            if ($latestDeploymentId) {
                $redeployBody = @{
                    name         = "pbs-team"
                    project      = $VERCEL_PROJECT_ID
                    target       = "production"
                    deploymentId = $latestDeploymentId
                } | ConvertTo-Json
                Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments$teamQuery" -Method Post -Headers $headers -Body $redeployBody -ErrorAction Stop | Out-Null
                Write-Host "  → 새 재배포를 트리거했습니다 (약 1~2분 후 반영)" -ForegroundColor Gray
            } else {
                Write-Host "  ⚠️  최신 배포를 찾지 못해 자동 재배포를 못 걸었습니다. Vercel 대시보드에서 수동으로 Redeploy 해주세요." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  ⚠️  재배포 트리거 실패: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "  → Vercel 대시보드에서 수동으로 Redeploy 해주세요." -ForegroundColor White
        }
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
