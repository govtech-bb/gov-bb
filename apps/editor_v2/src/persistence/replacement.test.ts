import { expect, test } from "vitest";
import type { SerializedEditorState } from "lexical";
import { DraftStore, initialDraft } from "./draft-store";
import type {
  DraftCodec,
  DraftConnection,
  DraftKeys,
  DraftStorage,
  ReplacementJournal,
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
    throw Error("No legacy decoder");
  },
};

const keys: DraftKeys = {
  committed: "saved",
  working: "working",
  previous: "previous",
  legacy: "legacy",
  replacementJournal: "replacement",
  nativeMigrationBackup: "native-backup",
};

function memory(seed: Record<string, string> = { saved: "Saved" }) {
  const values = new Map(Object.entries(seed)),
    operations: string[] = [];

  let before:
    | ((operation: "read" | "write" | "remove", key: string, value?: string) => void)
    | undefined;

  const storage: DraftStorage = {
    getItem(key) {
      operations.push(`read:${key}`);
      before?.("read", key);

      return values.get(key) ?? null;
    },
    setItem(key, value) {
      operations.push(`write:${key}`);
      before?.("write", key, value);
      values.set(key, value);
    },
    removeItem(key) {
      operations.push(`remove:${key}`);
      before?.("remove", key);
      values.delete(key);
    },
  };

  return {
    storage,
    values,
    operations,
    intercept(callback: typeof before) {
      before = callback;
    },
  };
}

function connected(mem = memory(), draftCodec = codec) {
  const initial = initialDraft(mem.storage, () => state("Initial"), draftCodec, keys);
  const store = new DraftStore(mem.storage, initial, draftCodec, keys);

  let current = initial.state ?? state("Unavailable"),
    applies = 0,
    editable = true;

  let listener: ((value: SerializedEditorState) => void) | undefined;
  let onPrepare: (() => void) | undefined, onApply: (() => void) | undefined;

  const connection: DraftConnection = {
    prepare(value) {
      mem.operations.push("prepare");
      onPrepare?.();

      return () => {
        applies++;
        mem.operations.push("apply");
        onApply?.();
        current = value;
        listener?.(value);
      };
    },
    getState: () => current,
    setEditable: (value) => {
      editable = value;
    },
    subscribe(next) {
      listener = next;

      return () => {
        listener = undefined;
      };
    },
  };

  const disconnect = store.connect(connection);

  return {
    ...mem,
    store,
    disconnect,
    current: () => codec.encode(current),
    applies: () => applies,
    editable: () => editable,
    beforePrepare(callback?: () => void) {
      onPrepare = callback;
    },
    beforeApply(callback?: () => void) {
      onApply = callback;
    },
  };
}

const candidate = (source = "Imported") => codec.prepare(source);

const journal = (overrides: Partial<ReplacementJournal> = {}): ReplacementJournal => ({
  version: 1,
  transactionId: "test-transaction",
  prior: { committed: "Saved", working: null, source: "Saved" },
  candidate: "Imported",
  original: ' {"original": true}\n',
  ...overrides,
});

test("prepared replacement journals exact bytes before commit and creates one editor boundary", () => {
  const host = connected(),
    token = host.store.captureReplacementToken();

  let written: ReplacementJournal | undefined;
  host.intercept((operation, key, value) => {
    if (operation === "write" && key === "replacement") written = JSON.parse(value!);
  });
  host.operations.length = 0;
  expect(
    host.store.replacePrepared(candidate(), token, { original: ' {"unmodified":true}\n' }),
  ).toEqual({ status: "committed", cleanupPending: false, history: "preserved" });
  expect(written?.prior).toEqual({ committed: "Saved", working: null, source: "Saved" });
  expect(written?.original).toBe(' {"unmodified":true}\n');
  expect(written?.transactionId).toBeTruthy();
  expect(host.operations[0]).toBe("prepare");
  expect(host.operations.indexOf("write:replacement")).toBeLessThan(
    host.operations.indexOf("write:saved"),
  );
  expect(host.operations.indexOf("write:saved")).toBeLessThan(host.operations.indexOf("apply"));
  expect(host.operations.indexOf("apply")).toBeLessThan(
    host.operations.indexOf("remove:replacement"),
  );
  expect(host.values.get("saved")).toBe("Imported");
  expect(host.values.has("replacement")).toBe(false);
  expect(host.current()).toBe("Imported");
  expect(host.applies()).toBe(1);
  expect(host.editable()).toBe(true);
  host.disconnect();
});

