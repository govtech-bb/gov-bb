import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerEnv } from "./env.ts";
import { getFeatures, isRagOnly } from "./features.ts";

// Build a ServerEnv with the feature flags set; other fields are irrelevant to
// getFeatures so we cast a partial.
const env = (over: Partial<ServerEnv>): ServerEnv =>
  ({
    FEATURE_FORMS: false,
    FEATURE_FEEDBACK: false,
    FEATURE_OFFERS: false,
    RAG_ONLY: false,
    ...over,
  }) as ServerEnv;

test("defaults to strict RAG — every feature off", () => {
  const f = getFeatures(env({}));
  assert.deepEqual(f, { forms: false, feedback: false, offers: false });
  assert.equal(isRagOnly(f), true);
});

test("enables a single feature independently", () => {
  const f = getFeatures(env({ FEATURE_FORMS: true }));
  assert.equal(f.forms, true);
  assert.equal(f.feedback, false);
  assert.equal(isRagOnly(f), false);
});

test("RAG_ONLY forces every feature off, overriding the individual flags", () => {
  const f = getFeatures(
    env({
      FEATURE_FORMS: true,
      FEATURE_FEEDBACK: true,
      FEATURE_OFFERS: true,
      RAG_ONLY: true,
    }),
  );
  assert.deepEqual(f, { forms: false, feedback: false, offers: false });
  assert.equal(isRagOnly(f), true);
});

test("without RAG_ONLY, all three flags pass through", () => {
  const f = getFeatures(
    env({ FEATURE_FORMS: true, FEATURE_FEEDBACK: true, FEATURE_OFFERS: true }),
  );
  assert.deepEqual(f, { forms: true, feedback: true, offers: true });
  assert.equal(isRagOnly(f), false);
});
