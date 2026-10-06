import { readFile } from "node:fs/promises";
import { serializedNodes } from "../helpers/serialized-test-data";
import { expect, test } from "vitest";
import { createEditor, type SerializedEditorState } from "lexical";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { DraftStore, initialDraft as readInitialDraft } from "../../src/persistence/draft-store";
import {
  SourceError,
  type DraftCodec,
  type DraftStorage,
  type InitialDraft,
} from "../../src/persistence/types";
import {
  LEGACY_KEY,
  MARKDOWN_KEY,
  PREVIOUS_MARKDOWN_KEY,
  WORKING_KEY,
  govbbDraftKeys,
} from "../../src/host/govbb-draft";
import { govbbFormCodec, govbbFormRuntime } from "../../src/presets/govbb-form";
import { draftEditorConnection } from "../../src/host/draft-editor";
import { readMarkdown, writeMarkdown, toEditor } from "../helpers/default-form";

const prepareSource = govbbFormCodec.prepare;

const initialDraft = (
  storage: DraftStorage,
  createDemo: () => void,
  codec: DraftCodec = govbbFormCodec,
) =>
  readInitialDraft(
    storage,
    () => govbbFormRuntime.prepare(undefined, createDemo, "legacy"),
    codec,
    govbbDraftKeys,
  );

function memory(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));
  let fail = false;

  return {
    entries,
    setFail: (next: boolean) => {
      fail = next;
    },
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error("Storage is full");
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      if (fail) throw new Error("Storage is full");
      entries.delete(key);
    },
  };
}

const state = (source: string): SerializedEditorState => {
  const paragraph = {
    type: "paragraph",
    version: 1,
    children: [
      { type: "text", version: 1, text: source, format: 0, detail: 0, mode: "normal", style: "" },
    ],
    format: "",
    indent: 0,
    direction: null,
  };

  return {
    root: {
      type: "root",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      children: [paragraph],
    },
  };
};

const codec: DraftCodec = {
  prepareLegacy: (value) => createEditor().parseEditorState(JSON.stringify(value)).toJSON(),
  encode: (value) => serializedNodes(value)[0]?.children?.[0]?.text ?? "",
  prepare: (source) => {
    if (source.startsWith("bad"))
      throw new SourceError("Invalid source", [
        { code: "syntax", message: "Fix the source", severity: "fatal", line: 2, column: 3 },
      ]);

    return { state: state(source.trim()), source: source.trim(), diagnostics: [] };
  },
};

