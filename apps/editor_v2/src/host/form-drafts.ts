import type { DraftKeys, DraftStorage } from "../persistence/types";
import type { DraftStore } from "../persistence/draft-store";
import { browserDraftStorage, createGovbbDraft, govbbDraftKeys } from "./govbb-draft";

export const ACTIVE_DRAFT_KEY = "govbb-editor:active-draft";

type FormDraftSession = { id: string; previous?: string; store: DraftStore };

type Pointer = { version: 1; id: string; previous?: string };

const validId = (id: unknown): id is string =>
  typeof id === "string" && (id === "original" || /^[a-f0-9-]{36}$/.test(id));

export function formDraftKeys(id: string): DraftKeys {
  if (id === "original") return govbbDraftKeys;

  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Invalid draft identity");
  const prefix = `govbb-editor:forms:${id}`;

  return {
    committed: `${prefix}:markdown`,
    working: `${prefix}:working`,
    previous: `${prefix}:previous`,
    legacy: `${prefix}:legacy`,
    nativeMigrationBackup: `${prefix}:native-original`,
    replacementJournal: `${prefix}:replacement`,
  };
}

function pointer(source: string | null): Pointer {
  if (!source) return { version: 1, id: "original" };
  const parsed: unknown = JSON.parse(source);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("id" in parsed) ||
    !validId(parsed.id) ||
    ("previous" in parsed && !validId(parsed.previous))
  )
    throw Error("The active draft record is invalid");

  const result: Pointer = { version: 1, id: parsed.id };

  if ("previous" in parsed && validId(parsed.previous)) result.previous = parsed.previous;

  return result;
}

export function openFormDraft(storage: DraftStorage = browserDraftStorage): FormDraftSession {
  let active: Pointer;

  try {
    active = pointer(storage.getItem(ACTIVE_DRAFT_KEY));
  } catch {
    active = { version: 1, id: "original" };
  }

  return { ...active, store: createGovbbDraft(storage, formDraftKeys(active.id)) };
}
