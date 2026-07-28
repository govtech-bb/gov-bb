#!/usr/bin/env bash
# verify-ecs-deployment.sh — confirm an ECS deployment actually landed.
#
# `aws ecs deploy-task-definition --wait-for-service-stability` returns success
# even when ECS silently rolled back to the previous task def revision (the
# service IS stable — just on the OLD image). This script catches that case
# by comparing the deployed PRIMARY task def to the one we just registered.
# Also verifies ALB target health if the service is behind an ALB.
#
# Required environment variables:
#   CLUSTER             — ECS cluster name
#   SERVICE             — ECS service name
#   EXPECTED_TASK_DEF   — full ARN of the task def we just registered
#   AWS_REGION
#
# Fails if either check fails. Exits 0 on success.

set -euo pipefail

: "${CLUSTER:?required}"
: "${SERVICE:?required}"
: "${EXPECTED_TASK_DEF:?required}"
: "${AWS_REGION:?required}"

echo "🔍 [$SERVICE] Verifying deployment landed on expected task def..."

ACTUAL_TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0].deployments[?status==`PRIMARY`].taskDefinition | [0]' \
  --output text)

if [ "$ACTUAL_TASK_DEF" != "$EXPECTED_TASK_DEF" ]; then
  echo "❌ [$SERVICE] SILENT ROLLBACK DETECTED"
  echo "   Expected: $EXPECTED_TASK_DEF"
  echo "   Actual:   $ACTUAL_TASK_DEF"
  echo
  echo "   ECS reverted to a previous task def because the new container failed"
  echo "   to start (likely failed health checks, container crash, or image pull)."
  echo
  echo "   Investigate logs:"
  echo "     aws logs tail /ecs/$SERVICE --follow --region $AWS_REGION"
  echo
  echo "   Recent stopped tasks:"
  aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" \
    --desired-status STOPPED --max-items 3 \
    --region "$AWS_REGION" \
    --query 'taskArns' --output text 2>/dev/null || true
  exit 1
fi

echo "✅ [$SERVICE] Deployed task def matches expected"

# Look up the service's target group (if any) and check target health.
TG_ARN=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0].loadBalancers[0].targetGroupArn' \
  --output text)

if [ -z "$TG_ARN" ] || [ "$TG_ARN" = "None" ]; then
  echo "ℹ️  [$SERVICE] No ALB target group attached — skipping target health check"
  exit 0
fi

echo "🔍 [$SERVICE] Verifying ALB target health on $TG_ARN..."

# Wait up to 2 minutes for at least one target to become healthy.
# (wait-for-service-stability returned success, so tasks are RUNNING — but
# the ALB health check can lag the ECS-side readiness by a few seconds.)
for i in $(seq 1 12); do
  HEALTHY_COUNT=$(aws elbv2 describe-target-health \
    --target-group-arn "$TG_ARN" \
    --region "$AWS_REGION" \
    --query 'TargetHealthDescriptions[?TargetHealth.State==`healthy`] | length(@)' \
    --output text)

  if [ "$HEALTHY_COUNT" -ge 1 ]; then
    echo "✅ [$SERVICE] $HEALTHY_COUNT healthy target(s) in ALB"
    exit 0
  fi

  echo "  [$i/12] no healthy targets yet, sleeping 10s..."
  sleep 10
done

echo "❌ [$SERVICE] No targets reached healthy state in the ALB within 2 minutes"
aws elbv2 describe-target-health \
  --target-group-arn "$TG_ARN" \
  --region "$AWS_REGION" \
  --query 'TargetHealthDescriptions[].{id:Target.Id, state:TargetHealth.State, reason:TargetHealth.Reason, desc:TargetHealth.Description}' \
  --output table 2>&1 || true
exit 1
