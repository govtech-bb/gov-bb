import { useEffect, useState } from "react";
import { isEditVersion, isText } from "../api/client";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { formatDayAndTime } from "../ui/dates";
import type { ServerPageBaseline } from "./page-session";

/** A page's unsaved changes as this browser keeps them: its Markdown, the version it was written over, and when. */
export type UnsavedWork = { markdown: string; version: number; keptAt: string };

const unsavedWorkKey = (pageId: string) => `govbb-editor:unsaved-work:${pageId}`;

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

function keepUnsavedWork(pageId: string, work: UnsavedWork) {
  try {
    localStorage.setItem(unsavedWorkKey(pageId), JSON.stringify(work));
  } catch {
    // Without storage, or with it full, the changes live only in the open page
  }
}

/** Forgets what this browser kept of a page: its changes were saved, or the author gave them up. */
export function forgetUnsavedWork(pageId: string) {
  try {
    localStorage.removeItem(unsavedWorkKey(pageId));
  } catch {
    // Without storage, nothing was kept
  }
}

/**
 * Keeps a page's unsaved changes in this browser as they're made, so a reload, a crash or a closed tab doesn't lose
 * them. Answers with the changes found as the page opened, for the author to restore or discard, and with what marks
 * them answered.
 */
export function useUnsavedWork(pageId: string, markdown: string, base: ServerPageBaseline) {
  const [found, setFound] = useState(() => {
    const kept = readUnsavedWork(pageId);

    // What the page already holds, such as a save whose answer never came, is no change to offer
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

/** Offers back the unsaved changes found as a page opened: a notice under its bar until the author answers. */
export function UnsavedWorkOffer({
  kept,
  onRestore,
  onDiscard,
}: {
  kept: UnsavedWork;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <Banner
      tone="info"
      layout="strip"
      actions={
        <>
          <Button variant="secondary" onClick={onRestore}>
            Restore changes
          </Button>
          <Button onClick={onDiscard}>Discard them</Button>
        </>
      }
    >
      Unsaved changes to this page from {formatDayAndTime(kept.keptAt)} were kept in this browser.
    </Banner>
  );
}
