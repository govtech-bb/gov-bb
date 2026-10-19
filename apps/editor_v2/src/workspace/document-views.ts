import { createEditorSession, type EditorSession } from "../editor/core/session";

// The document on screen and the two most recently before it keep their views; a fixed bound, not a setting
const MOUNTED_VIEWS = 3;

/**
 * The documents whose views stay mounted once `id` comes on screen, most recent first: it and the two before it, and
 * any older one that can't close yet, such as a draft that couldn't be saved. The others close.
 */
export const keptViews = (
  views: readonly string[],
  id: string,
  closable: (id: string) => boolean,
) =>
  [id, ...views.filter((view) => view !== id)].filter(
    (view, at) => at < MOUNTED_VIEWS || !closable(view),
  );

/**
 * Each document's editor session, kept while its view is closed so it opens again with its undo history and
 * selection. A draft saved differently since its view closed, such as by another tab, opens with a fresh session.
 */
export class DocumentSessions {
  private kept = new Map<string, { session: EditorSession; closedOn?: string | null }>();

  /** The document's session, begun the first time its view opens. */
  get(id: string) {
    const entry = this.kept.get(id) ?? { session: createEditorSession() };
    this.kept.set(id, entry);

    return entry.session;
  }

  /** Its view closes, with its draft saved as `draft`. */
  close(id: string, draft: string | null) {
    const entry = this.kept.get(id);

    if (entry) entry.closedOn = draft;
  }

  /** Its view opens again, with its draft saved as `draft`: if that's not how the view left it, it begins afresh. */
  open(id: string, draft: string | null) {
    const entry = this.kept.get(id);

    if (entry?.closedOn === undefined) return;

    if (entry.closedOn === draft) entry.closedOn = undefined;
    else this.kept.delete(id);
  }

  forget(id: string) {
    this.kept.delete(id);
  }
}
