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
  // Saved/restored so the production fail-fast tests can drive it hermetically.
  "NODE_ENV",
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
  assert.equal(env.LANDING_URL, "https://alpha.gov.bb");
  assert.equal(env.BEDROCK_PROMPT_CACHE, false);
});

test("requires LANDING_URL in production — fails fast when unset (#1366)", () => {
  process.env.RAG_URL = "https://chat.example.gov.bb/api";
  process.env.NODE_ENV = "production";
  // LANDING_URL is deleted by beforeEach.
  assert.throws(() => getServerEnv());
});

test("uses the dev-only LANDING_URL default outside production", () => {
  process.env.RAG_URL = "https://chat.example.gov.bb/api";
  process.env.NODE_ENV = "development";
  const env = getServerEnv();
  assert.equal(env.LANDING_URL, "https://alpha.gov.bb");
});

test("honours an explicit LANDING_URL in production", () => {
  process.env.RAG_URL = "https://chat.example.gov.bb/api";
  process.env.NODE_ENV = "production";
  process.env.LANDING_URL = "https://landing.sandbox.alpha.gov.bb/";
  const env = getServerEnv();
  assert.equal(env.LANDING_URL, "https://landing.sandbox.alpha.gov.bb");
});

test("treats empty-string vars as unset so defaults apply (Vite define bakes '')", () => {
  process.env.RAG_URL = "https://chat.example.gov.bb/api";
  process.env.LANDING_URL = "";
  process.env.BEDROCK_REGION = "";
  process.env.LLM_MODEL = "";
  const env = getServerEnv();
  assert.equal(env.LANDING_URL, "https://alpha.gov.bb");
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
