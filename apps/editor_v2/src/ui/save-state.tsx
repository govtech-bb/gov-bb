import { Check } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "./badge";
import { Banner } from "./banner";
import { Button } from "./button";

/**
 * Where a document's work stands, in words that say who can see it. A browser draft is only ever saved in this
 * browser. A page from the content API waits in this browser until the author saves it, or publishes it if it's
 * public. Failed is a save that went wrong; paused is saving held back while editing is paused.
 */
export type SaveStatus =
  | "saving"
  | "local"
  | "unsaved"
  | "saved"
  | "unpublished"
  | "published"
  | "failed"
  | "paused";

const labels = new Map<SaveStatus, string>([
  ["saving", "Saving…"],
  ["local", "Saved in this browser"],
  ["unsaved", "Unsaved changes"],
  ["saved", "Saved"],
  ["unpublished", "Unpublished changes"],
  ["published", "Published"],
  ["failed", "Not saved"],
  ["paused", "Saving paused"],
]);

// What's read out once a save the author asked for has gone through
const done = new Map<SaveStatus, string>([
  ["local", "Changes saved in this browser"],
  ["saved", "Changes saved"],
  ["published", "Changes published"],
]);

export type SaveStateProps = {
  status: SaveStatus;
  /** Why it isn't saved: the failure's message, and what's read out as it fails. */
  error?: string;
  /** A newer version elsewhere that stands in the way, told by a notice under the bar: read out as it arrives. */
  conflict?: string;
  /** Tries the save again, from the failure's message. */
  onRetry?: () => void;
  /** Downloads the work, to keep a copy while it can't be saved. */
  onDownload?: () => void;
};

/**
 * What's read out, and only that: a failure, a conflict, or a save the author asked for having gone through. A
 * draft saving itself as the author pauses typing stays silent.
 */
function useAnnouncement({ status, error, conflict }: SaveStateProps) {
  const [message, setMessage] = useState("");
  // A conflict there from the start is read out too, once the live region is there to say it
  const before = useRef<{ status: SaveStatus; conflict?: string }>({ status });

  useEffect(() => {
    const previous = before.current;
    before.current = { status, conflict };

    if (conflict && conflict !== previous.conflict) setMessage(conflict);
    else if (status === previous.status) return;
    else if (status === "failed") setMessage(error ?? labels.get(status) ?? "");
    // Saving with the server is only ever asked for, and so is getting past a failure or a pause
    else if (
      previous.status === "failed" ||
      previous.status === "paused" ||
      (previous.status === "saving" && status !== "local")
    )
      setMessage(done.get(status) ?? "");
    // Emptied, so the next message is read out even if it's the same as the last
    else setMessage("");
  }, [status, error, conflict]);

  return message;
}

/**
 * Where the document's work stands, beside its title: quiet while all is well, a badge when it isn't. It
 * also reads out how saving went, politely and only when it matters, through a live
 * region a dialog leaves exposed.
 */
function SaveStateStatus(props: SaveStateProps) {
  const { status } = props;
  const message = useAnnouncement(props);
  const label = labels.get(status);

  return (
    <>
      {status === "failed" || status === "paused" ? (
        <Badge tone={status === "failed" ? "error" : "warning"}>{label}</Badge>
      ) : (
        <span className="flex items-center gap-1.5 [&>svg]:size-4">
          {(status === "local" || status === "saved" || status === "published") && (
            <Check aria-hidden="true" />
          )}
          {label}
        </span>
      )}
      <span aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  );
}

/**
 * A failed save: why, and the way out, Try again and Download a copy. Edge to edge under the document's bar, or boxed
 * in a dialog. The status beside the title reads it out, even from under a dialog, so this doesn't too.
 */
function SaveStateFailure({
  status,
  error,
  onRetry,
  onDownload,
  layout = "strip",
}: SaveStateProps & { layout?: "strip" | "box" }) {
  if (status !== "failed") return null;

  return (
    <Banner
      tone="error"
      layout={layout}
      role="none"
      actions={
        <>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
          {onDownload && <Button onClick={onDownload}>Download a copy</Button>}
        </>
      }
    >
      {error ?? labels.get(status)}
    </Banner>
  );
}

/** A document's save state: Status beside its title, and Failure among its notices. Both take the same props. */
export const SaveState = { Status: SaveStateStatus, Failure: SaveStateFailure };
