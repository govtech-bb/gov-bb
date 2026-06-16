import assert from "node:assert/strict";
import { test } from "node:test";
import type { Features } from "#/config/features";
import { buildChatTools } from "./index.ts";

const features = (over: Partial<Features> = {}): Features => ({
  forms: false,
  feedback: false,
  offers: false,
  ...over,
});

test("no tools when no in-chat form feature is on (handoff is deterministic)", () => {
  assert.deepEqual(buildChatTools(features()), []);
});

test("offers alone registers the presentChoices offer tool", () => {
  const tools = buildChatTools(features({ offers: true }));
  assert.deepEqual(
    tools.map((t) => (t as { name?: string }).name),
    ["presentChoices"],
  );
});

test("offers + forms registers the collection tools plus presentChoices", () => {
  const tools = buildChatTools(features({ forms: true, offers: true }));
  assert.deepEqual(
    tools.map((t) => (t as { name?: string }).name),
    [
      "getFormDefinition",
      "presentField",
      "setField",
      "submitForm",
      "presentChoices",
    ],
  );
});

test("feedback alone also enables the collection tools (for chat-feedback)", () => {
  const tools = buildChatTools(features({ feedback: true }));
  assert.deepEqual(
    tools.map((t) => (t as { name?: string }).name),
    ["getFormDefinition", "presentField", "setField", "submitForm"],
  );
});

test("features.forms registers the collection tools (lookup → present → set → submit)", () => {
  const tools = buildChatTools(features({ forms: true }));
  assert.deepEqual(
    tools.map((t) => (t as { name?: string }).name),
    ["getFormDefinition", "presentField", "setField", "submitForm"],
  );
});
