import { createEditorSession, type EditorSession } from "../editor/core/session";

// The document on screen and the two most recently before it keep their views; a fixed bound, not a setting
const MOUNTED_VIEWS = 3;

/**
 * The documents whose views stay mounted once `id` comes on screen, most recent first: it and the two before it, and
 * any older one with unsaved work or a pending save. The others close.
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
 * selection. A page whose server version changed since its view closed opens with a fresh session.
 */
export class DocumentSessions {
  private kept = new Map<string, { session: EditorSession; closedOn?: string | null }>();

  /** The document's session, begun the first time its view opens. */
  get(id: string) {
    const entry = this.kept.get(id) ?? { session: createEditorSession() };
    this.kept.set(id, entry);

    return entry.session;
  }

  /** Its clean view closes on this API version. */
  close(id: string, version: string | null) {
    const entry = this.kept.get(id);

    if (entry) entry.closedOn = version;
  }

  /** Reopening against a different API version drops the old undo/selection session. */
  open(id: string, version: string | null) {
    const entry = this.kept.get(id);

    if (entry?.closedOn === undefined) return;

    if (entry.closedOn === version) entry.closedOn = undefined;
    else this.kept.delete(id);
  }

  forget(id: string) {
    this.kept.delete(id);
  }
}
