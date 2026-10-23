# PBST 접속 점검 — 학교 PC에서 5분마다 실행해 "사이트에 연결할 수 없음"이 어느 단계에서 나는지 기록한다.
# 단계: DNS(학교 DNS / 8.8.8.8 비교) → TCP 443 연결 → HTTPS 응답(/api/health). 결과는 이 파일 옆 pbst_netlog.csv(엑셀용 UTF-8 BOM).
# 학생 정보는 다루지 않는다. 등록·해석: docs/connection/근본대책_비교.md 의 '접속 점검' 절.
#   한 번 실행:   powershell -ExecutionPolicy Bypass -File .\net_probe.ps1
#   요약 보기:    powershell -ExecutionPolicy Bypass -File .\net_probe.ps1 -Summary
param([switch]$Summary, [string]$HostName = "pbs-team.vercel.app")

$log = Join-Path $PSScriptRoot "pbst_netlog.csv"

if ($Summary) {
    if (-not (Test-Path $log)) { Write-Output "기록 없음: $log"; exit }
    $rows = @(Import-Csv $log -Encoding UTF8)
    $fail = @($rows | Where-Object { $_.result -ne "OK" })
    Write-Output ("전체 {0}회 / 실패 {1}회" -f $rows.Count, $fail.Count)
    $fail | Group-Object stage | Sort-Object Count -Descending | ForEach-Object { Write-Output ("  {0}: {1}회" -f $_.Name, $_.Count) }
    $fail | Select-Object -Last 10 time, stage, detail | Format-Table -AutoSize | Out-String | Write-Output
    exit
}

# 평일 07:30~17:30 에만 기록(밤·주말 기록은 학교망 문제와 상관없음)
$now = Get-Date
if ($now.DayOfWeek -in 'Saturday', 'Sunday' -or $now.TimeOfDay -lt [TimeSpan]'07:30' -or $now.TimeOfDay -gt [TimeSpan]'17:30') { exit }

$r = [ordered]@{ time = $now.ToString("yyyy-MM-dd HH:mm:ss"); pc = $env:COMPUTERNAME; result = "OK"; stage = ""; detail = "";
    dns_school = ""; dns_google = ""; dns_ms = ""; tcp_ms = ""; http_status = ""; http_ms = "" }
$fail = { param($stage, $detail) if ($r.result -eq "OK") { $r.result = "FAIL"; $r.stage = $stage; $r.detail = $detail } }

# 1) DNS: 학교 DNS와 구글 DNS(8.8.8.8)를 비교한다. 학교 DNS만 실패하면 DNS 문제다.
$ip = $null
$sw = [Diagnostics.Stopwatch]::StartNew()
try { $ip = ([Net.Dns]::GetHostAddresses($HostName) | Where-Object AddressFamily -eq 'InterNetwork' | Select-Object -First 1).IPAddressToString; $r.dns_school = $ip }
catch { $r.dns_school = "실패"; & $fail "DNS" $_.Exception.Message }
$r.dns_ms = $sw.ElapsedMilliseconds
try { $r.dns_google = (Resolve-DnsName $HostName -Server 8.8.8.8 -Type A -DnsOnly -QuickTimeout -ErrorAction Stop | Where-Object Type -eq 'A' | Select-Object -First 1).IPAddress }
catch { $r.dns_google = "실패(차단 가능)" }

# 2) TCP 443 연결(5초 제한). 실패하면 방화벽 차단이나 망 끊김이다.
$target = if ($ip) { $ip } elseif ($r.dns_google -match '^\d') { $r.dns_google } else { $null }
if ($target) {
    $c = New-Object Net.Sockets.TcpClient
    $sw.Restart()
    try {
        if ($c.ConnectAsync($target, 443).Wait(5000)) { $r.tcp_ms = $sw.ElapsedMilliseconds } else { $r.tcp_ms = "시간초과"; & $fail "TCP" "443 연결 5초 초과" }
    } catch { $r.tcp_ms = "실패"; & $fail "TCP" $_.Exception.Message }
    finally { $c.Close() }
}

# 3) HTTPS 응답(20초 제한) — Windows 내장 curl.exe. 첫 실행 지연(콜드스타트)이면 http_ms 가 길게 찍힌다.
#    curl 종료 코드: 6 DNS 실패 · 7 연결 실패 · 28 시간 초과 · 35 보안연결(TLS) 실패 · 52/56 연결 끊김
$out = & curl.exe -s -o NUL -w "%{http_code} %{time_total}" --max-time 20 "https://$HostName/api/health"
$code = $LASTEXITCODE
$parts = "$out".Split(" ")
$r.http_status = $parts[0]
if ($parts.Count -gt 1) { $r.http_ms = [int]([double]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture) * 1000) }
if ($code -ne 0) { & $fail "HTTPS" ("curl 오류 {0}" -f $code) }
elseif ($r.http_status -ne "200") { & $fail "HTTPS" ("응답 코드 {0}" -f $r.http_status) }

[pscustomobject]$r | Export-Csv $log -Append -NoTypeInformation -Encoding UTF8
