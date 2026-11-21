# PulseGuard Local End-to-End Test Runner
# Runs the full local loop:
# 1. Telemetry Interceptor (Go, Port 8080)
# 2. Target Store Service (FastAPI, Port 8000)
# 3. PulseGuard Autonomous Agent Daemon (Python, Live Mode)
# 4. Flash-Sale Load Simulator (Python, 5 RPS -> 150 RPS Surge)

param (
    [switch]$NoSimulator = $false
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "🚀 Launching PulseGuard Local End-to-End Testing Environment" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Start Telemetry Interceptor (Go) on Port 8080
Write-Host "`n[1/4] Starting Go Telemetry Interceptor on http://127.0.0.1:8080..." -ForegroundColor Yellow
$env:PATH += ";C:\Program Files\Go\bin"
$env:GOCACHE = Join-Path $Root ".gocache"
$telemetryProcess = Start-Process -FilePath "go" -ArgumentList "run", "main.go" -WorkingDirectory (Join-Path $Root "telemetry-interceptor") -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

# 2. Start Target Store Service (FastAPI) on Port 8000
Write-Host "[2/4] Starting Target Store Service on http://127.0.0.1:8000..." -ForegroundColor Yellow
$pythonExe = Join-Path $Root ".venv\Scripts\python.exe"
$storeProcess = Start-Process -FilePath $pythonExe -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" -WorkingDirectory (Join-Path $Root "target-store-service") -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

# 3. Verify Health
try {
    $storeHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get -TimeoutSec 3
    Write-Host "  -> Target Store Service is healthy! (Active instance: $($storeHealth.instance_id))" -ForegroundColor Green
} catch {
    Write-Host "  -> Warning: Target Store health check failed. Check logs." -ForegroundColor Red
}

try {
    $interceptorHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8080/healthz" -Method Get -TimeoutSec 3
    Write-Host "  -> Telemetry Interceptor is healthy! (Sliding window active)" -ForegroundColor Green
} catch {
    Write-Host "  -> Warning: Telemetry Interceptor health check failed. Check logs." -ForegroundColor Red
}

Write-Host "`n[3/4] Ready to run PulseGuard Autonomous Agent Daemon!" -ForegroundColor Green
Write-Host "In a separate terminal, run:" -ForegroundColor White
Write-Host "  cd agent-core" -ForegroundColor Yellow
Write-Host "  ..\.venv\Scripts\python.exe agent_loop.py --mode live`n" -ForegroundColor Yellow

if (-not $NoSimulator) {
    Write-Host "[4/4] Starting Flash-Sale Load Simulator against Store..." -ForegroundColor Cyan
    Set-Location (Join-Path $Root "load-simulator")
    & $pythonExe simulate.py --url http://127.0.0.1:8000 --baseline-rps 5 --spike-rps 150 --baseline-sec 5 --spike-sec 15 --cooldown-sec 10
}

# Cleanup on exit
Write-Host "`nStopping background background services..." -ForegroundColor Gray
Stop-Process -Id $telemetryProcess.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $storeProcess.Id -Force -ErrorAction SilentlyContinue
Write-Host "Done!" -ForegroundColor Green
