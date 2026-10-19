import type { SerializedEditorState } from "lexical";

export type DraftDiagnostic = {
  code: string;
  message: string;
  severity: "fatal" | "warning";
  line: number;
  column: number;
  sourceKey?: string;
};

export type PreparedSource = {
  source: string;
  diagnostics: DraftDiagnostic[];
  migrated?: boolean;
  migrationOriginal?: string;
} & ({ mode?: "visual"; state: SerializedEditorState } | { mode: "source"; state?: never });

export type VisualPreparedSource = PreparedSource & {
  mode?: "visual";
  state: SerializedEditorState;
};

export type DraftCodec<Prepared extends PreparedSource = PreparedSource> = {
  prepare(source: string): Prepared;
  encode(state: SerializedEditorState): string;
  prepareLegacy(value: unknown): SerializedEditorState;
};

/** Original input retained in memory when parsing or canvas serialization fails. */
export type DraftRecovery = { kind: "markdown" | "canvas"; original: string };

/** Tokens belong to the store and snapshot which issued them, not just their text. */
export type DraftReplacementToken = Readonly<{ source: string }>;

export type ReplacementOptions = { canCommit?: () => boolean };

export type ReplacementResult =
  | { status: "committed"; history: "preserved" }
  | { status: "rejected"; message: string };

/** "ready" means applied to the editor, never saved to a server. */
export type DraftSnapshot = {
  mode: "visual" | "source";
  state?: SerializedEditorState;
  source: string;
  committed: string;
  /** Markdown edits not yet applied to the canvas; not the host's server-save state. */
  dirty: boolean;
  valid: boolean;
  status: "ready" | "source" | "error";
  diagnostics: DraftDiagnostic[];
  error?: string;
  recovery?: DraftRecovery;
};

export type DraftPause = "invalid" | "source";

export type InitialDraft = {
  snapshot: DraftSnapshot;
  state?: SerializedEditorState;
};

/** Parsing happens before replacing state; the returned closure applies that parsed state. */
export type DraftConnection = {
  prepare(state: SerializedEditorState): () => void;
  getState(): SerializedEditorState;
  setEditable(editable: boolean): void;
  subscribe(listener: (state: SerializedEditorState) => void): () => void;
};

export class SourceError extends Error {
  constructor(
    message: string,
    readonly diagnostics: DraftDiagnostic[],
  ) {
    super(message);
  }
}
