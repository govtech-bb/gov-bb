/**
 * Browser-local autosave for the content editor. A page's in-progress edits
 * are persisted to localStorage keyed by its editor target (repo path, or
 * `formId:kind`, or "" for a free new page), so closing or reloading the tab
 * doesn't lose work. Per-browser only — not a cross-device server draft.
 */

const DRAFT_PREFIX = "content-cms:draft:";

export function draftKeyFor(initKey: string): string {
  return `${DRAFT_PREFIX}${initKey}`;
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    // corrupt JSON, blocked storage, or no localStorage (SSR) — no draft.
    return null;
  }
}

export function writeDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/blocked/SSR — best-effort, the editor state still holds it.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
