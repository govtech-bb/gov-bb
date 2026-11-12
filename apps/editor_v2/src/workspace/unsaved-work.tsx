import type { SerializedEditorState } from "lexical";
import { useEffect, useState } from "react";
import { isEditVersion, isText } from "../api/client";
import type { ServerPageBaseline } from "../api/writes";

/** Browser recovery keeps Markdown and its write version, not undo history. */
export type UnsavedWork = { markdown: string; version: number; keptAt: string };

const unsavedWorkKey = (pageId: string) => `govbb-editor:unsaved-work:${pageId}`;

/** Undo and redo carry the recovered page's write version without adopting background API versions. */
export function recoveredPageBaseline(base: ServerPageBaseline, state?: SerializedEditorState) {
  const version = state?.root.$?.recoveredPageVersion;

  return isEditVersion(version) && version !== base.page.version
    ? { ...base, page: { ...base.page, version } }
    : base;
}

function readUnsavedWork(pageId: string): UnsavedWork | undefined {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(unsavedWorkKey(pageId)) ?? "null");

    if (
      kept instanceof Object &&
      "markdown" in kept &&
      isText(kept.markdown) &&
      "version" in kept &&
      isEditVersion(kept.version) &&
      "keptAt" in kept &&
      isText(kept.keptAt) &&
      !Number.isNaN(Date.parse(kept.keptAt))
    )
      return { markdown: kept.markdown, version: kept.version, keptAt: kept.keptAt };
  } catch {
    // Without storage, or with something else under the key, there is nothing to offer
  }
}

/** Store a page's recovery copy: its current edits, or an unanswered offer put back in their place. */
export function keepUnsavedWork(pageId: string, work: UnsavedWork) {
  try {
    localStorage.setItem(unsavedWorkKey(pageId), JSON.stringify(work));
  } catch {
    // Without storage, or with it full, the changes live only in the open page
  }
}

/** Remove browser recovery after saving or confirmed discard. */
export function forgetUnsavedWork(pageId: string) {
  try {
    localStorage.removeItem(unsavedWorkKey(pageId));
  } catch {
    // Without storage, nothing was kept
  }
}

/** Keep current edits in storage and retain the initial recovery offer until it is answered. */
export function useUnsavedWork(pageId: string, markdown: string, base: ServerPageBaseline) {
  const [found, setFound] = useState(() => {
    const kept = readUnsavedWork(pageId);

    // A save may have succeeded even if its response never arrived.
    return kept && kept.markdown !== base.markdown ? kept : undefined;
  });

  useEffect(() => {
    if (markdown !== base.markdown)
      keepUnsavedWork(pageId, {
        markdown,
        version: base.page.version,
        keptAt: new Date().toISOString(),
      });
    // What was found stays until it's answered, or newer changes take its place
    else if (!found) forgetUnsavedWork(pageId);
  }, [pageId, markdown, base, found]);

  return [found, () => setFound(undefined)] as const;
}
