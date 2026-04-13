#requires -Version 5.1
<#
  MAO Platform — development on Windows (PowerShell).
  Starts Postgres + Redis + Langfuse via Docker, then:
    - Opens a second window for the FastAPI API (uvicorn --reload)
    - Runs Vite in this window

   Prerequisites: Docker Desktop, Node 20+, uv (https://docs.astral.sh/uv/).
#>
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host ""
Write-Host "MAO Platform — Dev Mode (Windows)" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "$Root\.env")) {
    Write-Host "No .env — copying .env.example" -ForegroundColor Yellow
    Copy-Item "$Root\.env.example" "$Root\.env"
    Write-Host "Edit .env and set at least ANTHROPIC_API_KEY (or another provider)." -ForegroundColor Yellow
}

Write-Host "Starting Postgres, Redis, Langfuse (docker compose)..."
Set-Location $Root
docker compose -f "$Root\docker-compose.yml" up -d postgres redis langfuse

Write-Host "Waiting for Postgres..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    docker compose -f "$Root\docker-compose.yml" exec -T postgres pg_isready -U mao 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    throw "Postgres did not become ready in time. Check: docker compose logs postgres"
}
Write-Host "Postgres ready." -ForegroundColor Green

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'uv' not found on PATH. Install: https://docs.astral.sh/uv/" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "pnpm not on PATH — trying corepack (ships with Node 20+)..."
    try {
        corepack enable 2>$null
        corepack prepare pnpm@9.14.0 --activate
    } catch {
        Write-Host "ERROR: Enable pnpm (e.g. corepack enable) or install pnpm globally." -ForegroundColor Red
        exit 1
    }
}

$apiDir = Join-Path $Root "apps\api"
$apiScript = @"
Set-Location '$apiDir'
Write-Host 'API: uv sync + uvicorn on http://localhost:8000' -ForegroundColor Green
uv sync --dev
uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
"@

Write-Host ""
Write-Host "Opening a second PowerShell window for the API..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $Root -ArgumentList @("-NoExit", "-Command", $apiScript)

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Installing workspace deps and starting Vite on http://localhost:5173 ..." -ForegroundColor Cyan
Set-Location $Root
pnpm install
Set-Location (Join-Path $Root "apps\web")
pnpm dev
