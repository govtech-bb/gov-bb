import {
  asString,
  contentSlug,
  isContentPath,
  isValidContentSlug,
  CONTENT_ROOT,
  type FormState,
} from "../../lib/content";
import type { ContentPageSummary } from "../../server/content";

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

export function writeDraft<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("content-draft-change"));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
    window.dispatchEvent(new Event("content-draft-change"));
  } catch {
    /* ignore */
  }
}

export function createPageDraft(path: string, state: FormState): void {
  if (
    !isContentPath(path) ||
    !isValidContentSlug(path.slice(CONTENT_ROOT.length, -3))
  )
    throw new Error("Choose a valid page URL.");
  const key = draftKeyFor(path);
  // Check again at apply time: another tab may have created this draft during review.
  if (
    localStorage.getItem(key) !== null ||
    newPageDrafts().some((page) => contentSlug(page.path) === contentSlug(path))
  )
    throw new Error(
      "A draft already uses this URL. Open it from the service or choose another name.",
    );
  if (!writeDraft(key, { version: 2, revision: { source: "absent" }, state }))
    throw new Error(
      "The draft could not be saved on this device. Free some browser storage and try again.",
    );
}

export function newPageDrafts(): ContentPageSummary[] {
  const pages: ContentPageSummary[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)!;
      if (!key.startsWith(DRAFT_PREFIX)) continue;
      const path = key.slice(DRAFT_PREFIX.length);
      if (!isContentPath(path)) continue;
      const draft = readDraft<{
        version?: number;
        revision?: { source?: string };
        state?: Record<string, unknown>;
      }>(key);
      if (
        draft?.version !== 2 ||
        draft.revision?.source !== "absent" ||
        !draft.state
      )
        continue;
      const state = draft.state;
      pages.push({
        path,
        title: asString(state.title) || "Untitled page",
        category: asString(state.category),
        subcategory: asString(state.subcategory),
        visibility: "draft",
        formId: asString(state.formId),
        hasFormButton: state.linkType === "form" && !!state.formId,
        isLocalDraft: true,
      });
    }
  } catch {
    // Existing server pages remain available if browser storage is blocked.
  }
  return pages;
}
