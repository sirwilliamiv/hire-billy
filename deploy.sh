#!/bin/sh
# deploys the hire-billy remote MCP + UI to Cloud Run.
# max-instances=1 is load-bearing: the pipeline's rate limit is an in-process
# token bucket, and one instance keeps it a true global cap.
set -e
PROJECT_ID=inbox-admin-468913
REGION=us-central1
export CLOUDSDK_CORE_PROJECT=$PROJECT_ID
gcloud builds submit --tag gcr.io/$PROJECT_ID/hire-billy .
gcloud run deploy hire-billy \
  --image gcr.io/$PROJECT_ID/hire-billy \
  --region $REGION \
  --allow-unauthenticated \
  --max-instances=1 \
  --memory=256Mi \
  --port=8080
