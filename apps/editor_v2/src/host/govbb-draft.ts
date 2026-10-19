import { DraftStore, initialDraft } from "../persistence/draft-store";
import type { DraftKeys, DraftStorage } from "../persistence/types";
import { govbbFormCodec } from "../presets/govbb-form";

export const MARKDOWN_KEY = "govbb-editor:draft:markdown:v2";

export const PREVIOUS_MARKDOWN_KEY = "govbb-editor:draft:markdown:v1";

export const WORKING_KEY = "govbb-editor:draft:markdown:working";

export const LEGACY_KEY = "govbb-editor:draft";

export const govbbDraftKeys: DraftKeys = Object.freeze({
  committed: MARKDOWN_KEY,
  working: WORKING_KEY,
  previous: PREVIOUS_MARKDOWN_KEY,
  legacy: LEGACY_KEY,
  nativeMigrationBackup: "govbb-editor:draft:native-original",
  replacementJournal: "govbb-editor:draft:replacement",
});

export const browserDraftStorage: DraftStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

export function createGovbbDraft(
  storage: DraftStorage = browserDraftStorage,
  keys: DraftKeys = govbbDraftKeys,
) {
  // Access storage inside its methods so a blocked browser opens the recovery UI. A form opens only from what the
  // browser holds: with nothing stored, it opens for recovery rather than as a form the author never made.
  const initial = initialDraft(
    storage,
    () => {
      throw new Error(
        "This form’s draft is no longer in this browser. Open a copy of its source to restore it.",
      );
    },
    govbbFormCodec,
    keys,
  );

  return new DraftStore(storage, initial, govbbFormCodec, keys);
}