test("a second tab observes journal begin, commit and cleanup then offers the ordinary version choice", () => {
  const mem = memory(),
    writer = connected(mem),
    observer = connected(mem);

  const setItem = mem.storage.setItem.bind(mem.storage),
    removeItem = mem.storage.removeItem.bind(mem.storage);

  const phases: string[] = [];
  mem.storage.setItem = (key, value) => {
    setItem(key, value);
    observer.store.externalChange(key);
    phases.push(observer.store.getSnapshot().status);
  };

  mem.storage.removeItem = (key) => {
    removeItem(key);
    observer.store.externalChange(key);
    phases.push(observer.store.getSnapshot().status);
  };

  expect(
    writer.store.replacePrepared(candidate(), writer.store.captureReplacementToken()).status,
  ).toBe("committed");
  expect(phases).toContain("recovery");
  expect(observer.store.getSnapshot()).toMatchObject({
    status: "conflict",
    source: "Saved",
    conflict: { source: "Imported", working: null },
  });
  expect(observer.store.getSnapshot().replacement).toBeUndefined();
  expect(observer.store.getSnapshot().recovery).toBeUndefined();
  expect(observer.current()).toBe("Saved");
  expect(observer.applies()).toBe(0);
  expect(observer.store.useExternal()).toBe(true);
  expect(observer.current()).toBe("Imported");
  expect(observer.applies()).toBe(1);
  writer.disconnect();
  observer.disconnect();
});

test("storage events never clear recovery for this tab's own failed replacement", () => {
  const host = connected();
  host.beforeApply(() => {
    throw Error("Update failed");
  });
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken()).status).toBe(
    "recovery-required",
  );
  const pending = host.store.getSnapshot().replacement;
  host.values.delete("replacement");
  host.store.externalChange("replacement");
  expect(host.store.getSnapshot().replacement).toEqual(pending);
  expect(host.store.getSnapshot().status).toBe("recovery");
  expect(host.current()).toBe("Saved");
  host.disconnect();
});

test("parsing, mismatched source, dirty drafts and stale tokens reject before any write", () => {
  const host = connected(),
    originalToken = host.store.captureReplacementToken();

  host.beforePrepare(() => {
    throw Error("Unknown node");
  });
  host.operations.length = 0;
  expect(host.store.replacePrepared(candidate(), originalToken).status).toBe("rejected");
  expect(host.operations).toEqual(["prepare"]);
  host.beforePrepare();
  host.operations.length = 0;
  expect(
    host.store.replacePrepared({ ...candidate(), source: "Different" }, originalToken).status,
  ).toBe("rejected");
  expect(host.operations).toEqual([]);
  host.store.edit("Unapplied");
  host.operations.length = 0;
  expect(host.store.replacePrepared(candidate(), originalToken).status).toBe("rejected");
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken()).status).toBe(
    "rejected",
  );
  expect(
    host.operations.every(
      (operation) => !operation.startsWith("write:") && !operation.startsWith("remove:"),
    ),
  ).toBe(true);
  expect(host.values.get("saved")).toBe("Saved");
  expect(host.values.get("working")).toBe("Unapplied");
  host.disconnect();
});

test("a reentrant editor change and a file-read race invalidate replacement tokens", () => {
  const host = connected(),
    token = host.store.captureReplacementToken();

  host.beforePrepare(() => host.store.canvasChanged(state("Intervening edit")));
  expect(host.store.replacePrepared(candidate(), token).status).toBe("rejected");
  expect(host.current()).toBe("Saved");
  expect(host.values.has("replacement")).toBe(false);
  host.beforePrepare();
  host.store.flush();
  expect(host.store.replacePrepared(candidate(), token).status).toBe("rejected");
  expect(host.values.get("saved")).toBe("Intervening edit");
  host.disconnect();
});

