import { expect, test } from "vitest";
import type { SerializedEditorState } from "lexical";
import { DraftStore, initialDraft } from "./draft-store";
import {
  SourceError,
  type DraftCodec,
  type DraftConnection,
  type DraftKeys,
  type InitialDraft,
} from "./types";

const state = (source: string): SerializedEditorState & { source: string } => ({
  source,
  root: { type: "root", version: 1, children: [], direction: null, format: "", indent: 0 },
});

const codec: DraftCodec = {
  prepare: (source) => ({ state: state(source), source, diagnostics: [] }),
  encode: (value) => {
    if (!("source" in value) || typeof value.source !== "string")
      throw Error("Missing test document source");

    return value.source;
  },
  prepareLegacy: () => {
    throw Error("This host does not accept legacy documents");
  },
};

const keys = (name: string) => ({
  committed: `${name}:saved`,
  working: `${name}:working`,
  previous: `${name}:old`,
  legacy: `${name}:legacy`,
});

const initial = (source: string): InitialDraft => ({
  state: state(source),
  observed: source,
  working: null,
  needsSave: false,
  snapshot: {
    mode: "visual",
    source,
    committed: source,
    dirty: false,
    valid: true,
    status: "saved",
    diagnostics: [],
  },
});

function memory(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed)),
    operations: string[] = [];

  return {
    values,
    operations,
    getItem: (key: string) => {
      operations.push(`read:${key}`);

      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      operations.push(`write:${key}`);
      values.set(key, value);
    },
    removeItem: (key: string) => {
      operations.push(`remove:${key}`);
      values.delete(key);
    },
  };
}

test("two stores share storage without sharing keys, working buffers or conflicts", () => {
  const firstKeys = keys("first"),
    originalKeys = { ...firstKeys },
    secondKeys = keys("second");

  const storage = memory({
    [firstKeys.committed]: "First saved",
    [secondKeys.committed]: "Second saved",
  });

  const first = new DraftStore(storage, initial("First saved"), codec, firstKeys);
  const second = new DraftStore(storage, initial("Second saved"), codec, secondKeys);
  // A caller retaining its configuration cannot redirect an already connected draft.
  firstKeys.committed = secondKeys.committed;
  firstKeys.working = secondKeys.working;
  first.edit("First unapplied source");
  second.externalChange(originalKeys.working);
  second.externalChange(null);
  expect(second.getSnapshot().conflict).toBeUndefined();
  expect(storage.values.get(originalKeys.working)).toBe("First unapplied source");
  expect(storage.values.has(secondKeys.working)).toBe(false);
  storage.setItem(originalKeys.committed, "First competing source");
  first.externalChange(originalKeys.committed);
  second.externalChange(originalKeys.committed);
  expect(first.getSnapshot().conflict?.source).toBe("First competing source");
  expect(second.getSnapshot().status).toBe("saved");
  second.canvasChanged(state("Second canvas edit"));
  second.flush();
  expect(storage.values.get(secondKeys.committed)).toBe("Second canvas edit");
  expect(storage.values.get(originalKeys.committed)).toBe("First competing source");
  first.useLocal();
  first.apply();
  expect(storage.values.get(originalKeys.committed)).toBe("First unapplied source");
  expect(storage.values.get(secondKeys.committed)).toBe("Second canvas edit");
  expect(storage.values.has(originalKeys.working)).toBe(false);
});

test("Apply parses before competing-tab reads or writes and a parse failure preserves both saved bytes and working source", () => {
  const configured = keys("parse"),
    storage = memory({ [configured.committed]: "Saved" });

  const store = new DraftStore(storage, initial("Saved"), codec, configured);

  const connection: DraftConnection = {
    prepare: () => {
      storage.operations.push("parse");
      throw Error("Unsupported editor node");
    },
    getState: () => state("Saved"),
    setEditable: () => {},
    subscribe: () => () => {},
  };

  const disconnect = store.connect(connection);
  store.edit("Valid source with an unsupported editor node");
  storage.operations.length = 0;
  expect(store.apply()).toBe(false);
  expect(storage.operations).toEqual(["parse"]);
  expect(storage.values.get(configured.committed)).toBe("Saved");
  expect(storage.values.get(configured.working)).toBe(
    "Valid source with an unsupported editor node",
  );
  expect(store.getSnapshot().dirty).toBe(true);
  expect(store.getSnapshot().error).toContain("Unsupported editor node");
  disconnect();
});

