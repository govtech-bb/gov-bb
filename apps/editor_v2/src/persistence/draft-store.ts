import type { SerializedEditorState } from "lexical";
import { readReplacement } from "./replacement";
import {
  SourceError,
  type DraftCodec,
  type DraftConnection,
  type DraftDiagnostic,
  type DraftKeys,
  type DraftRecovery,
  type DraftReplacement,
  type DraftReplacementToken,
  type DraftSnapshot,
  type DraftStorage,
  type InitialDraft,
  type PreparedSource,
  type ReplacementJournal,
  type ReplacementOptions,
  type ReplacementResult,
} from "./types";

const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const diagnostic = (message: string): DraftDiagnostic => ({
  code: "source-load",
  severity: "fatal",
  message,
  line: 1,
  column: 1,
});

/** Reads are non-destructive, including the distinction between a missing record and an empty one. */
export function initialDraft(
  storage: DraftStorage,
  createInitial: () => SerializedEditorState,
  codec: DraftCodec,
  keys: DraftKeys,
): InitialDraft {
  let source: string | null = null,
    working: string | null = null,
    legacy: string | null = null;

  let recovery: DraftRecovery | undefined;
  let replacement: DraftReplacement | undefined;

  try {
    source = storage.getItem(keys.committed);
    working = storage.getItem(keys.working);
    legacy = storage.getItem(keys.legacy);
    const journalBytes = keys.replacementJournal ? storage.getItem(keys.replacementJournal) : null;

    if (journalBytes !== null) {
      recovery = { kind: "replacement", original: journalBytes };
      replacement = readReplacement(journalBytes, source);

      if (working !== null && working !== replacement.journal.prior.working)
        replacement = { ...replacement, phase: "conflict" };
      const prepared = codec.prepare(source ?? replacement.journal.prior.source);
      const conflict = replacement.phase === "conflict";

      const result: InitialDraft = {
        state: prepared.state,
        observed: source,
        working,
        needsSave: false,
        snapshot: {
          mode: prepared.mode ?? "visual",
          state: prepared.state,
          source: working ?? source ?? replacement.journal.prior.source,
          committed: source ?? replacement.journal.prior.source,
          dirty: working !== null && working !== source,
          valid: true,
          status: conflict ? "conflict" : "recovery",
          diagnostics: prepared.diagnostics,
          replacement,
          recovery: { kind: "replacement", original: replacement.journal.prior.source },
          error: conflict
            ? "Another version replaced a draft with an unresolved import. Keep all recovery copies before resolving the conflict."
            : "A replacement was interrupted. Recover the imported draft or restore the original before editing.",
        },
      };

      if (conflict) result.snapshot.conflict = { source, working };

      return result;
    }

    if (source !== null) {
      recovery = { kind: "markdown", original: source };
      const prepared = codec.prepare(source);
      const committed = prepared.migrated ? prepared.source : source;
      const dirty = working !== null && working !== source;

      return {
        state: prepared.state,
        observed: source,
        working,
        needsSave: !!prepared.migrated,
        migrationOriginal: prepared.migrationOriginal,
        snapshot: {
          mode: prepared.mode ?? "visual",
          state: prepared.state,
          source: dirty ? working! : committed,
          committed,
          valid: true,
          dirty,
          status: dirty ? "source" : prepared.migrated ? "saving" : "saved",
          diagnostics: prepared.diagnostics,
        },
      };
    }

    const previous = storage.getItem(keys.previous);

    if (previous !== null) {
      recovery = { kind: "markdown", original: previous };
      const prepared = codec.prepare(previous);
      const unapplied = working !== null && working !== previous ? working : null;

      return {
        state: prepared.state,
        observed: null,
        working,
        needsSave: true,
        migrationOriginal: prepared.migrationOriginal,
        snapshot: {
          mode: prepared.mode ?? "visual",
          state: prepared.state,
          source: unapplied ?? prepared.source,
          committed: prepared.source,
          valid: true,
          dirty: unapplied !== null,
          status: unapplied !== null ? "source" : "saving",
          diagnostics: prepared.diagnostics,
        },
      };
    }

    let state: SerializedEditorState;

    if (legacy !== null) {
      recovery = { kind: "legacy", original: legacy };
      state = codec.prepareLegacy(JSON.parse(legacy));
    } else state = createInitial();
    const converted = codec.encode(state);
    const prepared = codec.prepare(converted);
    const committed = prepared.migrated ? prepared.source : converted;

    if (prepared.mode !== "source" && codec.encode(prepared.state) !== committed)
      throw new Error("The saved draft did not survive the Markdown migration unchanged");
    const unapplied = working !== null && working !== converted ? working : null;

    const migrationOriginal =
      prepared.migrationOriginal === undefined ? undefined : (legacy ?? prepared.migrationOriginal);

    return {
      state: prepared.state,
      observed: null,
      working,
      needsSave: true,
      migrationOriginal,
      snapshot: {
        mode: prepared.mode ?? "visual",
        state: prepared.state,
        source: unapplied ?? committed,
        committed,
        valid: true,
        dirty: unapplied !== null,
        status: unapplied !== null ? "source" : "saving",
        diagnostics: prepared.diagnostics,
      },
    };
  } catch (error) {
    const original = recovery?.original ?? source ?? legacy ?? "";

    return {
      observed: source,
      working,
      needsSave: false,
      snapshot: {
        mode: "source",
        source: working ?? original,
        committed: source ?? "",
        valid: false,
        dirty: working !== null && working !== source,
        status: "recovery",
        diagnostics: error instanceof SourceError ? error.diagnostics : [diagnostic(reason(error))],
        error: reason(error),
        recovery: recovery ?? { kind: "storage", original },
        replacement,
      },
    };
  }
}