const initial = (source = "saved"): InitialDraft => ({
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

const createStore = () => {
  const storage = memory({ [MARKDOWN_KEY]: "saved" });

  return { storage, store: new DraftStore(storage, initial(), codec, govbbDraftKeys) };
};

const versionOne =
  "---\nformat: govbb-form\nformatVersion: 1\ntitle: Original\n---\n\n# Page\n\n::multiple-choice[Continue?]{#continue}\n- Yes\n\n  ::text[Details]{#details}\n\n- No\n";

function editorDouble() {
  let replacements = 0;
  const editor = createEditor();
  const setEditorState = editor.setEditorState.bind(editor);
  editor.setEditorState = (...args) => {
    replacements++;
    setEditorState(...args);
  };

  return {
    editor: draftEditorConnection(editor),
    replacements: () => replacements,
    editable: () => editor.isEditable(),
  };
}

test("a new browser creates valid Markdown; a legacy migration keeps its original bytes", () => {
  const freshStorage = memory();
  const fresh = initialDraft(freshStorage, $demo);
  expect(fresh.snapshot.error).toBeUndefined();
  expect(fresh.snapshot.valid).toBe(true);
  expect(fresh.needsSave).toBe(true);
  expect(fresh.snapshot.source).toContain("formatVersion: 2");
  const legacy = JSON.stringify(fresh.state);
  const storage = memory({ [LEGACY_KEY]: legacy });

  const migrated = initialDraft(storage, () => {
    throw new Error("Demo should not load");
  });

  expect(migrated.snapshot.error).toBeUndefined();
  expect(migrated.snapshot.valid).toBe(true);
  const store = new DraftStore(storage, migrated, govbbFormCodec, govbbDraftKeys);
  const editor = editorDouble();
  store.connect(editor.editor);
  expect(storage.getItem(MARKDOWN_KEY)).toBe(migrated.snapshot.source);
  expect(storage.getItem(LEGACY_KEY)).toBe(legacy);
});

test("existing empty, malformed and future Markdown takes precedence and never overwrites recovery bytes", () => {
  for (const source of [
    "",
    "not Markdown",
    "---\nformat: govbb-form\nformatVersion: 999\ntitle: Future\n---\n# Page\n",
  ]) {
    const storage = memory({ [MARKDOWN_KEY]: source, [LEGACY_KEY]: '{"old":"data"}' });

    const loaded = initialDraft(storage, () => {
      throw new Error("Demo should not load");
    });

    expect(loaded.snapshot.valid).toBe(false);
    expect(loaded.snapshot.source).toBe(source);
    expect(loaded.snapshot.recovery!.original).toBe(source);
    expect(storage.getItem(MARKDOWN_KEY)).toBe(source);
    expect(storage.getItem(LEGACY_KEY)).toBe('{"old":"data"}');
  }
});

test("malformed legacy and unavailable storage open recovery without silently loading a demo", () => {
  const storage = memory({ [LEGACY_KEY]: "{unfinished" });

  const loaded = initialDraft(storage, () => {
    throw new Error("Demo should not load");
  });

  expect(loaded.snapshot.source).toBe("{unfinished");
  expect(loaded.snapshot.recovery?.kind).toBe("legacy");
  expect(loaded.needsSave).toBe(false);

  const blocked: DraftStorage = {
    getItem: () => {
      throw new Error("Storage blocked");
    },
    setItem: () => {},
    removeItem: () => {},
  };

  expect(initialDraft(blocked, () => {}).snapshot.error).toBe("Storage blocked");
});

test("dirty source survives startup exactly and cannot autosave over its committed canvas", () => {
  const storage = memory({ [MARKDOWN_KEY]: "saved", [WORKING_KEY]: "bad edits\n" });
  const loaded = initialDraft(storage, () => {}, codec);
  expect(loaded.snapshot.dirty).toBe(true);
  expect(loaded.snapshot.source).toBe("bad edits\n");

  const store = new DraftStore(storage, loaded, codec, govbbDraftKeys),
    editor = editorDouble();

  store.connect(editor.editor);
  expect(editor.editable()).toBe(false);
  store.canvasChanged(state("canvas"));
  store.flush();
  expect(storage.getItem(MARKDOWN_KEY)).toBe("saved");
});

test("source editing flushes pending canvas work, cancels stale timers and Discard restores it", () => {
  const { storage, store } = createStore();
  store.canvasChanged(state("latest canvas"));
  store.edit("source edits");
  expect(storage.getItem(MARKDOWN_KEY)).toBe("latest canvas");
  expect(storage.getItem(WORKING_KEY)).toBe("source edits");
  store.canvasChanged(state("stale"));
  store.flush();
  expect(storage.getItem(MARKDOWN_KEY)).toBe("latest canvas");
  store.discard();
  expect(store.getSnapshot().source).toBe("latest canvas");
  expect(storage.getItem(WORKING_KEY)).toBeNull();
});

test("invalid Apply is atomic, successful Apply replaces once and no-op Apply creates no history", () => {
  const { storage, store } = createStore(),
    editor = editorDouble();

  store.connect(editor.editor);
  expect(store.apply()).toBe(true);
  expect(editor.replacements()).toBe(0);
  store.edit("bad edits");
  expect(store.apply()).toBe(false);
  expect(editor.replacements()).toBe(0);
  expect(storage.getItem(MARKDOWN_KEY)).toBe("saved");
  expect(store.getSnapshot().diagnostics[0]!.line).toBe(2);
  store.edit("new source ");
  expect(store.apply()).toBe(true);
  expect(editor.replacements()).toBe(1);
  expect(storage.getItem(MARKDOWN_KEY)).toBe("new source");
  expect(storage.getItem(WORKING_KEY)).toBeNull();
  expect(editor.editable()).toBe(true);
  expect(store.apply()).toBe(true);
  expect(editor.replacements()).toBe(1);
});

test("quota errors keep unsaved work and Saved appears only after a successful retry", () => {
  const { storage, store } = createStore();
  storage.setFail(true);
  store.canvasChanged(state("latest"));
  store.flush();
  expect(store.getSnapshot().status).toBe("error");
  expect(store.getSnapshot().source).toBe("latest");
  expect(storage.getItem(MARKDOWN_KEY)).toBe("saved");
  storage.setFail(false);
  store.retry();
  expect(storage.getItem(MARKDOWN_KEY)).toBe("latest");
  expect(store.getSnapshot().status).toBe("saved");
});

test("another tab pauses pending writes and both versions stay available until an explicit choice", () => {
  const { storage, store } = createStore(),
    editor = editorDouble();

  store.connect(editor.editor);
  store.canvasChanged(state("my latest"));
  storage.setItem(MARKDOWN_KEY, "other latest");
  store.externalChange(MARKDOWN_KEY);
  store.flush();
  expect(store.getSnapshot().status).toBe("conflict");
  expect(store.getSnapshot().source).toBe("my latest");
  expect(storage.getItem(MARKDOWN_KEY)).toBe("other latest");
  expect(editor.editable()).toBe(false);
  store.useLocal();
  expect(storage.getItem(MARKDOWN_KEY)).toBe("my latest");
  expect(editor.editable()).toBe(true);
  storage.setItem(MARKDOWN_KEY, "their next");
  store.externalChange(MARKDOWN_KEY);
  expect(store.useExternal()).toBe(true);
  expect(store.getSnapshot().source).toBe("their next");
  expect(store.getSnapshot().previous).toBe("my latest");
});

test("a write catches a competing change even before the storage event is delivered", () => {
  const { storage, store } = createStore();
  store.canvasChanged(state("mine"));
  storage.setItem(MARKDOWN_KEY, "theirs");
  store.flush();
  expect(store.getSnapshot().status).toBe("conflict");
  expect(storage.getItem(MARKDOWN_KEY)).toBe("theirs");
});

test("legacy page names migrate without being treated as unsupported source", () => {
  const fresh = initialDraft(memory(), $demo);

  const legacy = structuredClone(fresh.state!);
  const nodes = serializedNodes(legacy);

  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]!;

    if (node.type !== "page-title") continue;
    const start = nodes[index - 1]!;

    if (start.type === "widget") {
      start.$ ??= {};
      start.$.settings ??= {};
      start.$.settings.name = node
        .children!.map((child: { text?: string }) => child.text ?? "")
        .join("");
    }

    nodes.splice(index, 1);
  }

  const bytes = JSON.stringify(legacy);
  const storage = memory({ [LEGACY_KEY]: bytes });

  const migrated = initialDraft(storage, () => {
    throw new Error("Demo should not load");
  });

  expect(migrated.snapshot.error).toBeUndefined();
  expect(migrated.snapshot.valid).toBe(true);
  expect(migrated.snapshot.source).toContain("# Road closure");
  expect(storage.getItem(LEGACY_KEY)).toBe(bytes);
});

