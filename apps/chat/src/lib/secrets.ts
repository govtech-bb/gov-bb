// AWS Secrets Manager — runtime fetch helper for the SSR Lambda.
//
// Amplify Hosting Compute doesn't pass console env vars to the SSR Lambda
// at runtime, so historically the team baked secret values into the bundle
// via Vite's `define`. That left the secrets visible in the Amplify console,
// in build artifacts, and in Terraform state (issue #202).
//
// The replacement pattern: at build time, bake in the secret's *ARN* (not
// the value — ARNs are non-sensitive identifiers); at runtime, the Lambda's
// IAM compute role grants `secretsmanager:GetSecretValue` on that ARN, and
// we fetch the value the first time it's needed, then cache the resolved
// promise for the lifetime of the warm container.
//
// One in-flight promise per ARN, so concurrent callers share a single SM
// call during a cold start.
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let client: SecretsManagerClient | undefined;
const cache = new Map<string, Promise<string>>();

function getClient(): SecretsManagerClient {
  if (!client) client = new SecretsManagerClient({});
  return client;
}

export async function getCachedSecret(arn: string): Promise<string> {
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
        // Drop the failed promise so the next call retries (don't poison
        // the cache with a permanent error).
        cache.delete(arn);
        throw err;
      });
    cache.set(arn, inflight);
  }
  return inflight;
}
