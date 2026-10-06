import { expect, test } from "vitest";
import type { SerializedEditorState } from "lexical";
import { DraftStore, initialDraft } from "./draft-store";
import { SourceError, type DraftCodec, type DraftKeys } from "./types";

const state = (text: string): SerializedEditorState => ({
  root: {
    type: "root",
    version: 1,
    children: [{ type: text, version: 1 }],
    direction: null,
    format: "",
    indent: 0,
  },
});

const codec: DraftCodec = {
  prepare(source) {
    if (source.startsWith("invalid:"))
      throw new SourceError("Invalid source", [
        { code: "syntax", severity: "fatal", message: "Invalid source", line: 1, column: 1 },
      ]);

    if (source.startsWith("source:"))
      return {
        mode: "source",
        source,
        diagnostics: [
          {
            code: "source-only",
            severity: "warning",
            message: "This component is edited in source mode",
            line: 1,
            column: 1,
          },
        ],
      };

    return { state: state(source), source, diagnostics: [] };
  },
  encode: (value) => value.root.children[0]!.type,
  prepareLegacy: () => {
    throw Error("No legacy format for this document");
  },
};

function host(source: string, journal = true, working?: string) {
  const keys: DraftKeys = {
    committed: "saved",
    working: "working",
    previous: "previous",
    legacy: "legacy",
    replacementJournal: journal ? "replacement" : undefined,
  };

  const values = new Map([[keys.committed, source]]);

  if (working !== undefined) values.set(keys.working, working);
  let failure: string | undefined;

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === failure) throw Error("Storage unavailable");
      values.set(key, value);
    },
    removeItem: (key: string) => {
      if (key === failure) throw Error("Storage unavailable");
      values.delete(key);
    },
  };

  const load = () => initialDraft(storage, () => state("New"), codec, keys);
  const store = new DraftStore(storage, load(), codec, keys);

  return {
    store,
    values,
    load,
    fail: (key?: string) => {
      failure = key;
    },
  };
}

function connect(store: DraftStore) {
  let current = store.getSnapshot().state ?? state("Stale canvas"),
    editable = true,
    applies = 0;

  const disconnect = store.connect({
    prepare: (value) => () => {
      current = value;
      applies++;
      store.canvasChanged(value);
    },
    getState: () => current,
    setEditable: (value) => {
      editable = value;
    },
    subscribe: () => () => {},
  });

  return {
    disconnect,
    current: () => codec.encode(current),
    editable: () => editable,
    applies: () => applies,
  };
}

for (const journal of [false, true]) {
  test(`source-only Apply saves exact bytes without an editor (${journal ? "journaled" : "direct"})`, () => {
    const { store, values, load } = host("source:<component />\n", journal);
    expect(store.getSnapshot()).toMatchObject({ mode: "source", valid: true, status: "saved" });
    expect(store.getSnapshot().state).toBeUndefined();
    expect(store.getSnapshot().recovery).toBeUndefined();
    const edited = "source:<component value='edited' />\n\n";
    store.edit(edited);
    expect(store.apply()).toBe(true);
    expect(values.get("saved")).toBe(edited);
    expect(values.has("working")).toBe(false);
    expect(values.has("replacement")).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ mode: "source", dirty: false, status: "saved" });
    expect(load().snapshot.source).toBe(edited);
    expect(load().snapshot.diagnostics[0]?.severity).toBe("warning");
  });

  test(`mode switches cannot autosave the stale canvas (${journal ? "journaled" : "direct"})`, () => {
    const { store, values } = host("Original visual", journal);
    const editor = connect(store);
    store.edit("source:Unsupported component");
    expect(store.apply()).toBe(true);
    expect(editor.applies()).toBe(0);
    expect(editor.editable()).toBe(false);
    store.canvasChanged(state("Stale visual update"));
    store.flush();
    expect(values.get("saved")).toBe("source:Unsupported component");
    expect(store.getSnapshot().state).toBeUndefined();
    store.edit("Back to visual");
    expect(store.apply()).toBe(true);
    expect(editor.current()).toBe("Back to visual");
    expect(editor.applies()).toBe(1);
    expect(editor.editable()).toBe(true);
    expect(store.getSnapshot().mode).toBe("visual");
    expect(codec.encode(store.getSnapshot().state!)).toBe("Back to visual");
    editor.disconnect();
  });
}