test("read-only is rechecked after journal creation and before the canonical commit", () => {
  const host = connected();
  let allowed = true;
  host.intercept((operation, key) => {
    if (operation === "write" && key === "replacement") allowed = false;
  });
  expect(
    host.store.replacePrepared(candidate(), host.store.captureReplacementToken(), {
      canCommit: () => allowed,
    }).status,
  ).toBe("rejected");
  expect(host.values.get("saved")).toBe("Saved");
  expect(host.applies()).toBe(0);
  expect(host.store.getSnapshot().replacement?.phase).toBe("uncommitted");
  host.intercept(undefined);
  host.disconnect();
});

test("failed journal writes cannot modify the canonical draft or editor", () => {
  const host = connected();
  host.intercept((operation, key) => {
    if (operation === "write" && key === "replacement") throw Error("Quota");
  });
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken()).status).toBe(
    "rejected",
  );
  expect(host.values.get("saved")).toBe("Saved");
  expect(host.values.has("replacement")).toBe(false);
  expect(host.applies()).toBe(0);
  host.intercept(undefined);
  host.disconnect();
});

test("failed canonical writes retain an uncommitted candidate and block a second replacement", () => {
  const host = connected();
  host.intercept((operation, key) => {
    if (operation === "write" && key === "saved") throw Error("Quota");
  });
  expect(
    host.store.replacePrepared(candidate(), host.store.captureReplacementToken(), {
      original: "upload bytes",
    }).status,
  ).toBe("rejected");
  const bytes = host.values.get("replacement");
  expect(host.values.get("saved")).toBe("Saved");
  expect(host.current()).toBe("Saved");
  expect(host.applies()).toBe(0);
  expect(host.store.getSnapshot().replacement?.phase).toBe("uncommitted");
  host.intercept(undefined);
  expect(
    host.store.replacePrepared(candidate("Second"), host.store.captureReplacementToken()).status,
  ).toBe("rejected");
  expect(host.values.get("replacement")).toBe(bytes);
  expect(host.store.recoverReplacement("candidate")).toEqual({
    status: "committed",
    cleanupPending: false,
    history: "preserved",
  });
  expect(host.current()).toBe("Imported");
  expect(host.values.get("saved")).toBe("Imported");
  expect(host.applies()).toBe(1);
  host.disconnect();
});

test("an apply failure is committed recovery, freezes autosave, and preserves both drafts", () => {
  const host = connected();
  host.beforeApply(() => {
    throw Error("An update hook failed");
  });
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken()).status).toBe(
    "recovery-required",
  );
  const bytes = host.values.get("replacement");
  expect(host.values.get("saved")).toBe("Imported");
  expect(host.current()).toBe("Saved");
  expect(host.editable()).toBe(false);
  expect(host.store.getSnapshot().replacement?.journal.prior.committed).toBe("Saved");
  host.store.canvasChanged(state("Accidental autosave"));
  host.store.edit("Accidental source");
  host.store.discard();
  host.store.retry();
  host.store.flush();
  expect(host.values.get("saved")).toBe("Imported");
  expect(host.values.get("replacement")).toBe(bytes);
  host.beforeApply();
  expect(host.store.recoverReplacement("original").status).toBe("committed");
  expect(host.values.get("saved")).toBe("Saved");
  expect(host.current()).toBe("Saved");
  expect(host.editable()).toBe(true);
  host.disconnect();
});

test("cleanup failure is a successful content commit and retry adds no history step", () => {
  const host = connected();
  host.intercept((operation, key) => {
    if (operation === "remove" && key === "replacement") throw Error("Storage unavailable");
  });
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken())).toEqual({
    status: "committed",
    cleanupPending: true,
    history: "preserved",
  });
  expect(host.applies()).toBe(1);
  expect(host.current()).toBe("Imported");
  expect(host.values.has("replacement")).toBe(true);
  expect(
    host.store.replacePrepared(candidate("Second"), host.store.captureReplacementToken()).status,
  ).toBe("rejected");
  host.intercept(undefined);
  expect(host.store.retryReplacementCleanup()).toBe(true);
  expect(host.applies()).toBe(1);
  expect(host.values.has("replacement")).toBe(false);
  expect(host.editable()).toBe(true);
  host.disconnect();
});

