// AWS Secrets Manager — runtime fetch helper for SSR Lambdas.
//
// Amplify Hosting Compute doesn't pass console env vars to the SSR Lambda at
// runtime, so the team bakes in each secret's *ARN* (a non-sensitive
// identifier) at build time and resolves the value the first time it's needed
// via the compute role's `secretsmanager:GetSecretValue` grant — keeping the
// plaintext out of the bundle, the Amplify console, and Terraform state
// (alpha-infra#202/#203).
//
// One in-flight promise is cached per ARN, so concurrent callers during a cold
// start share a single Secrets Manager call, and the value is reused for the
// lifetime of the warm container. A failed promise is dropped from the cache so
// the next call retries instead of being poisoned by a transient error.
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

let client: SecretsManagerClient | undefined;
const cache = new Map<string, Promise<string>>();

function getClient(): SecretsManagerClient {
  if (!client) client = new SecretsManagerClient({});
  return client;
}

/** Resolve a secret's raw `SecretString`, cached per ARN for the warm container. */
export async function getCachedSecretString(arn: string): Promise<string> {
  let inflight = cache.get(arn);
  if (!inflight) {
    inflight = getClient()
      .send(new GetSecretValueCommand({ SecretId: arn }))
      .then((r) => {
        if (!r.SecretString) {
          throw new Error(`Secret ${arn} has no SecretString`);
        }
        return r.SecretString;
      })
      .catch((err) => {
        // Drop the failed promise so the next call retries (don't poison the
        // cache with a permanent error).
        cache.delete(arn);
        throw err;
      });
    cache.set(arn, inflight);
  }
  return inflight;
}

/**
 * Resolve a secret whose value is a JSON object. Parses on top of the shared
 * string cache, so it never issues a separate Secrets Manager call for an ARN
 * already fetched as a string.
 */
export async function getCachedSecretJson(
  arn: string,
): Promise<Record<string, unknown>> {
  const raw = await getCachedSecretString(arn);
  return JSON.parse(raw) as Record<string, unknown>;
}
