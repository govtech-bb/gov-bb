import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { UIMessage } from "@tanstack/ai";
import {
  conversationPersistence,
  loadCitationSidecar,
  saveCitationSidecar,
} from "./persistence.ts";

// Minimal sessionStorage stub on globalThis.window so the adapter's `hasWindow()`
// guard passes and reads/writes hit an in-memory map.
function installWindow(store = new Map<string, string>()) {
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test("messages round-trip and revive createdAt as a Date", () => {
  installWindow();
  const messages = [
    { id: "m1", role: "user", parts: [], createdAt: new Date("2026-01-01") },
  ] as unknown as UIMessage[];
  conversationPersistence.setItem("conversation", messages);
  const out = conversationPersistence.getItem("conversation");
  assert.equal(out?.length, 1);
  assert.ok(out![0].createdAt instanceof Date);
  assert.equal(
    (out![0].createdAt as Date).toISOString(),
    "2026-01-01T00:00:00.000Z",
  );
});

test("getItem returns null when nothing is stored or no window", () => {
  installWindow();
  assert.equal(conversationPersistence.getItem("conversation"), null);
  delete (globalThis as { window?: unknown }).window;
  assert.equal(conversationPersistence.getItem("conversation"), null);
});

test("removeItem clears both messages and the citation sidecar", () => {
  const store = installWindow();
  conversationPersistence.setItem("conversation", [] as UIMessage[]);
  saveCitationSidecar({ citations: { m1: [] }, linkTokens: {} });
  assert.equal(store.size, 2);
  conversationPersistence.removeItem("conversation");
  assert.equal(store.size, 0);
});

test("citation sidecar round-trips citations + link tokens", () => {
  installWindow();
  const cite = { number: "1", url: "https://x", title: "T" };
  saveCitationSidecar({
    citations: { m1: [cite] as never },
    linkTokens: { m1: { link_1: "https://y" } },
  });
  const out = loadCitationSidecar();
  assert.deepEqual(out.citations.m1, [cite]);
  assert.equal(out.linkTokens.m1.link_1, "https://y");
});

test("sidecar loads empty (not throwing) on malformed JSON", () => {
  const store = installWindow();
  store.set("gov-chat:citations", "{not json");
  assert.deepEqual(loadCitationSidecar(), {
    citations: {},
    linkTokens: {},
  });
});

test("a throwing store is swallowed (best-effort)", () => {
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    },
  };
  assert.doesNotThrow(() =>
    conversationPersistence.setItem("c", [] as UIMessage[]),
  );
  assert.equal(conversationPersistence.getItem("c"), null);
  assert.deepEqual(loadCitationSidecar(), {
    citations: {},
    linkTokens: {},
  });
});