test("retry cannot claim Saved after a canvas serialization failure", () => {
  const storage = memory({ [MARKDOWN_KEY]: "saved" });
  let fail = true;

  const failingCodec: DraftCodec = {
    ...codec,
    encode: (value) => {
      if (codec.encode(value) === "unsupported" && fail) throw new Error("Unsupported node");

      return codec.encode(value);
    },
  };

  const store = new DraftStore(storage, initial(), failingCodec, govbbDraftKeys);
  store.canvasChanged(state("unsupported"));
  store.retry();
  expect(store.getSnapshot().status).toBe("error");
  expect(store.getSnapshot().recovery?.kind).toBe("canvas");
  expect(storage.getItem(MARKDOWN_KEY)).toBe("saved");
  fail = false;
  store.retry();
  expect(store.getSnapshot().status).toBe("saved");
  expect(storage.getItem(MARKDOWN_KEY)).toBe("unsupported");
});

test("keeping a clean local version also removes another tab's source buffer", () => {
  const { storage, store } = createStore();
  storage.setItem(WORKING_KEY, "other source edits");
  store.externalChange(WORKING_KEY);
  store.useLocal();
  expect(store.getSnapshot().status).toBe("saved");
  expect(storage.getItem(WORKING_KEY)).toBeNull();
});

