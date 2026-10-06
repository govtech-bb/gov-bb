import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [baseURL, ...requested] = process.argv.slice(2);

let url;

try {
  url = new URL(baseURL);
} catch {}

if (!url || !["http:", "https:"].includes(url.protocol)) {
  console.error("Usage: node scripts/browser/run.mjs <http://localhost:PORT/> [suite.mjs ...]");
  process.exit(2);
}

const suites = requested.length
  ? requested
  : [
      "native-form-schema.mjs",
      "native-logic-controls.mjs",
      "native-formula.mjs",
      "native-field-controls.mjs",
      "link-editing.mjs",
      "bug-undo-after-inserts.mjs",
      "source-editing.mjs",
      "unified-logic.mjs",
      "registry-insertion.mjs",
      "external-extensions.mjs",
      "persistence-isolation.mjs",
      "confirmation-page.mjs",
      "service-workspace.mjs",
      "routing.mjs",
      "page-writer.mjs",
    ];

for (const suite of suites) {
  if (!/^[a-z0-9-]+\.mjs$/i.test(suite) || ["run.mjs", "playwright.mjs"].includes(suite)) {
    console.error(`Unknown browser suite: ${suite}`);
    process.exit(2);
  }

  const file = fileURLToPath(new URL(suite, import.meta.url));

  if (!existsSync(file)) {
    console.error(`Missing browser suite: ${suite}`);
    process.exit(2);
  }

  console.log(`Running ${suite} against ${url.href}`);

  const result = spawnSync(process.execPath, [file, url.href], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(2);
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
}