test("source-only syntax failures keep the committed document and exact working buffer", () => {
  const { store, values, load } = host("source:Original", true);
  store.edit("invalid:\n  broken syntax\n");
  expect(store.apply()).toBe(false);
  expect(values.get("saved")).toBe("source:Original");
  expect(values.get("working")).toBe("invalid:\n  broken syntax\n");
  expect(store.getSnapshot()).toMatchObject({ mode: "source", valid: true, dirty: true });
  expect(load().snapshot.source).toBe("invalid:\n  broken syntax\n");
  store.discard();
  expect(store.getSnapshot().source).toBe("source:Original");
  expect(values.has("working")).toBe(false);
});

test("a detached source document prepares the current visual state for its next mount", () => {
  const { store, values } = host("source:Initial");
  store.edit("New visual document");
  expect(store.apply()).toBe(true);
  expect(store.initial.state).toBeUndefined();
  const editor = connect(store);
  expect(editor.current()).toBe("New visual document");
  expect(editor.applies()).toBe(0);
  store.canvasChanged(state("Edited visual document"));
  expect(codec.encode(store.getSnapshot().state!)).toBe("Edited visual document");
  editor.disconnect();
  expect(values.get("saved")).toBe("Edited visual document");
});

test("source-only replacement write failures preserve both versions and recover without an editor", () => {
  const { store, values, fail, load } = host("source:Original");
  store.edit("source:Candidate");
  fail("saved");
  expect(store.apply()).toBe(false);
  expect(values.get("saved")).toBe("source:Original");
  expect(values.get("working")).toBe("source:Candidate");
  expect(load().snapshot.replacement?.phase).toBe("uncommitted");
  fail();
  expect(store.recoverReplacement("candidate").status).toBe("committed");
  expect(values.get("saved")).toBe("source:Candidate");
  expect(values.has("replacement")).toBe(false);
  expect(store.getSnapshot().mode).toBe("source");
});

test("source-only cleanup failure can restore a visual original with no mounted editor", () => {
  const { store, values, fail } = host("Original visual");
  fail("replacement");
  store.edit("source:Candidate");
  expect(store.apply()).toBe(false);
  expect(store.getSnapshot().error).toContain("Storage unavailable");
  fail("working");
  expect(store.apply()).toBe(true);
  expect(store.getSnapshot().replacement?.phase).toBe("cleanup");
  expect(values.get("saved")).toBe("source:Candidate");
  fail();
  expect(store.recoverReplacement("original").status).toBe("committed");
  expect(values.get("saved")).toBe("Original visual");
  expect(store.getSnapshot().mode).toBe("visual");
  expect(codec.encode(store.getSnapshot().state!)).toBe("Original visual");
  expect(store.getSnapshot().source).toBe("source:Candidate");
  expect(store.getSnapshot().dirty).toBe(true);
});

test("source-only drafts resolve competing tabs without overwriting unapplied local work", () => {
  const { store, values } = host("source:Original");
  store.edit("source:Local changes");
  values.set("saved", "Other tab visual");
  store.externalChange("saved");
  expect(store.apply()).toBe(false);
  expect(values.get("saved")).toBe("Other tab visual");
  values.delete("working");
  expect(store.useExternal()).toBe(true);
  expect(store.getSnapshot().previous).toBe("source:Local changes");
  expect(store.getSnapshot().mode).toBe("visual");
  expect(codec.encode(store.getSnapshot().state!)).toBe("Other tab visual");
});

