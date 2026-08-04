#!/bin/sh
# deploys the eap-stage remote MCP + UI to Cloud Run.
# max-instances=1 is load-bearing: the pipeline's rate limit is an in-process
# token bucket, and one instance keeps it a true global cap.
set -e
PROJECT_ID=${PROJECT_ID:-eap-stage-prod}
REGION=us-central1
export CLOUDSDK_CORE_PROJECT=$PROJECT_ID
# Artifact Registry, not gcr.io: Container Registry is retired and new projects
# cannot push to it. Builds must name a service account explicitly too — new
# projects get no legacy Cloud Build SA, and omitting it yields a bare 403.
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/eap-stage/eap-stage
# a build with an explicit service account must also say where logs go.
gcloud builds submit --tag $IMAGE --region=$REGION \
  --service-account=projects/$PROJECT_ID/serviceAccounts/$PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET .
gcloud run deploy eap-stage \
  --image $IMAGE \
  --region $REGION \
  --allow-unauthenticated \
  --max-instances=1 \
  --memory=256Mi \
  --port=8080
