import { useId } from "react";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { formatDayAndTime } from "../ui/dates";
import type { UnsavedWork } from "./unsaved-work";

/** Recovery waits for an explicit restore or discard; it never replaces the page on load. */
export function UnsavedWorkOffer({
  kept,
  restoreBlocked,
  discardBlocked,
  onRestore,
  onDiscard,
}: {
  kept: UnsavedWork;
  restoreBlocked?: string;
  discardBlocked?: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const reasonId = useId();

  return (
    <Banner
      tone="info"
      layout="strip"
      actions={
        <>
          <Button
            variant="secondary"
            aria-disabled={!!restoreBlocked || undefined}
            aria-describedby={restoreBlocked ? reasonId : undefined}
            onClick={onRestore}
          >
            Restore changes
          </Button>
          <Button aria-disabled={discardBlocked || undefined} onClick={onDiscard}>
            Discard changes…
          </Button>
        </>
      }
    >
      This browser kept your unsaved changes from {formatDayAndTime(kept.keptAt)}.
      {restoreBlocked && <p id={reasonId}>{restoreBlocked}</p>}
    </Banner>
  );
}
