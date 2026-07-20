// Runtime Secrets Manager helpers for the feature-flagging SSR Lambda.
//
// Mirrors form_builder's secrets.ts (alpha-infra#202/#203): only the secrets'
// ARNs are baked into the bundle (non-sensitive identifiers); each getter below
// fetches the actual value via the compute role's secretsmanager:GetSecretValue
// grant, cached per warm Lambda container.
//
// JSON shape:
//   FEATURE_FLAGGING_TOKENS_SECRET_ARN        → { session_secret, slack_webhook_url }
//   FEATURE_FLAGGING_GITHUB_OAUTH_SECRET_ARN  → { client_id, client_secret }
//
// The service_status API is authenticated by the user's forwarded GitHub token
// (see app/server/api-client.ts), so no service-to-service admin token is kept
// here. `process.env.X` fallbacks remain so local dev / `.env.local` works.

import { getCachedSecretJson } from "@govtech-bb/aws-secrets";

function readStringField(
  json: Record<string, unknown>,
  key: string,
  arnLabel: string,
): string {
  const v = json[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Field '${key}' missing or empty in secret ${arnLabel}`);
  }
  return v;
}

export async function getSessionSecret(): Promise<string> {
  const direct = process.env.SESSION_SECRET;
  if (direct) return direct;
  const arn = process.env.FEATURE_FLAGGING_TOKENS_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "Neither SESSION_SECRET nor FEATURE_FLAGGING_TOKENS_SECRET_ARN is set",
    );
  }
  const json = await getCachedSecretJson(arn);
  return readStringField(json, "session_secret", "feature-flagging-tokens");
}

export async function getGitHubOAuthCreds(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  const directId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const directSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (directId && directSecret) {
    return { clientId: directId, clientSecret: directSecret };
  }
  const arn = process.env.FEATURE_FLAGGING_GITHUB_OAUTH_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "GITHUB_OAUTH_CLIENT_ID/SECRET and FEATURE_FLAGGING_GITHUB_OAUTH_SECRET_ARN are all unset",
    );
  }
  const json = await getCachedSecretJson(arn);
  return {
    clientId: readStringField(
      json,
      "client_id",
      "feature-flagging-github-oauth",
    ),
    clientSecret: readStringField(
      json,
      "client_secret",
      "feature-flagging-github-oauth",
    ),
  };
}

/**
 * The Slack incoming-webhook URL for service-status change notifications.
 *
 * Unlike the getters above, this is non-critical: it returns `undefined` when
 * unconfigured so a missing webhook silently disables notifications rather than
 * breaking a status change. Local dev / `.env` set SLACK_WEBHOOK_URL directly;
 * deployed builds read the `slack_webhook_url` field from the feature-flagging
 * tokens secret.
 */
export async function getSlackWebhookUrl(): Promise<string | undefined> {
  const direct = process.env.SLACK_WEBHOOK_URL;
  if (direct) return direct;
  const arn = process.env.FEATURE_FLAGGING_TOKENS_SECRET_ARN;
  if (!arn) return undefined;
  const json = await getCachedSecretJson(arn);
  const value = json["slack_webhook_url"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
