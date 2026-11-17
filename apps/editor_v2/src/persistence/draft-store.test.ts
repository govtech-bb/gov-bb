import { expect, test, vi } from "vitest";
import type { SerializedEditorState } from "lexical";
import { DraftStore, draftPause, initialDraft } from "./draft-store";
import { SourceError, type DraftCodec, type DraftConnection } from "./types";

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
        { code: "syntax", severity: "fatal", message: "Invalid source", line: 2, column: 1 },
      ]);

    return { source, state: state(source), diagnostics: [] };
  },
  encode: (value) => value.root.children[0]!.type,
  prepareLegacy: () => {
    throw Error("Legacy input is not read");
  },
};

function connected(source = "Original", configured = codec) {
  const store = new DraftStore(source, configured);
  let current = store.initial.state ?? state("Unavailable");
  let listener: ((state: SerializedEditorState) => void) | undefined;

  const connection: DraftConnection = {
    prepare: vi.fn((value) => () => {
      current = value;
      listener?.(value);
    }),
    getState: () => current,
    setEditable: vi.fn(),
    subscribe: (next) => {
      listener = next;

      return () => {
        listener = undefined;
      };
    },
  };

  const disconnect = store.connect(connection);

  return {
    store,
    connection,
    disconnect,
    current: () => codec.encode(current),
    edit: (text: string) => listener?.(state(text)),
  };
}

test("explicit documents and source buffers remain independent without storage or timers", () => {
  vi.useFakeTimers();

  try {
    const a = connected("A"),
      b = connected("B");

    a.edit("A edited");
    a.store.edit("A source");
    expect(a.store.getSnapshot()).toMatchObject({
      committed: "A edited",
      source: "A source",
      dirty: true,
    });
    expect(b.store.getSnapshot()).toMatchObject({ committed: "B", dirty: false, status: "ready" });
    expect(vi.getTimerCount()).toBe(0);
    a.store.discard();
    expect(a.store.getSnapshot()).toMatchObject({
      source: "A edited",
      status: "ready",
      dirty: false,
    });
    a.disconnect();
    a.edit("Detached");
    expect(a.store.getSnapshot().committed).toBe("A edited");
    b.disconnect();
  } finally {
    vi.useRealTimers();
  }
});

test("invalid initial input is retained exactly and can be repaired", () => {
  const source = "invalid:  exact bytes\n";
  expect(initialDraft(source, codec).snapshot).toMatchObject({
    valid: false,
    source,
    committed: source,
    recovery: { original: source },
    diagnostics: [{ code: "syntax", line: 2 }],
  });
  const store = new DraftStore(source, codec);
  expect(draftPause(store.getSnapshot())).toBe("invalid");
  store.edit("Repaired");
  expect(store.apply()).toBe(true);
  expect(store.getSnapshot()).toMatchObject({
    valid: true,
    committed: "Repaired",
    status: "ready",
  });
});

test("Apply validates before replacing, pauses the canvas, and no-op Apply adds no history", () => {
  const h = connected();
  h.store.edit("invalid: text");
  h.edit("Stale canvas");
  expect(h.store.apply()).toBe(false);
  expect(h.connection.prepare).not.toHaveBeenCalled();
  expect(h.store.getSnapshot()).toMatchObject({ committed: "Original", source: "invalid: text" });
  expect(draftPause(h.store.getSnapshot())).toBe("source");
  h.store.edit("Applied");
  expect(h.store.apply()).toBe(true);
  expect(h.current()).toBe("Applied");
  expect(h.store.getSnapshot()).toMatchObject({
    committed: "Applied",
    dirty: false,
    status: "ready",
  });
  const before = h.store.getSnapshot().state;
  expect(h.store.apply()).toBe(true);
  expect(h.store.getSnapshot().state).toEqual(before);
  expect(h.connection.setEditable).toHaveBeenLastCalledWith(true);
  h.disconnect();
});

test("replacement rejects mismatched source, dirty buffers, foreign/stale tokens and a read-only host", () => {
  const h = connected();
  const candidate = codec.prepare("Imported");
  const token = h.store.captureReplacementToken();
  expect(h.store.replacePrepared({ ...candidate, source: "Different" }, token).status).toBe(
    "rejected",
  );
  expect(h.store.replacePrepared(candidate, token, { canCommit: () => false }).status).toBe(
    "rejected",
  );
  expect(
    h.store.replacePrepared(candidate, new DraftStore("Original", codec).captureReplacementToken())
      .status,
  ).toBe("rejected");
  h.store.edit("Unapplied");
  expect(h.store.replacePrepared(candidate, h.store.captureReplacementToken()).status).toBe(
    "rejected",
  );
  h.store.discard();
  expect(h.store.replacePrepared(candidate, token).status).toBe("rejected");
  expect(h.current()).toBe("Original");
  h.disconnect();
});

test("a reentrant change during replacement preparation invalidates its token", () => {
  const h = connected();
  const token = h.store.captureReplacementToken();
  vi.mocked(h.connection.prepare).mockImplementation(() => {
    h.store.edit("Intervening source");

    return () => {
      throw Error("Must not apply");
    };
  });
  expect(h.store.replacePrepared(codec.prepare("Imported"), token).status).toBe("rejected");
  expect(h.store.getSnapshot().source).toBe("Intervening source");
  h.disconnect();
});

test("replacement-hook failure keeps prior and candidate source in memory and pauses editing", () => {
  const h = connected();
  vi.mocked(h.connection.prepare).mockReturnValue(() => {
    throw Error("Update hook failed");
  });
  expect(
    h.store.replacePrepared(codec.prepare("Candidate"), h.store.captureReplacementToken()).status,
  ).toBe("rejected");
  expect(h.store.getSnapshot()).toMatchObject({
    valid: false,
    status: "error",
    committed: "Original",
    source: "Candidate",
    recovery: { original: "Original" },
  });
  expect(h.connection.setEditable).toHaveBeenLastCalledWith(false);
  vi.mocked(h.connection.prepare).mockReturnValue(() => {});
  expect(h.store.apply()).toBe(true);
  expect(h.store.getSnapshot()).toMatchObject({ valid: true, committed: "Candidate" });
  h.disconnect();
});

test("serialization failure retains exact editor state; retry never claims a server save", () => {
  let fail = true;

  const h = connected("Original", {
    ...codec,
    encode(value) {
      if (codec.encode(value) === "Unsupported" && fail) throw Error("Unsupported node");

      return codec.encode(value);
    },
  });

  h.edit("Unsupported");
  h.store.retry();
  expect(h.store.getSnapshot()).toMatchObject({
    status: "error",
    committed: "Original",
    recovery: { kind: "canvas", original: JSON.stringify(state("Unsupported")) },
  });
  fail = false;
  h.store.retry();
  expect(h.store.getSnapshot()).toMatchObject({
    committed: "Unsupported",
    status: "ready",
    recovery: undefined,
  });
  h.disconnect();
});
