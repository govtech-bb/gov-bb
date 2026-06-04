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
#   EXPECT_CODES       — comma-separated HTTP status codes that count as
#                        success. Default "200". JSON-field validation only
#                        runs if response code is exactly "200" — non-200
#                        accepted codes pass through without body check.
#                        Example for an auth-gated SSR app that redirects
#                        unauthenticated requests to OAuth: "200,302,307".
#   EXPECT_JSON_FIELD  — jq path to validate (e.g. '.db' or '.status')
#   EXPECT_JSON_VALUE  — expected value of that field (e.g. 'connected', 'ok')
#   MAX_ATTEMPTS       — default 5
#   SLEEP_SECONDS      — default 5

set -euo pipefail

: "${URL:?required}"
: "${LABEL:?required}"

EXPECT_CODES=${EXPECT_CODES:-200}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-5}
SLEEP_SECONDS=${SLEEP_SECONDS:-5}

echo "🔍 [$LABEL] Smoke test: $URL (accept codes: $EXPECT_CODES)"

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

# Check membership in EXPECT_CODES (comma-separated).
code_accepted() {
  local code="$1"
  # Surround with commas so exact-match substring search works for first/last.
  case ",$EXPECT_CODES," in
    *",$code,"*) return 0 ;;
    *) return 1 ;;
  esac
}

for i in $(seq 1 "$MAX_ATTEMPTS"); do
  HTTP_CODE=$(curl -fsS -o "$BODY_FILE" -w "%{http_code}" --max-time 15 "$URL" 2>/dev/null || echo "000")

  if code_accepted "$HTTP_CODE"; then
    # JSON-field validation only meaningful on a 200 with a real body. For
    # redirect codes (302/307) the body is normally empty and we just want
    # the proof-of-life from the SSR.
    if [ "$HTTP_CODE" = "200" ] && [ -n "${EXPECT_JSON_FIELD:-}" ]; then
      ACTUAL=$(jq -r "$EXPECT_JSON_FIELD" "$BODY_FILE" 2>/dev/null || echo "PARSE_ERROR")
      if [ "$ACTUAL" = "${EXPECT_JSON_VALUE:-}" ]; then
        echo "✅ [$LABEL] OK (HTTP 200, $EXPECT_JSON_FIELD == \"$ACTUAL\")"
        exit 0
      fi
      echo "  [$i/$MAX_ATTEMPTS] HTTP 200 but $EXPECT_JSON_FIELD == \"$ACTUAL\" (expected \"$EXPECT_JSON_VALUE\"), retrying in ${SLEEP_SECONDS}s..."
    else
      echo "✅ [$LABEL] OK (HTTP $HTTP_CODE)"
      exit 0
    fi
  else
    echo "  [$i/$MAX_ATTEMPTS] HTTP $HTTP_CODE, retrying in ${SLEEP_SECONDS}s..."
  fi

  sleep "$SLEEP_SECONDS"
done

echo "❌ [$LABEL] Smoke test failed after $MAX_ATTEMPTS attempts"
echo "   URL: $URL"
echo "   Accepted codes: $EXPECT_CODES"
if [ -n "${EXPECT_JSON_FIELD:-}" ]; then
  echo "   Expected: $EXPECT_JSON_FIELD == \"${EXPECT_JSON_VALUE:-}\""
fi
echo "   Last response body (first 500 chars):"
head -c 500 "$BODY_FILE" 2>/dev/null || echo "   (empty)"
echo
exit 1
