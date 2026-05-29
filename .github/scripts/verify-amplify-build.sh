#!/usr/bin/env bash
# Verify Amplify auto-build for the commit currently being deployed.
#
# Used by .github/workflows/deploy-staging.yml (and eventually deploy-sandbox
# once it's migrated to the cd-tier2 speedup pattern). The Amplify app is
# expected to have auto-build ENABLED on the target branch — the push that
# triggered the workflow also kicked off Amplify's own build. We just locate
# that build by commit SHA and gate the deploy on its result.
#
# Required environment variables (all set by the calling workflow step):
#   AMPLIFY_APP_ID  — e.g. d27gpzyoit5nrf
#   AMPLIFY_BRANCH  — e.g. staging
#   APP_LABEL       — human label for log lines, e.g. forms
#   COMMIT_SHA      — github.sha of the deploying commit
#   AWS_REGION      — e.g. ca-central-1
#
# Failure modes:
#   1. No job for COMMIT_SHA appears within FIND_TIMEOUT_SECONDS — likely
#      auto-build is off, or the app isn't connected to AMPLIFY_BRANCH yet.
#   2. The job reaches FAILED / CANCELLED — Amplify build broke.
#   3. The job doesn't reach a terminal state within OVERALL_TIMEOUT_SECONDS.

set -euo pipefail

: "${AMPLIFY_APP_ID:?required}"
: "${AMPLIFY_BRANCH:?required}"
: "${APP_LABEL:?required}"
: "${COMMIT_SHA:?required}"
: "${AWS_REGION:?required}"

FIND_TIMEOUT_SECONDS=${FIND_TIMEOUT_SECONDS:-120}   # 2 min to find the auto-build job
OVERALL_TIMEOUT_SECONDS=${OVERALL_TIMEOUT_SECONDS:-900}  # 15 min total cap
POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS:-15}

# -----------------------------------------------------------------------------
# Step 1: find the auto-build job whose commitId matches COMMIT_SHA.
# -----------------------------------------------------------------------------
echo "🔍 [$APP_LABEL] Searching for Amplify auto-build job matching commit $COMMIT_SHA..."

JOB_ID=""
FIND_DEADLINE=$(( $(date +%s) + FIND_TIMEOUT_SECONDS ))

while [ "$(date +%s)" -lt "$FIND_DEADLINE" ]; do
  JOB_ID=$(aws amplify list-jobs \
    --app-id "$AMPLIFY_APP_ID" \
    --branch-name "$AMPLIFY_BRANCH" \
    --region "$AWS_REGION" \
    --max-items 20 \
    --query "jobSummaries[?commitId=='$COMMIT_SHA'].jobId | [0]" \
    --output text 2>/dev/null || echo "None")

  if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "None" ]; then
    echo "✅ [$APP_LABEL] Found Amplify job $JOB_ID for commit $COMMIT_SHA"
    break
  fi

  echo "  …no job yet, retrying in ${POLL_INTERVAL_SECONDS}s"
  sleep "$POLL_INTERVAL_SECONDS"
done

if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "None" ]; then
  echo "❌ [$APP_LABEL] No Amplify auto-build job found for commit $COMMIT_SHA"
  echo "   App: $AMPLIFY_APP_ID  Branch: $AMPLIFY_BRANCH"
  echo "   Likely causes:"
  echo "     - The Amplify app is not connected to branch '$AMPLIFY_BRANCH' in the console."
  echo "     - Auto-build is disabled on the branch."
  echo "     - The repo connection token is missing/expired."
  exit 1
fi

# -----------------------------------------------------------------------------
# Step 2: wait for the job to reach a terminal status.
# -----------------------------------------------------------------------------
echo "⏳ [$APP_LABEL] Waiting for job $JOB_ID to finish (overall cap: ${OVERALL_TIMEOUT_SECONDS}s)..."

OVERALL_DEADLINE=$(( $(date +%s) + OVERALL_TIMEOUT_SECONDS ))

while [ "$(date +%s)" -lt "$OVERALL_DEADLINE" ]; do
  STATUS=$(aws amplify get-job \
    --app-id "$AMPLIFY_APP_ID" \
    --branch-name "$AMPLIFY_BRANCH" \
    --job-id "$JOB_ID" \
    --region "$AWS_REGION" \
    --query job.summary.status \
    --output text)

  echo "  [$APP_LABEL] status: $STATUS"

  case "$STATUS" in
    SUCCEED)
      echo "✅ [$APP_LABEL] Amplify build succeeded (job $JOB_ID)"
      exit 0
      ;;
    FAILED|CANCELLED)
      echo "❌ [$APP_LABEL] Amplify build $STATUS (job $JOB_ID)"
      echo "   Inspect in console: https://${AWS_REGION}.console.aws.amazon.com/amplify/apps/${AMPLIFY_APP_ID}/branches/${AMPLIFY_BRANCH}/deployments/${JOB_ID}"
      exit 1
      ;;
  esac

  sleep "$POLL_INTERVAL_SECONDS"
done

echo "❌ [$APP_LABEL] Amplify build did not reach a terminal state within ${OVERALL_TIMEOUT_SECONDS}s"
exit 1