test("an absent external record keeps the current canvas and can restore pending work", () => {
  const { store, values, load } = host("Original");
  const editor = connect(store);
  store.canvasChanged(state("Latest local canvas"));
  const current = store.getSnapshot();
  values.delete("saved");
  store.externalChange("saved");
  expect(store.useExternal()).toBe(false);
  expect(store.getSnapshot()).toMatchObject({
    source: "Latest local canvas",
    committed: "Latest local canvas",
    status: "conflict",
    conflict: { source: null, working: null },
  });
  expect(store.getSnapshot().state).toBe(current.state);
  expect(store.getSnapshot().error).toContain("saved version was removed");
  expect(editor.applies()).toBe(0);
  expect(editor.editable()).toBe(false);
  store.flush();
  expect(values.has("saved")).toBe(false);
  store.useLocal();
  expect(values.get("saved")).toBe("Latest local canvas");
  expect(store.getSnapshot().status).toBe("saved");
  expect(load().snapshot.source).toBe("Latest local canvas");
  editor.disconnect();
});

test("a missing saved record leaves both tabs' working sources and previous recovery intact", () => {
  const { store, values, load } = host("source:Original");
  values.set("saved", "source:Second version");
  store.externalChange("saved");
  expect(store.useExternal()).toBe(true);
  store.edit("source:Unapplied local changes\n");
  values.delete("saved");
  values.set("working", "source:Unapplied remote changes\n");
  store.externalChange("saved");
  expect(store.useExternal()).toBe(false);
  expect(store.getSnapshot()).toMatchObject({
    source: "source:Unapplied local changes\n",
    committed: "source:Second version",
    dirty: true,
    mode: "source",
    previous: "source:Original",
    conflict: { source: null, working: "source:Unapplied remote changes\n" },
  });
  expect(values.get("working")).toBe("source:Unapplied remote changes\n");
  expect(values.has("saved")).toBe(false);
  expect(load().snapshot.source).toBe("source:Unapplied remote changes\n");
  store.useLocal();
  expect(values.get("working")).toBe("source:Unapplied local changes\n");
  expect(store.apply()).toBe(true);
  expect(load().snapshot.source).toBe("source:Unapplied local changes\n");
  expect(values.has("working")).toBe(false);
});

test("a later external write can be loaded after a removed version was refused", () => {
  const { store, values } = host("source:Current original");
  values.delete("saved");
  store.externalChange("saved");
  expect(store.useExternal()).toBe(false);
  values.set("saved", "source:New competing version");
  values.set("working", "source:New competing buffer");
  expect(store.useExternal()).toBe(true);
  expect(store.getSnapshot()).toMatchObject({
    source: "source:New competing buffer",
    committed: "source:New competing version",
    previous: "source:Current original",
    dirty: true,
    status: "source",
  });
  expect(values.get("saved")).toBe("source:New competing version");
  expect(values.get("working")).toBe("source:New competing buffer");
});

test("an explicitly empty external document remains distinct from a missing record", () => {
  const { store, values, load } = host("Original");
  values.set("saved", "");
  store.externalChange("saved");
  expect(store.useExternal()).toBe(true);
  expect(store.getSnapshot()).toMatchObject({
    source: "",
    committed: "",
    status: "saved",
    previous: "Original",
  });
  expect(load().snapshot.source).toBe("");
});

test("initial saving and restored source buffers do not require a Lexical connection", () => {
  const values = new Map([["previous", "source:Recovered"]]);

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  const keys = { committed: "saved", working: "working", previous: "previous", legacy: "legacy" };
  const initial = initialDraft(storage, () => state("New"), codec, keys);
  const store = new DraftStore(storage, initial, codec, keys);
  store.start();
  expect(store.getSnapshot()).toMatchObject({ mode: "source", status: "saved" });
  expect(values.get("saved")).toBe("source:Recovered");
  const dirty = host("source:Original", true, "");
  dirty.store.start();
  expect(dirty.store.getSnapshot()).toMatchObject({ dirty: true, source: "", status: "source" });
  expect(dirty.values.get("saved")).toBe("source:Original");
  expect(dirty.values.get("working")).toBe("");
});
