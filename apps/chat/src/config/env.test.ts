import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getServerEnv } from "./env.ts";

const KEYS = [
  "RAG_URL",
  "LANDING_URL",
  "BEDROCK_REGION",
  "LLM_MODEL",
  "REWRITE_MODEL",
  "BEDROCK_PROMPT_CACHE",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("throws when the required RAG_URL is missing", () => {
  assert.throws(() => getServerEnv());
});

test("throws when RAG_URL is not a valid URL", () => {
  process.env.RAG_URL = "not-a-url";
  assert.throws(() => getServerEnv());
});

test("applies defaults when optional vars are unset", () => {
  process.env.RAG_URL = "https://chat.example.gov.bb/api";
  const env = getServerEnv();
  assert.equal(env.BEDROCK_REGION, "ca-central-1");
  assert.equal(env.LLM_MODEL, "claude-haiku-4-5");
  assert.equal(env.REWRITE_MODEL, "claude-haiku-4-5");
  assert.equal(env.LANDING_URL, "https://landing.sandbox.alpha.gov.bb");
  assert.equal(env.BEDROCK_PROMPT_CACHE, false);
});

test("treats empty-string vars as unset so defaults apply (Vite define bakes '')", () => {
  process.env.RAG_URL = "https://chat.example.gov.bb/api";
  process.env.LANDING_URL = "";
  process.env.BEDROCK_REGION = "";
  process.env.LLM_MODEL = "";
  const env = getServerEnv();
  assert.equal(env.LANDING_URL, "https://landing.sandbox.alpha.gov.bb");
  assert.equal(env.BEDROCK_REGION, "ca-central-1");
  assert.equal(env.LLM_MODEL, "claude-haiku-4-5");
});

test("strips trailing slashes from LANDING_URL and honours overrides", () => {
  process.env.RAG_URL = "https://chat.example.gov.bb/api";
  process.env.LANDING_URL = "https://alpha.gov.bb/";
  process.env.LLM_MODEL = "claude-opus-4-8";
  process.env.BEDROCK_PROMPT_CACHE = "1";
  const env = getServerEnv();
  assert.equal(env.LANDING_URL, "https://alpha.gov.bb");
  assert.equal(env.LLM_MODEL, "claude-opus-4-8");
  assert.equal(env.BEDROCK_PROMPT_CACHE, true);
});
