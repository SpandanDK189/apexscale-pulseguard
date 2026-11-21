#!/bin/bash
# ========================================================
# PulseGuard Cloud Run Deployment Script (Linux / Mac / Cloud Shell)
# ========================================================

PROJECT_ID="pulseguard-apexscale"
REGION="asia-south1"

echo "Setting Project: $PROJECT_ID..."
gcloud config set project $PROJECT_ID

echo "Enabling Services..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com bigquery.googleapis.com

echo "Deploying Target Store Service to Cloud Run..."
cd target-store-service
gcloud run deploy pulseguard-store \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --min-instances 1 \
    --max-instances 15
cd ..

echo "Deploying Telemetry Interceptor to Cloud Run..."
cd telemetry-interceptor
gcloud run deploy pulseguard-interceptor \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars GCP_PROJECT_ID=$PROJECT_ID,BIGQUERY_DATASET=pulseguard_telemetry,BIGQUERY_TABLE=telemetry_events
cd ..

echo "Deployment Complete!"
