// One-off generator for the v1 parity goldens read by src/compile/compile.spec.ts.
// Compiles each seed page with v1's landing pipeline (processMarkdown, then
// bakeStartLinkFormId with the page's form_id), strips position data and writes
// src/compile/__fixtures__/<slug-with-dashes>.v1.json.
//
// Run from the repo root:
//   pnpm exec tsx apps/simple_mock_api/scripts/write-v1-goldens.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { processMarkdown } from "../../landing/src/utils/markdown/processor.ts";
import { bakeStartLinkFormId } from "../../landing/src/utils/markdown/plugins/bakeStartLinkFormId.ts";

const SEED_PAGES = [
  "get-birth-certificate/index",
  "get-birth-certificate/start",
  "get-death-certificate/index",
  "get-death-certificate/start",
];

const seedDir = new URL("../seed/", import.meta.url);
const fixturesDir = new URL("../src/compile/__fixtures__/", import.meta.url);

function stripPosition(node: { position?: unknown; children?: unknown[] }) {
  delete node.position;
  for (const child of node.children ?? []) stripPosition(child as typeof node);
}

mkdirSync(fixturesDir, { recursive: true });
for (const slug of SEED_PAGES) {
  const source = readFileSync(new URL(`${slug}.md`, seedDir), "utf8");
  const { data, content } = matter(source);
  const { hast } = await processMarkdown(content);
  bakeStartLinkFormId(hast, data.form_id);
  stripPosition(hast);
  const out = new URL(`${slug.replace("/", "-")}.v1.json`, fixturesDir);
  writeFileSync(out, `${JSON.stringify(hast, null, 2)}\n`);
  console.log(`wrote ${fileURLToPath(out)}`);
}