/** Owns all writes, pending timers and competing-tab checks; React only presents its snapshot. */
export class DraftStore {
  private snapshot: DraftSnapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private observed: string | null;
  private observedWorking: string | null;
  private pending: string | undefined;
  private applying = false;
  private editor: DraftConnection | undefined;
  private readonly keys: DraftKeys;
  private latestCanonical: string;
  private needsSave: boolean;
  private migrationOriginal: string | undefined;
  private remoteReplacement:
    | { bytes: string; transactionId: string; previous: DraftSnapshot }
    | undefined;
  private tokens = new WeakMap<
    DraftReplacementToken,
    { snapshot: DraftSnapshot; canonical: string; observed: string | null; working: string | null }
  >();
  constructor(
    private storage: DraftStorage,
    readonly initial: InitialDraft,
    private codec: DraftCodec,
    keys: DraftKeys,
  ) {
    this.keys = { ...keys };
    this.snapshot = { ...initial.snapshot, state: initial.state };
    this.observed = initial.observed;
    this.observedWorking = initial.working;
    this.needsSave = initial.needsSave;
    this.latestCanonical = initial.state ? codec.encode(initial.state) : initial.snapshot.committed;
    this.migrationOriginal = initial.migrationOriginal;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private change(patch: Partial<DraftSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.editor?.setEditable(this.editable());

    for (const listener of this.listeners) listener();
  }
  private cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private editable() {
    return (
      this.snapshot.mode === "visual" &&
      this.snapshot.valid &&
      !this.snapshot.dirty &&
      !this.snapshot.conflict &&
      !this.snapshot.replacement &&
      this.snapshot.recovery?.kind !== "migration" &&
      this.snapshot.recovery?.kind !== "replacement"
    );
  }
  private replacementPending() {
    return !!this.snapshot.replacement || this.snapshot.recovery?.kind === "replacement";
  }
  private migrationBackup(original = this.migrationOriginal) {
    if (original === undefined) return;
    this.migrationOriginal = original;
    let existing: string | null = null;

    try {
      const key = this.keys.nativeMigrationBackup;

      if (!key) throw Error("This host has not configured a migration backup key");
      existing = this.storage.getItem(key);

      if (existing !== null && existing !== original)
        throw Error("A different original already occupies this draft's migration backup");

      if (existing === null) this.storage.setItem(key, original);
    } catch (error) {
      const recovery: DraftRecovery = { kind: "migration", original };

      if (existing !== null) recovery.existingBackup = existing;
      this.change({
        status: "recovery",
        error: `The original draft could not be backed up: ${reason(error)}. The saved draft has not been replaced.`,
        recovery,
      });
      throw error;
    }
  }
  private fail(cause: unknown, recovery?: DraftRecovery) {
    this.cancel();

    const update: Partial<DraftSnapshot> = {
      status: this.snapshot.recovery?.kind === "migration" ? "recovery" : "error",
      error: `Not saved: ${reason(cause)}. Download a copy or try saving again.`,
    };

    if (recovery) update.recovery = recovery;
    this.change(update);
  }
  private detectConflict() {
    const source = this.storage.getItem(this.keys.committed),
      working = this.storage.getItem(this.keys.working);

    if (source === this.observed && working === this.observedWorking) return false;
    this.cancel();
    this.change({
      conflict: { source, working },
      status: "conflict",
      error: "Another tab changed this draft. Choose which version to keep before saving.",
    });

    return true;
  }
  private persistBuffer() {
    if (this.replacementPending()) return false;

    try {
      if (this.detectConflict()) return false;

      if (this.snapshot.dirty) {
        this.storage.setItem(this.keys.working, this.snapshot.source);
        this.observedWorking = this.snapshot.source;
      } else {
        this.storage.removeItem(this.keys.working);
        this.observedWorking = null;
      }

      if (this.snapshot.status === "error" && !this.snapshot.recovery)
        this.change({ error: undefined, status: this.snapshot.dirty ? "source" : "saved" });

      return true;
    } catch (error) {
      this.fail(error);

      return false;
    }
  }
  start = () => {
    if (this.needsSave && !this.snapshot.dirty) {
      this.pending = this.snapshot.committed;
      this.flush();
    } else if (this.needsSave && this.snapshot.dirty) this.change({ status: "source" });
  };
  connect(editor: DraftConnection) {
    this.editor = editor;
    editor.setEditable(this.editable());
    this.start();
    const unsubscribe = editor.subscribe((state) => this.canvasChanged(state));

    return () => {
      unsubscribe();
      this.flush();
      this.cancel();

      if (this.editor === editor) this.editor = undefined;
    };
  }
  canvasChanged(state: SerializedEditorState) {
    if (this.applying || !this.editable()) return;

    try {
      const source = this.codec.encode(state);

      if (source === this.latestCanonical && this.snapshot.recovery?.kind !== "canvas") return;
      this.latestCanonical = source;
      this.pending = source;
      this.cancel();
      this.change({ source, committed: source, state, status: "saving" });
      this.timer = setTimeout(() => this.flush(), 500);
    } catch (error) {
      this.fail(error, { kind: "canvas", original: JSON.stringify(state) });
    }
  }
  flush = () => {
    this.cancel();

    if (
      this.pending === undefined ||
      this.snapshot.dirty ||
      this.snapshot.conflict ||
      !this.snapshot.valid ||
      this.replacementPending()
    )
      return;

    try {
      if (this.detectConflict()) return;
      this.migrationBackup();

      if (this.migrationOriginal !== undefined && this.detectConflict()) return;
      this.storage.setItem(this.keys.committed, this.pending);
      this.observed = this.pending;

      if (this.observedWorking !== null) {
        this.storage.removeItem(this.keys.working);
        this.observedWorking = null;
      }

      const committed = this.pending;
      this.pending = undefined;
      this.needsSave = false;
      this.migrationOriginal = undefined;
      this.change({
        committed,
        source: committed,
        status: "saved",
        error: undefined,
        recovery: undefined,
      });
    } catch (error) {
      this.fail(error);
    }
  };
  edit = (source: string) => {
    if (this.replacementPending()) return;

    // Flush the last canvas edit first so Discard always returns to the visible form.
    if (!this.snapshot.dirty) this.flush();
    this.cancel();
    const dirty = source !== this.snapshot.committed || !this.snapshot.valid;
    this.change({
      source,
      dirty,
      status: this.snapshot.conflict ? "conflict" : "source",
      diagnostics: [],
    });

    if (!this.snapshot.conflict) this.persistBuffer();
  };
  apply = () => {
    this.cancel();

    if (this.snapshot.conflict || this.replacementPending()) return false;
    let prepared: PreparedSource;

    try {
      prepared = this.codec.prepare(this.snapshot.source);
    } catch (error) {
      this.change({
        diagnostics: error instanceof SourceError ? error.diagnostics : [diagnostic(reason(error))],
        error: reason(error),
        status: "source",
      });

      return false;
    }

    if (this.keys.replacementJournal) {
      const result = this.replacePreparedInternal(
        prepared,
        this.captureReplacementToken(),
        {},
        true,
      );

      if (result.status !== "committed" && !this.snapshot.recovery && !this.snapshot.conflict)
        this.fail(result.message);

      return result.status === "committed";
    }

    try {
      const apply = prepared.mode === "source" ? undefined : this.editor?.prepare(prepared.state);

      if (this.detectConflict()) return false;
      this.migrationBackup(this.migrationOriginal ?? prepared.migrationOriginal);

      if (this.migrationOriginal !== undefined && this.detectConflict()) return false;
      this.storage.setItem(this.keys.committed, prepared.source);
      this.observed = prepared.source;
      const changed = prepared.source !== this.latestCanonical || !this.snapshot.valid;
      this.applying = true;

      try {
        if (changed) apply?.();
      } finally {
        this.applying = false;
      }

      this.pending = undefined;
      this.needsSave = false;
      this.migrationOriginal = undefined;
      this.latestCanonical = prepared.source;
      this.change({
        mode: prepared.mode ?? "visual",
        state: prepared.state,
        source: prepared.source,
        committed: prepared.source,
        dirty: false,
        valid: true,
        status: "saved",
        error: undefined,
        recovery: undefined,
        diagnostics: prepared.diagnostics,
      });
      this.persistBuffer();

      return true;
    } catch (error) {
      this.fail(error);

      return false;
    }
  };
  captureReplacementToken = (): DraftReplacementToken => {
    const token = Object.freeze({ source: this.latestCanonical });
    this.tokens.set(token, {
      snapshot: this.snapshot,
      canonical: this.latestCanonical,
      observed: this.observed,
      working: this.observedWorking,
    });

    return token;
  };
  replacePrepared = (
    prepared: PreparedSource,
    token: DraftReplacementToken,
    options: ReplacementOptions = {},
  ): ReplacementResult => this.replacePreparedInternal(prepared, token, options, false);
  private replacementReady(
    token: DraftReplacementToken,
    options: ReplacementOptions,
    allowSource: boolean,
  ) {
    const captured = this.tokens.get(token);

    if (
      !captured ||
      captured.snapshot !== this.snapshot ||
      captured.canonical !== this.latestCanonical ||
      captured.observed !== this.observed ||
      captured.working !== this.observedWorking
    )
      throw Error(
        "This draft changed while the replacement was being prepared. Prepare it again before applying.",
      );

    if (this.replacementPending())
      throw Error("Resolve the pending replacement before starting another one.");

    if (
      this.snapshot.conflict ||
      (!allowSource && (!this.snapshot.valid || this.snapshot.dirty || this.snapshot.recovery))
    )
      throw Error("Resolve the current draft before applying a replacement.");

    if (
      !allowSource &&
      (this.pending !== undefined || this.needsSave || this.snapshot.status !== "saved")
    )
      throw Error("Save the current draft before applying a replacement.");

    if (options.canCommit && !options.canCommit())
      throw Error("The editor is no longer available for this replacement.");

    if (this.detectConflict()) throw Error("Another tab changed the saved draft.");
  }
  private retainReplacement(replacement: DraftReplacement, message: string) {
    this.cancel();
    this.pending = undefined;
    const conflict = replacement.phase === "conflict";
    this.snapshot = {
      ...this.snapshot,
      replacement,
      status: conflict ? "conflict" : "recovery",
      error: message,
      recovery: { kind: "replacement", original: replacement.journal.prior.source },
    };

    // Recovery must survive an editor/update subscriber which was itself the cause of failure.
    try {
      this.editor?.setEditable(false);
    } catch {}

    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }
  private existingReplacement(remote = false) {
    const key = this.keys.replacementJournal;

    if (!key) throw Error("This host has not configured a replacement journal key.");
    const bytes = this.storage.getItem(key);

    if (bytes === null) return;

    try {
      const replacement = readReplacement(bytes, this.storage.getItem(this.keys.committed));

      if (remote)
        this.remoteReplacement = {
          bytes,
          transactionId: replacement.journal.transactionId,
          previous: this.snapshot,
        };
      this.retainReplacement(
        replacement,
        "Resolve the pending replacement before starting another one.",
      );
    } catch (error) {
      this.change({
        status: "recovery",
        recovery: { kind: "replacement", original: bytes },
        error: reason(error),
      });
    }

    throw Error("An unresolved replacement journal already exists.");
  }
  private replacePreparedInternal(
    prepared: PreparedSource,
    token: DraftReplacementToken,
    options: ReplacementOptions,
    allowSource: boolean,
  ): ReplacementResult {
    let replacement: DraftReplacement | undefined;
    let canonicalCommitted = false;

    try {
      if (prepared.mode !== "source" && this.codec.encode(prepared.state) !== prepared.source)
        throw Error("The prepared editor state does not match its canonical source.");
      const apply = prepared.mode === "source" ? undefined : this.editor?.prepare(prepared.state);
      this.replacementReady(token, options, allowSource);
      this.existingReplacement();
      this.migrationBackup(this.migrationOriginal ?? prepared.migrationOriginal);

      const journal: ReplacementJournal = {
        version: 1,
        transactionId: crypto.randomUUID(),
        prior: {
          committed: this.observed,
          working: this.observedWorking,
          source: this.latestCanonical,
        },
        candidate: prepared.source,
      };

      if (options.original !== undefined) journal.original = options.original;
      replacement = { journal, bytes: JSON.stringify(journal), phase: "uncommitted" };
      this.storage.setItem(this.keys.replacementJournal!, replacement.bytes);
      this.replacementReady(token, options, allowSource);

      if (this.storage.getItem(this.keys.replacementJournal!) !== replacement.bytes)
        throw Error("The replacement recovery record changed before commit.");
      this.storage.setItem(this.keys.committed, prepared.source);
      canonicalCommitted = true;
      this.observed = prepared.source;
      this.applying = true;

      try {
        if (prepared.source !== this.latestCanonical || !this.snapshot.valid) apply?.();
      } finally {
        this.applying = false;
      }

      this.latestCanonical = prepared.source;
      this.pending = undefined;
      this.needsSave = false;
      this.migrationOriginal = undefined;
      replacement = { ...replacement, phase: "cleanup", resolution: "candidate" };
      this.change({
        mode: prepared.mode ?? "visual",
        state: prepared.state,
        source: prepared.source,
        committed: prepared.source,
        dirty: false,
        valid: true,
        status: "saved",
        error: undefined,
        recovery: undefined,
        diagnostics: prepared.diagnostics,
        replacement,
      });

      return {
        status: "committed",
        cleanupPending: !this.retryReplacementCleanup(),
        history: "preserved",
      };
    } catch (error) {
      const message = reason(error);

      if (replacement) {
        try {
          const current = this.storage.getItem(this.keys.committed);
          canonicalCommitted ||=
            current === replacement.journal.candidate &&
            current !== replacement.journal.prior.committed;

          if (this.storage.getItem(this.keys.replacementJournal!) === replacement.bytes) {
            replacement = {
              ...replacement,
              phase:
                current === replacement.journal.candidate
                  ? "committed"
                  : current === replacement.journal.prior.committed
                    ? "uncommitted"
                    : "conflict",
            };
            this.retainReplacement(
              replacement,
              canonicalCommitted
                ? `The draft was saved, but editor replacement needs recovery: ${message}`
                : `The replacement was not committed: ${message}`,
            );
          } else if (canonicalCommitted)
            this.retainReplacement(
              { ...replacement, phase: "conflict" },
              `The saved replacement needs recovery and its recovery record changed: ${message}`,
            );
        } catch {
          this.retainReplacement(
            replacement,
            `The replacement state could not be confirmed: ${message}`,
          );
        }
      }

      return canonicalCommitted
        ? { status: "recovery-required", message }
        : { status: "rejected", message };
    }
  }
  private replacementStorage(replacement: DraftReplacement) {
    const bytes = this.storage.getItem(this.keys.replacementJournal!);

    if (
      bytes !== replacement.bytes ||
      readReplacement(bytes, null).journal.transactionId !== replacement.journal.transactionId
    )
      throw Error(
        "The replacement recovery record changed. Its newer evidence has been preserved.",
      );

    const source = this.storage.getItem(this.keys.committed),
      working = this.storage.getItem(this.keys.working);

    if (source !== replacement.journal.candidate && source !== replacement.journal.prior.committed)
      throw Error("Another tab changed the committed draft. Recovery will not overwrite it.");

    if (working !== null && working !== replacement.journal.prior.working)
      throw Error("Another tab changed the working source. Recovery will not overwrite it.");

    return { source, working };
  }
  /** Cleanup may be retried after quota/storage errors without replacing the editor again. */
  retryReplacementCleanup = () => {
    const replacement = this.snapshot.replacement;

    if (!replacement || replacement.phase !== "cleanup") return false;

    try {
      const { source } = this.replacementStorage(replacement),
        original = replacement.resolution === "original";

      const committed = original
        ? replacement.journal.prior.committed
        : replacement.journal.candidate;

      if (source !== committed)
        throw Error("The committed draft changed before replacement cleanup.");
      const working = original ? replacement.journal.prior.working : null;

      if (this.storage.getItem(this.keys.working) !== working) {
        if (working === null) this.storage.removeItem(this.keys.working);
        else this.storage.setItem(this.keys.working, working);
      }

      this.observedWorking = working;
      this.replacementStorage(replacement);
      this.storage.removeItem(this.keys.replacementJournal!);
      this.observed = committed;
      this.change({
        replacement: undefined,
        recovery: undefined,
        conflict: undefined,
        error: undefined,
        source: working ?? this.snapshot.committed,
        dirty: working !== null && working !== committed,
        status: working !== null && working !== committed ? "source" : "saved",
      });

      return true;
    } catch (error) {
      this.retainReplacement(
        replacement,
        `The content was committed, but recovery cleanup is still pending: ${reason(error)}`,
      );

      return false;
    }
  };
  recoverReplacement = (
    resolution: "candidate" | "original",
    options: Pick<ReplacementOptions, "canCommit"> = {},
  ): ReplacementResult => {
    const replacement = this.snapshot.replacement;

    if (!replacement)
      return {
        status: "rejected",
        message: "There is no recoverable replacement.",
      };
    this.remoteReplacement = undefined;
    let committed = false;

    try {
      const source =
        resolution === "candidate"
          ? replacement.journal.candidate
          : replacement.journal.prior.source;

      const prepared = this.codec.prepare(source);
      const apply = prepared.mode === "source" ? undefined : this.editor?.prepare(prepared.state);

      if (options.canCommit && !options.canCommit())
        throw Error("The editor is no longer available for recovery.");
      this.replacementStorage(replacement);

      const canonical =
        resolution === "candidate"
          ? replacement.journal.candidate
          : replacement.journal.prior.committed;

      if (canonical === null) this.storage.removeItem(this.keys.committed);
      else this.storage.setItem(this.keys.committed, canonical);
      committed = true;
      this.observed = canonical;
      this.applying = true;

      try {
        apply?.();
      } finally {
        this.applying = false;
      }

      this.latestCanonical = prepared.source;
      this.pending = undefined;
      this.needsSave = false;
      this.migrationOriginal = prepared.migrationOriginal;
      this.change({
        mode: prepared.mode ?? "visual",
        state: prepared.state,
        source,
        committed: source,
        dirty: false,
        valid: true,
        diagnostics: prepared.diagnostics,
        conflict: undefined,
        replacement: { ...replacement, phase: "cleanup", resolution },
        recovery: undefined,
        error: undefined,
        status: "saved",
      });

      return {
        status: "committed",
        cleanupPending: !this.retryReplacementCleanup(),
        history: "preserved",
      };
    } catch (error) {
      const message = reason(error);
      this.retainReplacement(replacement, `Replacement recovery is unfinished: ${message}`);

      return committed ? { status: "recovery-required", message } : { status: "rejected", message };
    }
  };
  discard = () => {
    if (!this.snapshot.valid || this.snapshot.conflict || this.replacementPending()) return;
    this.cancel();

    if (this.needsSave) this.pending = this.snapshot.committed;
    this.change({
      source: this.snapshot.committed,
      dirty: false,
      status: this.pending ? "saving" : "saved",
      diagnostics: [],
      error: undefined,
    });

    if (this.persistBuffer()) this.flush();
  };
  retry = () => {
    if (this.replacementPending()) {
      this.retryReplacementCleanup();

      return;
    }

    if (this.snapshot.conflict || !this.snapshot.valid) return;

    if (this.snapshot.recovery?.kind === "migration") {
      if (this.snapshot.dirty) this.apply();
      else {
        this.pending ??= this.snapshot.committed;
        this.flush();
      }
    } else if (this.snapshot.recovery?.kind === "canvas") {
      try {
        this.canvasChanged(this.editor?.getState() ?? JSON.parse(this.snapshot.recovery.original));
        this.flush();
      } catch (error) {
        this.fail(error);
      }
    } else if (this.snapshot.dirty) this.persistBuffer();
    else if (this.persistBuffer()) {
      this.pending = this.snapshot.source;
      this.flush();
    }
  };
  externalChange = (key: string | null) => {
    if (
      key !== null &&
      key !== this.keys.committed &&
      key !== this.keys.working &&
      key !== this.keys.replacementJournal
    )
      return;

    if (this.replacementPending()) {
      const remote = this.remoteReplacement,
        replacement = this.snapshot.replacement;

      if (
        !remote ||
        !replacement ||
        remote.bytes !== replacement.bytes ||
        remote.transactionId !== replacement.journal.transactionId
      )
        return;

      try {
        const journal = this.storage.getItem(this.keys.replacementJournal!);

        if (
          journal !== null ||
          this.storage.getItem(this.keys.committed) !== replacement.journal.candidate ||
          this.storage.getItem(this.keys.working) !== null
        )
          return;
        this.remoteReplacement = undefined;
        // The other tab completed its own transaction. Keep this canvas and return to the
        // ordinary version choice; observing a journal never authorizes replacing it.
        this.snapshot = remote.previous;

        if (!this.detectConflict()) this.change({});
      } catch (error) {
        this.retainReplacement(
          replacement,
          `The other tab's replacement could not be confirmed: ${reason(error)}`,
        );
      }

      return;
    }

    if (this.keys.replacementJournal && (key === null || key === this.keys.replacementJournal)) {
      try {
        this.existingReplacement(true);
      } catch {
        return;
      }
    }

    try {
      this.detectConflict();
    } catch (error) {
      this.fail(error);
    }
  };
  useLocal = () => {
    if (!this.snapshot.conflict || this.replacementPending()) return;

    try {
      this.observed = this.storage.getItem(this.keys.committed);
      this.observedWorking = this.storage.getItem(this.keys.working);
      this.change({
        conflict: undefined,
        error: undefined,
        status: this.snapshot.dirty ? "source" : "saving",
      });

      if (this.snapshot.dirty) this.persistBuffer();
      else if (this.persistBuffer()) {
        this.pending = this.snapshot.source;
        this.flush();
      }
    } catch (error) {
      this.fail(error);
    }
  };
  useExternal = () => {
    if (!this.snapshot.conflict || this.replacementPending()) return false;
    const previous = this.snapshot.source;

    try {
      const source = this.storage.getItem(this.keys.committed),
        working = this.storage.getItem(this.keys.working);

      if (source === null) {
        this.change({
          conflict: { source, working },
          status: "conflict",
          error:
            "The saved version was removed in another tab. Your current draft is still available. Choose “Keep my version” to restore it, or download a copy before leaving.",
        });

        return false;
      }

      this.observed = source;
      this.observedWorking = working;
      this.pending = undefined;
      const prepared = this.codec.prepare(source);
      const apply = prepared.mode === "source" ? undefined : this.editor?.prepare(prepared.state);
      this.applying = true;

      try {
        apply?.();
      } finally {
        this.applying = false;
      }

      this.latestCanonical = prepared.source;
      const committed = prepared.migrated ? prepared.source : source;
      const dirty = working !== null && working !== source;
      this.needsSave = !!prepared.migrated;
      this.migrationOriginal = prepared.migrationOriginal;
      this.change({
        mode: prepared.mode ?? "visual",
        state: prepared.state,
        source: dirty ? working! : committed,
        committed,
        dirty,
        valid: true,
        status: dirty ? "source" : prepared.migrated ? "saving" : "saved",
        diagnostics: prepared.diagnostics,
        conflict: undefined,
        error: undefined,
        previous,
        recovery: undefined,
      });

      if (prepared.migrated && !dirty) {
        this.pending = committed;
        this.flush();
      }

      return true;
    } catch (error) {
      const source = this.observed ?? "";
      this.change({
        mode: "source",
        state: undefined,
        source: this.observedWorking ?? source,
        committed: source,
        dirty: this.observedWorking !== null,
        valid: false,
        status: "recovery",
        conflict: undefined,
        error: reason(error),
        diagnostics: error instanceof SourceError ? error.diagnostics : [diagnostic(reason(error))],
        recovery: { kind: "markdown", original: source },
        previous,
      });

      return false;
    }
  };
}
