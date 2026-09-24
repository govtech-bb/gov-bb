/**
 * Writes `apps/api_v2/openapi.json` from the running app.
 *
 * `pnpm --filter @govtech-bb/api-v2 openapi`
 *
 * The document is not hand-maintained: it is whatever Fastify builds from the
 * schemas the routes already validate and serialise with. Committing the
 * result is what puts an API change in the diff of a pull request —
 * `openapi.test.ts` fails when the two disagree, so a route that quietly
 * changes shape cannot reach main claiming the old one.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildOpenApiDocument } from "../src/openapi-document";

const target = join(__dirname, "..", "openapi.json");

buildOpenApiDocument()
  .then((document) => {
    writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`Wrote ${target}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
