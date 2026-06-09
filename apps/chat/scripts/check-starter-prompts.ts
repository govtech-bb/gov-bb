#!/usr/bin/env tsx
/**
 * Build-time invariant: every slug in STARTER_PROMPTS must resolve to a
 * service in @govtech-bb/content. Wired into the chat's `prebuild` script
 * so CI's `nx build chat` fails the build on drift.
 *
 * Runnable standalone for local feedback:
 *   cd apps/chat && npm run check:starter-prompts
 */
import { loadContent } from "@govtech-bb/content";
import { STARTER_PROMPTS } from "../src/lib/chat/starter-prompts.js";

const { services } = await loadContent();
const onDisk = new Set(services.map((s) => s.slug));
const missing = STARTER_PROMPTS.filter(({ slug }) => !onDisk.has(slug));

if (missing.length > 0) {
  console.error(
    "starter-prompts drift: the following slugs are not in @govtech-bb/content:",
  );
  for (const { slug, prompt } of missing) {
    console.error(`  - ${slug}  ("${prompt}")`);
  }
  console.error(
    "\nFix: rename the slug to match the corpus, or remove the entry from STARTER_PROMPTS.",
  );
  process.exit(1);
}

console.log(
  `✓ starter-prompts: all ${STARTER_PROMPTS.length} slugs resolve to corpus services`,
);