test("Apply parses once, writes before replacement, and suppresses its own editor update", () => {
  const configured = keys("apply"),
    storage = memory({ [configured.committed]: "Saved" });

  const store = new DraftStore(storage, initial("Saved"), codec, configured);

  let listener: ((value: SerializedEditorState) => void) | undefined,
    parses = 0,
    applies = 0;

  const disconnect = store.connect({
    prepare: (value) => {
      parses++;
      storage.operations.push("parse");

      return () => {
        applies++;
        storage.operations.push("apply");
        listener?.(value);
      };
    },
    getState: () => state("Saved"),
    setEditable: () => {},
    subscribe: (next) => {
      listener = next;

      return () => {
        listener = undefined;
      };
    },
  });

  store.edit("New source");
  storage.operations.length = 0;
  expect(store.apply()).toBe(true);
  expect(storage.operations.slice(0, 5)).toEqual([
    "parse",
    `read:${configured.committed}`,
    `read:${configured.working}`,
    `write:${configured.committed}`,
    "apply",
  ]);
  expect(parses).toBe(1);
  expect(applies).toBe(1);
  expect(store.getSnapshot().status).toBe("saved");
  expect(storage.values.get(configured.committed)).toBe("New source");
  expect(storage.values.has(configured.working)).toBe(false);
  expect(store.apply()).toBe(true);
  expect(parses).toBe(2);
  expect(applies).toBe(1);
  disconnect();
});

test("a successful parse followed by a failed write never applies the prepared editor state", () => {
  const configured = keys("failed-write"),
    storage = memory({ [configured.committed]: "Saved" });

  let fail = false,
    applied = 0;

  const store = new DraftStore(
    {
      ...storage,
      setItem(key, value) {
        if (fail) throw Error("Storage is full");
        storage.setItem(key, value);
      },
    },
    initial("Saved"),
    codec,
    configured,
  );

  const disconnect = store.connect({
    prepare: () => () => {
      applied++;
    },
    getState: () => state("Saved"),
    setEditable: () => {},
    subscribe: () => () => {},
  });

  store.edit("New source");
  fail = true;
  expect(store.apply()).toBe(false);
  expect(applied).toBe(0);
  expect(storage.values.get(configured.committed)).toBe("Saved");
  expect(storage.values.get(configured.working)).toBe("New source");
  disconnect();
});

test("legacy recovery uses the injected host decoder and retains original bytes and diagnostics", () => {
  const configured: DraftKeys = keys("custom");

  const original = '{ "customDocument": "unchanged" }\n',
    storage = memory({
      [configured.legacy]: original,
      [configured.working]: "Unfinished source\n",
    });

  const diagnostics = [
    {
      code: "custom-capability",
      severity: "fatal" as const,
      message: "Missing custom capability",
      line: 3,
      column: 4,
    },
  ];

  let received: unknown;

  const customCodec = {
    ...codec,
    prepareLegacy(value: unknown): SerializedEditorState {
      received = value;
      throw new SourceError("Cannot load custom draft", diagnostics);
    },
  };

  const loaded = initialDraft(
    storage,
    () => {
      throw Error("Must not substitute a demo");
    },
    customCodec,
    configured,
  );

  expect(received).toEqual({ customDocument: "unchanged" });
  expect(loaded.snapshot.recovery).toEqual({ kind: "legacy", original });
  expect(loaded.snapshot.source).toBe("Unfinished source\n");
  expect(loaded.snapshot.diagnostics).toBe(diagnostics);
  expect(storage.values.get(configured.legacy)).toBe(original);
  expect(storage.values.has(configured.committed)).toBe(false);
});

test("disconnect flushes pending work and stops the editor subscription", () => {
  const configured = keys("disconnect"),
    storage = memory({ [configured.committed]: "Saved" });

  const store = new DraftStore(storage, initial("Saved"), codec, configured);

  let listener: ((value: SerializedEditorState) => void) | undefined,
    removed = 0;

  const disconnect = store.connect({
    prepare: () => () => {},
    getState: () => state("Saved"),
    setEditable: () => {},
    subscribe: (next) => {
      listener = next;

      return () => {
        listener = undefined;
        removed++;
      };
    },
  });

  listener?.(state("Pending content"));
  expect(store.getSnapshot().status).toBe("saving");
  disconnect();
  expect(removed).toBe(1);
  expect(listener).toBeUndefined();
  expect(storage.values.get(configured.committed)).toBe("Pending content");
  expect(store.getSnapshot().status).toBe("saved");
});