test("Markdown Apply uses the replacement journal and preserves its exact prior working buffer", () => {
  const host = connected();
  host.store.edit("Edited Markdown\n");
  host.intercept((operation, key) => {
    if (operation === "remove" && key === "working") throw Error("Cannot clear working buffer");
  });
  expect(host.store.apply()).toBe(true);
  expect(host.values.get("saved")).toBe("Edited Markdown\n");
  expect(host.values.get("working")).toBe("Edited Markdown\n");
  expect(host.store.getSnapshot().replacement?.journal.prior.working).toBe("Edited Markdown\n");
  expect(host.current()).toBe("Edited Markdown\n");
  expect(host.applies()).toBe(1);
  host.intercept(undefined);
  expect(host.store.retryReplacementCleanup()).toBe(true);
  expect(host.applies()).toBe(1);
  host.disconnect();
});

test("restart distinguishes journal-only, committed and third-party states without writes", () => {
  for (const [source, phase] of [
    ["Saved", "uncommitted"],
    ["Imported", "committed"],
    ["Third-party", "conflict"],
  ] as const) {
    const mem = memory({ saved: source, replacement: JSON.stringify(journal()) });
    const loaded = initialDraft(mem.storage, () => state("Demo"), codec, keys);
    expect(loaded.snapshot.replacement?.phase).toBe(phase);
    expect(loaded.needsSave).toBe(false);
    expect(mem.operations.every((operation) => operation.startsWith("read:"))).toBe(true);
    const host = connected(mem);
    expect(host.editable()).toBe(false);

    if (phase === "conflict") {
      expect(host.store.recoverReplacement("candidate").status).toBe("rejected");
      expect(host.values.get("saved")).toBe("Third-party");
    } else {
      expect(host.store.recoverReplacement("candidate").status).toBe("committed");
      expect(host.current()).toBe("Imported");
      expect(host.values.has("replacement")).toBe(false);
    }

    host.disconnect();
  }
});

test("restoring an original preserves null committed bytes and an empty working buffer", () => {
  const host = connected(
    memory({
      saved: "Imported",
      replacement: JSON.stringify(
        journal({ prior: { committed: null, working: "", source: "Unsaved original" } }),
      ),
    }),
  );

  expect(host.store.recoverReplacement("original").status).toBe("committed");
  expect(host.values.has("saved")).toBe(false);
  expect(host.values.get("working")).toBe("");
  expect(host.current()).toBe("Unsaved original");
  expect(host.store.getSnapshot().dirty).toBe(true);
  expect(host.values.has("replacement")).toBe(false);
  host.disconnect();
});

test("third-party working edits and stale journal cleanup cannot be overwritten", () => {
  const host = connected();
  host.intercept((operation, key) => {
    if (operation === "remove" && key === "replacement") throw Error("Leave journal for retry");
  });
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken()).status).toBe(
    "committed",
  );
  host.intercept(undefined);
  const newer = JSON.stringify(journal({ transactionId: "newer-transaction", candidate: "Newer" }));
  host.values.set("replacement", newer);
  expect(host.store.retryReplacementCleanup()).toBe(false);
  expect(host.values.get("replacement")).toBe(newer);
  expect(host.values.get("saved")).toBe("Imported");
  expect(host.store.recoverReplacement("original").status).toBe("rejected");
  host.disconnect();

  const other = connected(
    memory({
      saved: "Imported",
      working: "Other tab's unsaved work",
      replacement: JSON.stringify(journal()),
    }),
  );

  expect(other.store.recoverReplacement("original").status).toBe("rejected");
  expect(other.values.get("working")).toBe("Other tab's unsaved work");
  expect(other.values.get("saved")).toBe("Imported");
  other.disconnect();
});

test("a third-party canonical write during journal creation wins without being overwritten", () => {
  const host = connected();
  host.intercept((operation, key) => {
    if (operation === "write" && key === "replacement") host.values.set("saved", "Other tab");
  });
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken()).status).toBe(
    "rejected",
  );
  expect(host.values.get("saved")).toBe("Other tab");
  expect(host.applies()).toBe(0);
  expect(host.store.getSnapshot().replacement?.phase).toBe("conflict");
  host.intercept(undefined);
  host.disconnect();
});