test("Discard retains the latest canvas even when its disk write failed", () => {
  const { storage, store } = createStore();
  storage.setFail(true);
  store.canvasChanged(state("canvas pending"));
  store.edit("source edits");
  storage.setFail(false);
  store.discard();
  expect(store.getSnapshot().source).toBe("canvas pending");
  expect(storage.getItem(MARKDOWN_KEY)).toBe("canvas pending");
});

test("a serialized browser draft migrates while retaining its original JSON backup", async () => {
  const legacy = await readFile(
    new URL("../../scripts/browser/fixtures/legacy-step9.json", import.meta.url),
    "utf8",
  );

  const storage = memory({ [LEGACY_KEY]: legacy });

  const migrated = initialDraft(storage, () => {
    throw new Error("Demo should not load");
  });

  expect(migrated.snapshot.error).toBeUndefined();
  expect(migrated.snapshot.valid).toBe(true);
  expect(migrated.snapshot.source).toContain("# Road closure");
  expect(prepareSource(migrated.snapshot.source).state.root.children.length).toBeGreaterThan(49);
  const store = new DraftStore(storage, migrated, govbbFormCodec, govbbDraftKeys);
  store.connect(editorDouble().editor);
  expect(storage.getItem(LEGACY_KEY)).toBe(legacy);
  expect(storage.getItem(MARKDOWN_KEY)).toBe(migrated.snapshot.source);
});

test("supported legacy JSON may upgrade to native bindings while preserving the exact JSON backup", () => {
  const source =
    "---\nformat: govbb-form\nformatVersion: 2\ntitle: Simple legacy form\n---\n\n# Name\n\n::text[Your name]{#name required}\n";

  const legacy = JSON.stringify(toEditor(readMarkdown(source).document!), null, 2);
  const storage = memory({ [LEGACY_KEY]: legacy });

  const loaded = initialDraft(storage, () => {
    throw Error("Use the existing JSON");
  });

  expect(loaded.snapshot.valid).toBe(true);
  expect(loaded.snapshot.error).toBeUndefined();
  expect(loaded.snapshot.committed).toContain('"native"');
  expect(loaded.migrationOriginal).toBe(legacy);
  expect(storage.getItem(MARKDOWN_KEY)).toBeNull();
  const store = new DraftStore(storage, loaded, govbbFormCodec, govbbDraftKeys);
  store.connect(editorDouble().editor);
  expect(store.getSnapshot().status).toBe("saved");
  expect(storage.getItem(LEGACY_KEY)).toBe(legacy);
  expect(storage.getItem(govbbDraftKeys.nativeMigrationBackup!)).toBe(legacy);
  expect(storage.getItem(MARKDOWN_KEY)).toBe(loaded.snapshot.committed);
  expect(initialDraft(storage, () => {}).needsSave).toBe(false);
});

test("version 1 Markdown migrates into the new key once and retains its exact backup", () => {
  const storage = memory({ [PREVIOUS_MARKDOWN_KEY]: versionOne });

  const migrated = initialDraft(storage, () => {
    throw Error("Do not replace an existing document");
  });

  expect(migrated.snapshot.error).toBeUndefined();
  expect(migrated.snapshot.source).toContain("formatVersion: 2");
  expect(migrated.snapshot.source.match(/:::logic/g)).toHaveLength(1);
  expect(migrated.needsSave).toBe(true);
  const store = new DraftStore(storage, migrated, govbbFormCodec, govbbDraftKeys);
  store.connect(editorDouble().editor);
  const saved = storage.getItem(MARKDOWN_KEY)!;
  expect(storage.getItem(PREVIOUS_MARKDOWN_KEY)).toBe(versionOne);

  const reloaded = initialDraft(storage, () => {
    throw Error("Do not replace a migrated document");
  });

  expect(reloaded.snapshot.source).toBe(saved);
  expect(reloaded.needsSave).toBe(false);
  expect(prepareSource(saved).source).toBe(saved);
});

