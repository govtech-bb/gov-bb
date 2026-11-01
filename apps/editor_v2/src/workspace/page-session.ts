import type { ApiPage } from "../api/client";
import type { DraftStore } from "../persistence/draft-store";

/** The exact page version and submitted Markdown last loaded or saved in this session. */
export type ServerPageBaseline = { page: ApiPage; markdown: string };

/** Mounted page registration; live getters let navigation see edits and pending saves immediately. */
export type PageSession = {
  store: DraftStore;
  getBaseline: () => ServerPageBaseline;
  isSaving: () => boolean;
};

/** Unapplied source and serialization failures count as unsaved, even when applied text still matches. */
export function pageHasUnsavedChanges(session: PageSession) {
  const draft = session.store.getSnapshot();

  return (
    !draft.valid ||
    draft.dirty ||
    draft.status === "error" ||
    draft.committed !== session.getBaseline().markdown
  );
}
