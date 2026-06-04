// Bumps the Amplify SSR Lambda timeout above the 30-second default by
// editing `.amplify-hosting/deploy-manifest.json` after Nitro writes it.
//
// Why: Nitro's `aws_amplify` preset only forwards `runtime` from its
// `awsAmplify` config into the manifest — it never writes
// `timeoutInSeconds` even though Amplify reads that field per
// https://docs.aws.amazon.com/amplify/latest/userguide/ssr-deployment-specification.html.
// The AI builder's POST /sessions/:id/message routinely needs 40-60s
// because Bedrock processes the uploaded PDF synchronously; the SSR
// Lambda is the proxy in front of the ECS form_builder_api and hits the
// default 30s ceiling before Bedrock finishes, returning a 504 to the
// browser (which TanStack Start surfaces as "Invariant failed").
//
// Bumping the manifest timeout removes the Lambda ceiling. The ECS task
// and Bedrock have no comparable cap; this is the binding constraint.
//
// Run from `npm run build` after `vite build` completes.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(
  __dirname,
  "..",
  ".amplify-hosting",
  "deploy-manifest.json",
);

// Lambda hard max is 900s. 300s leaves headroom for the worst observed
// Bedrock call (~60-90s for a complex multi-page PDF) without enabling
// truly pathological waits.
const TIMEOUT_SECONDS = 300;

if (!existsSync(manifestPath)) {
  // Build target wasn't aws_amplify (e.g. dev preview) — nothing to patch.
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!manifest.computeResources?.length) {
  console.error(
    `[patch-amplify-manifest] no computeResources in ${manifestPath}`,
  );
  process.exit(1);
}

for (const resource of manifest.computeResources) {
  resource.timeoutInSeconds = TIMEOUT_SECONDS;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `[patch-amplify-manifest] set timeoutInSeconds=${TIMEOUT_SECONDS} on ${manifest.computeResources.length} compute resource(s)`,
);
