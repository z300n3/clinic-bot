# ============================================================
# dev-tunnel.ps1  —  Cloudflare Tunnel (works in Iraq)
# Usage: .\dev-tunnel.ps1
# No account or signup required!
# ============================================================

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Clinic Bot — Cloudflare Dev Tunnel" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Check Node/npx available
$npxCmd = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npxCmd) {
    Write-Host "[ERROR] Node.js / npx not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

Write-Host "[1/2] Starting Cloudflare tunnel on port 3000..." -ForegroundColor Yellow
Write-Host "      (first run downloads cloudflared ~30MB, wait a moment)" -ForegroundColor Gray
Write-Host ""

# Run cloudflared and capture output to find the URL
$outputFile = "$env:TEMP\cloudflare_tunnel_output.txt"
$process = Start-Process -FilePath "npx" `
    -ArgumentList "cloudflared tunnel --url http://localhost:3000" `
    -RedirectStandardError $outputFile `
    -PassThru -NoNewWindow

# Poll the output file for the tunnel URL
$tunnelUrl = $null
$attempts = 0
while (-not $tunnelUrl -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    if (Test-Path $outputFile) {
        $content = Get-Content $outputFile -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "[ERROR] Could not detect tunnel URL. Check output above." -ForegroundColor Red
    Write-Host "Try manually: npx cloudflared tunnel --url http://localhost:3000" -ForegroundColor Yellow
    exit 1
}

$webhookUrl = "$tunnelUrl/webhook"

Write-Host "[2/2] Tunnel is LIVE!" -ForegroundColor Green
Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  PASTE THIS INTO META CONSOLE:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Callback URL : $webhookUrl" -ForegroundColor Green
Write-Host "  Verify Token : elias" -ForegroundColor Green
Write-Host ""
Write-Host "  Meta Console path:" -ForegroundColor Gray
Write-Host "  App -> WhatsApp -> Configuration -> Edit Webhook" -ForegroundColor Gray
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Health check: $tunnelUrl/health" -ForegroundColor Gray
Write-Host ""
Write-Host "Press ENTER to stop the tunnel..." -ForegroundColor DarkGray
$null = Read-Host

$process | Stop-Process -Force -ErrorAction SilentlyContinue
if (Test-Path $outputFile) { Remove-Item $outputFile -Force }
Write-Host "Tunnel stopped." -ForegroundColor Yellow