test("malformed journals remain recoverable exact bytes and block new imports", () => {
  const original = '{ "version": 1, broken\n',
    host = connected(memory({ saved: "Saved", replacement: original }));

  expect(host.store.getSnapshot().recovery).toEqual({ kind: "replacement", original });
  expect(host.store.getSnapshot().valid).toBe(false);
  expect(host.editable()).toBe(false);
  expect(host.store.replacePrepared(candidate(), host.store.captureReplacementToken()).status).toBe(
    "rejected",
  );
  expect(host.values.get("replacement")).toBe(original);
  expect(host.values.get("saved")).toBe("Saved");
  host.disconnect();
});

const migrationCodec: DraftCodec = {
  ...codec,
  prepare(source) {
    return source.startsWith("native:")
      ? codec.prepare(source)
      : {
          state: state(`native:${source}`),
          source: `native:${source}`,
          diagnostics: [],
          migrated: true,
          migrationOriginal: source,
        };
  },
};

test("native preparation backs up original bytes once before its first canonical write", () => {
  const original = "Original Markdown\n",
    mem = memory({ saved: original });

  const loaded = initialDraft(mem.storage, () => state("Demo"), migrationCodec, keys);
  expect(loaded.migrationOriginal).toBe(original);
  expect(mem.values.get("saved")).toBe(original);
  const host = connected(mem, migrationCodec);
  expect(host.values.get("native-backup")).toBe(original);
  expect(host.values.get("saved")).toBe(`native:${original}`);
  expect(host.operations.indexOf("write:native-backup")).toBeLessThan(
    host.operations.indexOf("write:saved"),
  );
  host.store.canvasChanged(state("native:Edited"));
  host.store.flush();
  expect(host.values.get("native-backup")).toBe(original);
  expect(host.operations.filter((operation) => operation === "write:native-backup")).toHaveLength(
    1,
  );
  host.disconnect();
  expect(initialDraft(mem.storage, () => state("Demo"), migrationCodec, keys).needsSave).toBe(
    false,
  );
});

test("dirty native migration preserves committed and working originals until explicit Apply", () => {
  const host = connected(memory({ saved: "Original\n", working: "Unapplied\n" }), migrationCodec);
  expect(host.values.get("saved")).toBe("Original\n");
  expect(host.values.get("working")).toBe("Unapplied\n");
  expect(host.values.has("native-backup")).toBe(false);
  expect(host.editable()).toBe(false);
  expect(host.store.apply()).toBe(true);
  expect(host.values.get("native-backup")).toBe("Original\n");
  expect(host.values.get("saved")).toBe("native:Unapplied\n");
  expect(host.values.has("working")).toBe(false);
  host.disconnect();
});

test("a different existing migration backup prevents every canonical write and retains both originals", () => {
  const host = connected(
    memory({ saved: "Original", working: "Unapplied", "native-backup": "Earlier original" }),
    migrationCodec,
  );

  expect(host.store.apply()).toBe(false);
  expect(host.values.get("saved")).toBe("Original");
  expect(host.values.get("working")).toBe("Unapplied");
  expect(host.values.get("native-backup")).toBe("Earlier original");
  expect(host.applies()).toBe(0);
  expect(host.store.getSnapshot().recovery).toEqual({
    kind: "migration",
    original: "Original",
    existingBackup: "Earlier original",
  });
  host.store.retry();
  host.store.flush();
  expect(host.values.get("saved")).toBe("Original");
  expect(host.values.get("working")).toBe("Unapplied");
  host.disconnect();
});

test("backup write failure blocks canonical saving and a retry reuses identical original bytes", () => {
  const mem = memory({ saved: "Original" });
  mem.intercept((operation, key) => {
    if (operation === "write" && key === "native-backup") throw Error("Quota");
  });
  const host = connected(mem, migrationCodec);
  expect(host.values.get("saved")).toBe("Original");
  expect(host.values.has("native-backup")).toBe(false);
  expect(host.editable()).toBe(false);
  expect(host.store.getSnapshot().recovery?.original).toBe("Original");
  host.intercept(undefined);
  host.store.retry();
  expect(host.values.get("native-backup")).toBe("Original");
  expect(host.values.get("saved")).toBe("native:Original");
  expect(host.editable()).toBe(true);
  host.disconnect();

  const same = connected(
    memory({ saved: "Original", "native-backup": "Original" }),
    migrationCodec,
  );

  expect(same.values.get("saved")).toBe("native:Original");
  expect(same.operations.includes("write:native-backup")).toBe(false);
  same.disconnect();
});
