import assert from "node:assert/strict";
import { test } from "node:test";
import type { Citation } from "#/lib/rag/types";
import { citationsMiddleware } from "./citations.ts";

const ctx = {} as never;
const cite: Citation = {
  number: "1",
  url: "https://alpha.gov.bb/passport#:~:text=foo",
  title: "Renew your passport",
  section: "Eligibility",
};
const onChunk = (mw: ReturnType<typeof citationsMiddleware>) => mw.onChunk!;

test("injects a citations CUSTOM event right after TEXT_MESSAGE_START", () => {
  const mw = citationsMiddleware([cite], { link_1: "https://alpha.gov.bb/x" });
  const start = { type: "TEXT_MESSAGE_START", messageId: "m1" } as never;
  const out = onChunk(mw)(ctx, start) as unknown as Array<
    Record<string, unknown>
  >;
  assert.equal(out.length, 2);
  assert.equal(out[0], start);
  assert.equal(out[1].type, "CUSTOM");
  assert.equal(out[1].name, "citations");
  const value = out[1].value as {
    messageId: string;
    citations: Citation[];
    linkTokens: Record<string, string>;
  };
  assert.equal(value.messageId, "m1");
  assert.equal(value.citations.length, 1);
  assert.equal(value.linkTokens.link_1, "https://alpha.gov.bb/x");
});

test("emits only once, then passes later chunks through untouched", () => {
  const mw = citationsMiddleware([cite]);
  onChunk(mw)(ctx, { type: "TEXT_MESSAGE_START", messageId: "m1" } as never);
  const again = onChunk(mw)(ctx, {
    type: "TEXT_MESSAGE_START",
    messageId: "m2",
  } as never);
  assert.equal(again, undefined); // no re-inject
});

test("does not emit on RUN_FINISHED when no text (and thus no messageId) arrived", () => {
  const mw = citationsMiddleware([cite]);
  const out = onChunk(mw)(ctx, { type: "RUN_FINISHED" } as never);
  assert.equal(out, undefined);
});

test("no-op when there are no citations", () => {
  const mw = citationsMiddleware([]);
  const out = onChunk(mw)(ctx, {
    type: "TEXT_MESSAGE_START",
    messageId: "m1",
  } as never);
  assert.equal(out, undefined);
});
