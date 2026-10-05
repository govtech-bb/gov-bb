import type { SerializedEditorState } from "lexical";

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type DraftKeys = Readonly<{
  committed: string;
  working: string;
  previous: string;
  legacy: string;
  nativeMigrationBackup?: string;
  replacementJournal?: string;
}>;

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

export type DraftRecovery = {
  kind: "markdown" | "legacy" | "storage" | "canvas" | "migration" | "replacement";
  original: string;
  existingBackup?: string;
};

export type ReplacementJournal = {
  version: 1;
  transactionId: string;
  prior: { committed: string | null; working: string | null; source: string };
  candidate: string;
  original?: string;
};

export type DraftReplacement = {
  journal: ReplacementJournal;
  bytes: string;
  phase: "uncommitted" | "committed" | "cleanup" | "conflict";
  resolution?: "candidate" | "original";
};

/** Tokens are tied to the store and snapshot which issued them, not just their text. */
export type DraftReplacementToken = Readonly<{ source: string }>;

export type ReplacementOptions = { original?: string; canCommit?: () => boolean };

export type ReplacementResult =
  | { status: "committed"; cleanupPending: boolean; history: "preserved" }
  | { status: "rejected"; message: string }
  | { status: "recovery-required"; message: string };

export type DraftSnapshot = {
  mode: "visual" | "source";
  state?: SerializedEditorState;
  source: string;
  committed: string;
  dirty: boolean;
  valid: boolean;
  status: "saved" | "saving" | "source" | "error" | "recovery" | "conflict";
  diagnostics: DraftDiagnostic[];
  error?: string;
  recovery?: DraftRecovery;
  replacement?: DraftReplacement;
  conflict?: { source: string | null; working: string | null };
  previous?: string;
};

export type InitialDraft = {
  snapshot: DraftSnapshot;
  state?: SerializedEditorState;
  observed: string | null;
  working: string | null;
  needsSave: boolean;
  migrationOriginal?: string;
};

/** Parsing happens before storage writes; the returned closure applies that parsed state. */
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
