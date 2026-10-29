import { draftPause } from "../persistence/draft-store";
import type { DraftPause } from "../persistence/types";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { useDraft, useSourceOpen } from "./source-ui";

/** Why editing is paused, and the button that opens the Markdown to settle it. */
function explain(pause: DraftPause, document: string) {
  switch (pause) {
    case "invalid":
      return {
        reason: `This ${document}’s source could not be applied.`,
        fix: "Review Markdown",
      };
    case "source":
      return {
        reason: "Your Markdown changes haven’t been applied.",
        fix: "Review Markdown changes",
      };
  }
}

/**
 * Says that editing is paused, why, and carries the button that settles it. One for
 * both editors, among the document bar's notices: each pause is settled in the Markdown its button opens.
 */
export function PausedNotice({ documentLabel }: { documentLabel: string }) {
  const draft = useDraft();
  const source = useSourceOpen();
  const pause = draftPause(draft);

  if (!pause) return null;
  const { reason, fix } = explain(pause, documentLabel);

  return (
    <Banner
      tone="warning"
      layout="strip"
      title="Editing is paused"
      actions={
        <Button variant="secondary" onClick={() => source.setOpen(true)}>
          {fix}
        </Button>
      }
    >
      {reason}
    </Banner>
  );
}