test("migration preserves dirty source including an empty buffer until Discard or Apply", () => {
  for (const working of ["bad unapplied source\n", ""]) {
    const storage = memory({ [PREVIOUS_MARKDOWN_KEY]: versionOne, [WORKING_KEY]: working });
    const migrated = initialDraft(storage, () => {});

    const store = new DraftStore(storage, migrated, govbbFormCodec, govbbDraftKeys),
      editor = editorDouble();

    store.connect(editor.editor);
    expect(migrated.snapshot.source).toBe(working);
    expect(migrated.snapshot.dirty).toBe(true);
    expect(editor.editable()).toBe(false);
    expect(storage.getItem(MARKDOWN_KEY)).toBeNull();
    expect(store.apply()).toBe(false);
    expect(storage.getItem(WORKING_KEY)).toBe(working);
    expect(initialDraft(storage, () => {}).snapshot.source).toBe(working);
    store.discard();
    expect(storage.getItem(WORKING_KEY)).toBeNull();
    expect(storage.getItem(MARKDOWN_KEY)).toContain("formatVersion: 2");
    expect(storage.getItem(PREVIOUS_MARKDOWN_KEY)).toBe(versionOne);
    expect(editor.editable()).toBe(true);
  }
});

test("an unchanged legacy working buffer is cleared after the canonical document saves", () => {
  const storage = memory({ [PREVIOUS_MARKDOWN_KEY]: versionOne, [WORKING_KEY]: versionOne });
  const migrated = initialDraft(storage, () => {});
  expect(migrated.snapshot.dirty).toBe(false);
  new DraftStore(storage, migrated, govbbFormCodec, govbbDraftKeys).connect(editorDouble().editor);
  expect(storage.getItem(MARKDOWN_KEY)).toContain("formatVersion: 2");
  expect(storage.getItem(WORKING_KEY)).toBeNull();
  expect(initialDraft(storage, () => {}).snapshot.dirty).toBe(false);
});

test("malformed legacy wording remains recoverable and failed source Apply is atomic", () => {
  const legacy = readMarkdown(versionOne).document!;
  const first = legacy.pages[0]!.blocks[0]!;

  if (first.type !== "question") throw Error("Expected a question");
  first.settings.conditionalLabel = [
    {
      id: "row",
      field: "continue",
      operator: "equal",
      value: { option: "yes", future: "must survive" },
      text: "Changed title",
    },
  ];
  const malformed = writeMarkdown(legacy);
  const recoveryStorage = memory({ [PREVIOUS_MARKDOWN_KEY]: malformed });

  const recovered = initialDraft(recoveryStorage, () => {
    throw Error("Do not load a demo");
  });

  expect(recovered.snapshot.valid).toBe(false);
  expect(recovered.snapshot.recovery?.original).toBe(malformed);
  expect(recoveryStorage.getItem(PREVIOUS_MARKDOWN_KEY)).toBe(malformed);
  expect(recoveryStorage.getItem(MARKDOWN_KEY)).toBeNull();

  const saved = prepareSource(versionOne).source;
  const storage = memory({ [MARKDOWN_KEY]: saved });

  const store = new DraftStore(
      storage,
      initialDraft(storage, () => {}),
      govbbFormCodec,
      govbbDraftKeys,
    ),
    editor = editorDouble();

  store.connect(editor.editor);
  store.edit(malformed);
  expect(store.apply()).toBe(false);
  expect(editor.replacements()).toBe(0);
  expect(storage.getItem(MARKDOWN_KEY)).toBe(saved);
  expect(storage.getItem(WORKING_KEY)).toBe(malformed);
  expect(store.getSnapshot().source).toBe(malformed);
});

test("a failed migration write retries without changing its backup or duplicating rules", () => {
  const storage = memory({ [PREVIOUS_MARKDOWN_KEY]: versionOne });
  const migrated = initialDraft(storage, () => {});
  storage.setFail(true);
  const store = new DraftStore(storage, migrated, govbbFormCodec, govbbDraftKeys);
  store.connect(editorDouble().editor);
  expect(store.getSnapshot().status).toBe("recovery");
  expect(store.getSnapshot().recovery?.kind).toBe("migration");
  expect(storage.getItem(MARKDOWN_KEY)).toBeNull();
  storage.setFail(false);
  store.retry();
  expect(store.getSnapshot().status).toBe("saved");
  expect(storage.getItem(MARKDOWN_KEY)).toBe(migrated.snapshot.source);
  expect(storage.getItem(PREVIOUS_MARKDOWN_KEY)).toBe(versionOne);
  expect(initialDraft(storage, () => {}).snapshot.source.match(/:::logic/g)).toHaveLength(1);
});
