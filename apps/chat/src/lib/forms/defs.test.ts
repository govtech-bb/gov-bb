import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { clearFormDefCache, getFormDefinition } from "./defs.ts";

const VALID = {
  formId: "test-form",
  title: "Test Form",
  steps: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: "1.0.0",
};

// A fetch double returning a fixed body; counts calls.
function fakeFetch(body: unknown, ok = true) {
  let calls = 0;
  const impl = (async () => {
    calls++;
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}

let savedRag: string | undefined;
let savedForm: string | undefined;
beforeEach(() => {
  savedRag = process.env.RAG_URL;
  savedForm = process.env.FORM_API_URL;
  process.env.RAG_URL = "http://localhost:3001/api"; // getServerEnv requires it
  process.env.FORM_API_URL = "https://forms.example";
  clearFormDefCache();
});
afterEach(() => {
  if (savedRag === undefined) delete process.env.RAG_URL;
  else process.env.RAG_URL = savedRag;
  if (savedForm === undefined) delete process.env.FORM_API_URL;
  else process.env.FORM_API_URL = savedForm;
  clearFormDefCache();
});

test("returns the parsed ServiceContract on a valid response", async () => {
  const f = fakeFetch({ data: VALID });
  const out = await getFormDefinition("test-form", { fetchImpl: f.impl });
  assert.equal(out?.formId, "test-form");
  assert.equal(out?.title, "Test Form");
});

test("returns null (no throw) on a contract that fails schema validation", async () => {
  const f = fakeFetch({ data: { formId: "x", notAContract: true } });
  const out = await getFormDefinition("test-form", { fetchImpl: f.impl });
  assert.equal(out, null);
});

test("returns null on a non-ok HTTP status", async () => {
  const f = fakeFetch({ data: VALID }, false);
  assert.equal(
    await getFormDefinition("test-form", { fetchImpl: f.impl }),
    null,
  );
});

test("returns null when fetch throws", async () => {
  const impl = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  assert.equal(await getFormDefinition("test-form", { fetchImpl: impl }), null);
});

test("caches a hit — a second call within TTL does not re-fetch", async () => {
  const f = fakeFetch({ data: VALID });
  await getFormDefinition("test-form", { fetchImpl: f.impl });
  await getFormDefinition("test-form", { fetchImpl: f.impl });
  assert.equal(f.calls(), 1);
});

test("returns null without fetching when FORM_API_URL is unset", async () => {
  delete process.env.FORM_API_URL;
  const f = fakeFetch({ data: VALID });
  const out = await getFormDefinition("test-form", { fetchImpl: f.impl });
  assert.equal(out, null);
  assert.equal(f.calls(), 0);
});
