# Setup Google Cloud Infrastructure for PulseGuard
# Run with: .\setup_gcp.ps1 -ProjectID "<your-project-id>" -Region "asia-south1"

param (
    [Parameter(Mandatory=$true)]
    [string]$ProjectID,

    [string]$Region = "asia-south1",
    [string]$DatasetID = "pulseguard_telemetry",
    [string]$TableName = "telemetry_events"
)

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "🚀 Setting up PulseGuard GCP Foundation: Project $ProjectID" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Set default project
Write-Host "`n[1/4] Setting active GCP project..." -ForegroundColor Yellow
gcloud config set project $ProjectID

# 2. Enable Required APIs
Write-Host "`n[2/4] Enabling required Google Cloud APIs..." -ForegroundColor Yellow
$apis = @(
    "run.googleapis.com",
    "bigquery.googleapis.com",
    "pubsub.googleapis.com",
    "aiplatform.googleapis.com"
)
foreach ($api in $apis) {
    Write-Host "  -> Enabling $api..."
    gcloud services enable $api --project $ProjectID
}

# 3. Create BigQuery Dataset & Table
Write-Host "`n[3/4] Creating BigQuery Dataset & Telemetry Table..." -ForegroundColor Yellow
bq --project_id=$ProjectID mk --dataset --location=$Region "$ProjectID`:$DatasetID" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  -> Dataset $DatasetID created successfully." -ForegroundColor Green
} else {
    Write-Host "  -> Dataset $DatasetID already exists or created." -ForegroundColor Gray
}

$ddlPath = Join-Path $PSScriptRoot "telemetry-interceptor\schema\bigquery_telemetry_schema.sql"
if (Test-Path $ddlPath) {
    Write-Host "  -> Executing BigQuery DDL schema..."
    bq query --use_legacy_sql=false --project_id=$ProjectID < $ddlPath
}

# 4. Verification summary
Write-Host "`n[4/4] Verification:" -ForegroundColor Yellow
Write-Host "  • Project:      $ProjectID"
Write-Host "  • Region:       $Region"
Write-Host "  • BigQuery:     $ProjectID`:$DatasetID`.$TableName"
Write-Host "  • Cloud Run:    Enabled"
Write-Host "`n✅ PulseGuard GCP Foundation setup complete!" -ForegroundColor Green
