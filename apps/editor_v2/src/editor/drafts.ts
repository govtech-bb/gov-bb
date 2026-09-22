/**
 * Local drafts.
 *
 * Autosave writes here and nowhere else. Persisting to Postgres is an
 * explicit act — the Save button, or Ctrl/Cmd+S — so a half-finished edit
 * never reaches the row the site is serving.
 *
 * The brief rejected `localStorage` as the spike's *storage*, and rightly:
 * its API is synchronous, which pulls code toward synchronous reads in
 * render paths and `useState` initialisers, and swapping in `fetch` later
 * would mean restructuring every call site. None of that applies to a draft
 * cache. This is read once when a document is opened and written on a timer;
 * it is never the source of truth, never rendered from, and never read back
 * by anything but the editor that wrote it.
 *
 * Every accessor is wrapped, because storage genuinely throws: Safari's
 * private mode, blocked site data, and a full quota all surface as
 * exceptions rather than nulls. A draft that cannot be cached is a lost
 * convenience, never a lost document — the document is in Postgres.
 */

import type { PageDocument } from "@govtech-bb/block-kit";

const PREFIX = "spike:draft:";

export interface LocalDraft {
  /** The `updated_at` this draft was derived from. */
  basedOn: string | null;
  savedAt: string;
  doc: PageDocument;
}

const key = (id: string) => `${PREFIX}${id}`;

export function readDraft(id: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    // A draft from an older shape is not worth rescuing.
    if (!parsed?.doc?.body?.blocks) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(
  id: string,
  doc: PageDocument,
  basedOn: string | null,
): boolean {
  try {
    window.localStorage.setItem(
      key(id),
      JSON.stringify({
        basedOn,
        savedAt: new Date().toISOString(),
        doc,
      } satisfies LocalDraft),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(id: string): void {
  try {
    window.localStorage.removeItem(key(id));
  } catch {
    // Nothing to do: the draft is a convenience, not the record.
  }
}
