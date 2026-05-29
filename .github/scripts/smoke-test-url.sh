#!/usr/bin/env bash
# smoke-test-url.sh — curl a URL with retries, optionally validate a JSON field.
#
# Used by deploy-staging.yml after each ECS/Amplify deploy to confirm the
# new revision is actually serving traffic. Catches the "deploy looked
# green but URL doesn't serve 200" failure mode.
#
# Required environment variables:
#   URL    — full URL to curl
#   LABEL  — short human label for log lines (e.g. "api", "chat")
#
# Optional:
#   EXPECT_JSON_FIELD  — jq path to validate (e.g. '.db' or '.status')
#   EXPECT_JSON_VALUE  — expected value of that field (e.g. 'connected', 'ok')
#   MAX_ATTEMPTS       — default 5
#   SLEEP_SECONDS      — default 5

set -euo pipefail

: "${URL:?required}"
: "${LABEL:?required}"

MAX_ATTEMPTS=${MAX_ATTEMPTS:-5}
SLEEP_SECONDS=${SLEEP_SECONDS:-5}

echo "🔍 [$LABEL] Smoke test: $URL"

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

for i in $(seq 1 "$MAX_ATTEMPTS"); do
  HTTP_CODE=$(curl -fsS -o "$BODY_FILE" -w "%{http_code}" --max-time 15 "$URL" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    if [ -n "${EXPECT_JSON_FIELD:-}" ]; then
      ACTUAL=$(jq -r "$EXPECT_JSON_FIELD" "$BODY_FILE" 2>/dev/null || echo "PARSE_ERROR")
      if [ "$ACTUAL" = "${EXPECT_JSON_VALUE:-}" ]; then
        echo "✅ [$LABEL] OK (HTTP 200, $EXPECT_JSON_FIELD == \"$ACTUAL\")"
        exit 0
      fi
      echo "  [$i/$MAX_ATTEMPTS] HTTP 200 but $EXPECT_JSON_FIELD == \"$ACTUAL\" (expected \"$EXPECT_JSON_VALUE\"), retrying in ${SLEEP_SECONDS}s..."
    else
      echo "✅ [$LABEL] OK (HTTP 200)"
      exit 0
    fi
  else
    echo "  [$i/$MAX_ATTEMPTS] HTTP $HTTP_CODE, retrying in ${SLEEP_SECONDS}s..."
  fi

  sleep "$SLEEP_SECONDS"
done

echo "❌ [$LABEL] Smoke test failed after $MAX_ATTEMPTS attempts"
echo "   URL: $URL"
if [ -n "${EXPECT_JSON_FIELD:-}" ]; then
  echo "   Expected: $EXPECT_JSON_FIELD == \"${EXPECT_JSON_VALUE:-}\""
fi
echo "   Last response body (first 500 chars):"
head -c 500 "$BODY_FILE" 2>/dev/null || echo "   (empty)"
echo
exit 1
