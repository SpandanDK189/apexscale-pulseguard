@echo off
REM ========================================================
REM PulseGuard Cloud Run Deployment Automation Script
REM ========================================================

set PROJECT_ID=pulseguard-apexscale
set REGION=asia-south1

echo [1/4] Checking Google Cloud Project...
call gcloud config set project %PROJECT_ID%

echo [2/4] Enabling Required Google Cloud APIs...
call gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com bigquery.googleapis.com

echo [3/4] Deploying Target Store Service to Cloud Run...
cd target-store-service
call gcloud run deploy pulseguard-store ^
    --source . ^
    --region %REGION% ^
    --platform managed ^
    --allow-unauthenticated ^
    --min-instances 1 ^
    --max-instances 15
cd ..

echo [4/4] Deploying Telemetry Interceptor to Cloud Run...
cd telemetry-interceptor
call gcloud run deploy pulseguard-interceptor ^
    --source . ^
    --region %REGION% ^
    --platform managed ^
    --allow-unauthenticated ^
    --set-env-vars GCP_PROJECT_ID=%PROJECT_ID%,BIGQUERY_DATASET=pulseguard_telemetry,BIGQUERY_TABLE=telemetry_events
cd ..

echo ========================================================
echo PulseGuard Services Deployed Successfully to Cloud Run!
echo ========================================================
pause
