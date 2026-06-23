// Runtime Secrets Manager helpers for form_builder's SSR Lambda.
//
// Replaces the previous pattern of baking secret VALUES into the SSR bundle
// via Vite's `define` (alpha-infra#202 / #203 — that left secrets visible in
// the Amplify console, build artifacts, and Terraform state). The new bake
// contains only the secrets' ARNs (non-sensitive identifiers); each consumer
// awaits a getter below to fetch the actual value via the compute role's
// secretsmanager:GetSecretValue grant.
//
// JSON shape:
//   FORM_BUILDER_TOKENS_SECRET_ARN          → { admin_token, session_secret }
//   FORM_BUILDER_GITHUB_OAUTH_SECRET_ARN    → { client_id, client_secret }
//
// Each secret is fetched at most once per warm Lambda container (one in-flight
// promise per ARN, cached). Failed promises drop from the cache so transient
// blips can self-heal on the next call.
//
// `process.env.X` fallbacks remain so local dev / `.env.local` keeps working
// — if the plaintext value is already in the environment we never call SM.

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let client: SecretsManagerClient | undefined;
const cache = new Map<string, Promise<Record<string, unknown>>>();

function getClient(): SecretsManagerClient {
  if (!client) client = new SecretsManagerClient({});
  return client;
}

async function getCachedSecretJson(
  arn: string,
): Promise<Record<string, unknown>> {
  let p = cache.get(arn);
  if (!p) {
    p = getClient()
      .send(new GetSecretValueCommand({ SecretId: arn }))
      .then((r) => {
        if (!r.SecretString) {
          throw new Error(`Secret ${arn} has no SecretString`);
        }
        return JSON.parse(r.SecretString) as Record<string, unknown>;
      })
      .catch((err) => {
        cache.delete(arn);
        throw err;
      });
    cache.set(arn, p);
  }
  return p;
}

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

export async function getAdminApiToken(): Promise<string> {
  const direct = process.env.ADMIN_API_TOKEN;
  if (direct) return direct;
  const arn = process.env.FORM_BUILDER_TOKENS_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "Neither ADMIN_API_TOKEN nor FORM_BUILDER_TOKENS_SECRET_ARN is set",
    );
  }
  const json = await getCachedSecretJson(arn);
  return readStringField(json, "admin_token", "form-builder-tokens");
}

export async function getSessionSecret(): Promise<string> {
  const direct = process.env.SESSION_SECRET;
  if (direct) return direct;
  const arn = process.env.FORM_BUILDER_TOKENS_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "Neither SESSION_SECRET nor FORM_BUILDER_TOKENS_SECRET_ARN is set",
    );
  }
  const json = await getCachedSecretJson(arn);
  return readStringField(json, "session_secret", "form-builder-tokens");
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
  const arn = process.env.FORM_BUILDER_GITHUB_OAUTH_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "GITHUB_OAUTH_CLIENT_ID/SECRET and FORM_BUILDER_GITHUB_OAUTH_SECRET_ARN are all unset",
    );
  }
  const json = await getCachedSecretJson(arn);
  return {
    clientId: readStringField(json, "client_id", "form-builder-github-oauth"),
    clientSecret: readStringField(
      json,
      "client_secret",
      "form-builder-github-oauth",
    ),
  };
}
