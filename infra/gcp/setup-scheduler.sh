#!/usr/bin/env bash
# One-time setup: two Cloud Scheduler jobs that toggle the Cloud Run
# service's min-instances between 1 (warm, fast responses) and 0
# (scale-to-zero, no idle cost) on an IST business-hours clock — run
# manually once per environment, not from CI (docs/DEPLOYMENT.md
# "Cost-saving schedule").
#
# Warm window: 5:00 AM–8:00 PM IST. Outside it the service scales to
# zero and the first request after a cold spell pays a cold-start
# (a few seconds), which is the traded-off cost.
#
# Usage:
#   PROJECT_ID=ironman-prod REGION=asia-south1 SERVICE=ironman-api \
#   SA_EMAIL=ironman-deployer@ironman-prod.iam.gserviceaccount.com \
#     ./setup-scheduler.sh
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:?set REGION}"
: "${SERVICE:?set SERVICE}"
: "${SA_EMAIL:?set SA_EMAIL — the same service account used by deploy.yml works}"

gcloud services enable cloudscheduler.googleapis.com --project "$PROJECT_ID"

# The scheduler job needs somewhere to live; it doesn't have to match
# the Cloud Run region, but keeping it in the same region avoids an
# extra location to track.
SCHED_LOCATION="$REGION"

URI="https://${REGION}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${PROJECT_ID}/services/${SERVICE}"

make_body() {
  # Knative min-scale annotation — the documented way to change Cloud
  # Run scaling from outside `gcloud run deploy` without a full redeploy.
  printf '{"spec":{"template":{"metadata":{"annotations":{"autoscaling.knative.dev/minScale":"%s"}}}}}' "$1"
}

gcloud scheduler jobs create http ironman-api-scale-up \
  --project "$PROJECT_ID" \
  --location "$SCHED_LOCATION" \
  --schedule "0 5 * * *" \
  --time-zone "Asia/Kolkata" \
  --uri "$URI" \
  --http-method PATCH \
  --headers "Content-Type=application/merge-patch+json" \
  --message-body "$(make_body 1)" \
  --oauth-service-account-email "$SA_EMAIL" \
  --description "Warm the IronMan API for the business day (5am IST)" \
  || gcloud scheduler jobs update http ironman-api-scale-up \
       --project "$PROJECT_ID" --location "$SCHED_LOCATION" \
       --schedule "0 5 * * *" --time-zone "Asia/Kolkata" \
       --uri "$URI" --http-method PATCH \
       --headers "Content-Type=application/merge-patch+json" \
       --message-body "$(make_body 1)" \
       --oauth-service-account-email "$SA_EMAIL"

gcloud scheduler jobs create http ironman-api-scale-down \
  --project "$PROJECT_ID" \
  --location "$SCHED_LOCATION" \
  --schedule "0 20 * * *" \
  --time-zone "Asia/Kolkata" \
  --uri "$URI" \
  --http-method PATCH \
  --headers "Content-Type=application/merge-patch+json" \
  --message-body "$(make_body 0)" \
  --oauth-service-account-email "$SA_EMAIL" \
  --description "Let the IronMan API scale to zero overnight (8pm IST)" \
  || gcloud scheduler jobs update http ironman-api-scale-down \
       --project "$PROJECT_ID" --location "$SCHED_LOCATION" \
       --schedule "0 20 * * *" --time-zone "Asia/Kolkata" \
       --uri "$URI" --http-method PATCH \
       --headers "Content-Type=application/merge-patch+json" \
       --message-body "$(make_body 0)" \
       --oauth-service-account-email "$SA_EMAIL"

echo "Scheduler jobs created/updated. Verify with:"
echo "  gcloud scheduler jobs list --project $PROJECT_ID --location $SCHED_LOCATION"
