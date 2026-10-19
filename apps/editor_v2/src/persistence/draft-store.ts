import type { SerializedEditorState } from "lexical";
import {
  SourceError,
  type DraftCodec,
  type DraftConnection,
  type DraftDiagnostic,
  type DraftPause,
  type DraftReplacementToken,
  type DraftSnapshot,
  type InitialDraft,
  type PreparedSource,
  type ReplacementOptions,
  type ReplacementResult,
} from "./types";

const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const diagnostics = (cause: unknown): DraftDiagnostic[] =>
  cause instanceof SourceError
    ? cause.diagnostics
    : [{ code: "source-load", severity: "fatal", message: reason(cause), line: 1, column: 1 }];

/** Opens explicit source in memory, retaining exact input if it cannot be parsed. */
export function initialDraft(source: string, codec: DraftCodec): InitialDraft {
  try {
    const prepared = codec.prepare(source);
    const committed = prepared.migrated ? prepared.source : source;

    return {
      state: prepared.state,
      snapshot: {
        mode: prepared.mode ?? "visual",
        state: prepared.state,
        source: committed,
        committed,
        dirty: false,
        valid: true,
        status: "ready",
        diagnostics: prepared.diagnostics,
      },
    };
  } catch (error) {
    return {
      snapshot: {
        mode: "source",
        source,
        committed: source,
        dirty: false,
        valid: false,
        status: "error",
        diagnostics: diagnostics(error),
        error: reason(error),
        recovery: { kind: "markdown", original: source },
      },
    };
  }
}

/** The canvas pauses for invalid input or unapplied Markdown, independently of host read-only. */
export function draftPause(snapshot: DraftSnapshot): DraftPause | undefined {
  if (!snapshot.valid) return "invalid";

  if (snapshot.dirty) return "source";
}

/** In-memory visual/source editing only. The host owns saving and its server baseline. */
export class DraftStore {
  readonly initial: InitialDraft;
  private snapshot: DraftSnapshot;
  private listeners = new Set<() => void>();
  private editor: DraftConnection | undefined;
  private applying = false;
  private latestCanonical: string;
  private tokens = new WeakMap<DraftReplacementToken, DraftSnapshot>();

  constructor(
    source: string,
    private codec: DraftCodec,
  ) {
    this.initial = initialDraft(source, codec);
    this.snapshot = this.initial.snapshot;
    this.latestCanonical = this.initial.state ? codec.encode(this.initial.state) : source;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private editable() {
    return this.snapshot.mode === "visual" && !draftPause(this.snapshot);
  }

  private change(patch: Partial<DraftSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.editor?.setEditable(this.editable());

    for (const listener of this.listeners) listener();
  }

  connect(editor: DraftConnection) {
    this.editor = editor;
    editor.setEditable(this.editable());

    const unsubscribe = editor.subscribe((state) => {
      if (this.editor === editor) this.canvasChanged(state);
    });

    return () => {
      unsubscribe();

      if (this.editor === editor) this.editor = undefined;
    };
  }

  canvasChanged(state: SerializedEditorState) {
    if (this.applying || !this.editable()) return;

    try {
      const source = this.codec.encode(state);

      if (source === this.latestCanonical && !this.snapshot.recovery) return;
      this.latestCanonical = source;
      this.change({
        source,
        committed: source,
        state,
        status: "ready",
        error: undefined,
        recovery: undefined,
        diagnostics: [],
      });
    } catch (error) {
      this.change({
        state,
        status: "error",
        error: `The editor could not convert these changes: ${reason(error)}. Download the editor state to keep a copy.`,
        recovery: { kind: "canvas", original: JSON.stringify(state) },
      });
    }
  }

  edit = (source: string) => {
    this.change({
      source,
      dirty: source !== this.snapshot.committed || !this.snapshot.valid,
      status: this.snapshot.recovery?.kind === "canvas" ? "error" : "source",
      diagnostics: [],
    });
  };

  apply = () => {
    const token = this.captureReplacementToken();
    let prepared: PreparedSource;

    try {
      prepared = this.codec.prepare(this.snapshot.source);
    } catch (error) {
      this.change({ diagnostics: diagnostics(error), error: reason(error), status: "source" });

      return false;
    }

    const result = this.commitPrepared(prepared, token, {}, true);

    if (result.status === "rejected")
      this.change({ error: result.message, diagnostics: diagnostics(new Error(result.message)) });

    return result.status === "committed";
  };

  /** Discards only unapplied source; applied changes remain unsaved in the host. */
  discard = () => {
    if (!this.snapshot.valid) return;
    this.change({
      source: this.snapshot.committed,
      dirty: false,
      status: this.snapshot.recovery?.kind === "canvas" ? "error" : "ready",
      diagnostics: [],
      error: this.snapshot.recovery ? this.snapshot.error : undefined,
    });
  };

  /** Retries serialization without treating an in-memory result as a durable save. */
  retry = () => {
    if (this.snapshot.recovery?.kind === "canvas" && this.snapshot.state)
      this.canvasChanged(this.snapshot.state);
  };

  captureReplacementToken = (): DraftReplacementToken => {
    const token = Object.freeze({ source: this.latestCanonical });
    this.tokens.set(token, this.snapshot);

    return token;
  };

  replacePrepared = (
    prepared: PreparedSource,
    token: DraftReplacementToken,
    options: ReplacementOptions = {},
  ): ReplacementResult => this.commitPrepared(prepared, token, options, false);

  private commitPrepared(
    prepared: PreparedSource,
    token: DraftReplacementToken,
    options: ReplacementOptions,
    allowSource: boolean,
  ): ReplacementResult {
    let apply: (() => void) | undefined;

    try {
      if (prepared.mode !== "source" && this.codec.encode(prepared.state) !== prepared.source)
        throw Error("The prepared editor state does not match its canonical source.");
      apply = prepared.mode === "source" ? undefined : this.editor?.prepare(prepared.state);

      if (this.tokens.get(token) !== this.snapshot || token.source !== this.latestCanonical)
        throw Error(
          "This draft changed while the replacement was being prepared. Prepare it again before applying.",
        );

      if (!allowSource && (!this.snapshot.valid || this.snapshot.dirty || this.snapshot.recovery))
        throw Error("Resolve the current source before applying a replacement.");

      if (options.canCommit && !options.canCommit())
        throw Error("The editor is no longer available for this replacement.");
    } catch (error) {
      return { status: "rejected", message: reason(error) };
    }

    const previous = this.snapshot;
    this.applying = true;

    try {
      if (prepared.source !== this.latestCanonical || !previous.valid) apply?.();
      this.latestCanonical =
        prepared.mode === "source" ? prepared.source : this.codec.encode(prepared.state);
      this.change({
        mode: prepared.mode ?? "visual",
        state: prepared.state,
        source: prepared.source,
        committed: prepared.source,
        dirty: false,
        valid: true,
        status: "ready",
        error: undefined,
        recovery: undefined,
        diagnostics: prepared.diagnostics,
      });

      return { status: "committed", history: "preserved" };
    } catch (error) {
      // An editor hook can fail after replacement. Keep both sources and pause rather than claiming success.
      this.change({
        source: prepared.source,
        committed: previous.committed,
        dirty: true,
        valid: false,
        status: "error",
        error: reason(error),
        recovery: { kind: "markdown", original: previous.committed },
      });

      return { status: "rejected", message: reason(error) };
    } finally {
      this.applying = false;
    }
  }
}
