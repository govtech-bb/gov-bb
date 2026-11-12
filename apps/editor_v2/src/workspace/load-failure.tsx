import { Link, useRouterState } from "@tanstack/react-router";
import { useLayoutEffect, useRef } from "react";
import { ApiFailure } from "../api/client";
import type { ListBlockedReason } from "../api/list-load-state";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";

/**
 * A list the content API didn't give: why, for the reason it gave, and the way on. An ended session signs in again and
 * comes back here; anything else is tried again.
 */
export function LoadFailure({
  noun,
  title = `We could not load ${noun}`,
  error,
  retrying,
  retry,
}: {
  /** What the list holds, such as “categories”. */
  noun: string;
  /** What failed, when it isn't the list by its noun. */
  title?: string;
  error: Error | null;
  retrying: boolean;
  retry: () => void;
}) {
  const status = error instanceof ApiFailure ? error.status : undefined;

  return (
    <BlockedLoadFailure
      noun={noun}
      title={title}
      reason={status === 401 ? "session-ended" : status === 403 ? "no-access" : "unreachable"}
      retrying={retrying}
      retry={retry}
    />
  );
}

/** A blocked list's reason and way on; non-list loads keep their existing wording through LoadFailure. */
export function BlockedLoadFailure({
  noun,
  title = `We could not load ${noun}`,
  reason,
  retrying,
  retry,
}: {
  noun: string;
  title?: string;
  reason: ListBlockedReason;
  retrying: boolean;
  retry: () => void;
}) {
  const href = useRouterState({ select: (state) => state.location.href });
  const again = useRef<HTMLButtonElement>(null);

  // Once what failed loads, this goes, and Try again with it: the screen's content takes the focus from its top
  useLayoutEffect(() => {
    const button = again.current;

    return () => {
      if (button && button === document.activeElement)
        document.getElementById("workspace-content")?.focus();
    };
  }, []);

  return (
    <EmptyState
      tone="error"
      title={title}
      description={
        reason === "session-ended"
          ? `Your session has ended. Sign in again to load ${noun}.`
          : reason === "no-access"
            ? `You do not have access to these ${noun}.`
            : reason === "gone"
              ? `These ${noun} could not be found. They may have been removed, or the address may be wrong.`
              : "Check your connection, then try again."
      }
      actions={
        reason === "session-ended" ? (
          <Button
            variant="secondary"
            render={
              <Link to="/auth" search={{ state: "sign-in", returnTo: href, reason: "provider" }} />
            }
          >
            Sign in again
          </Button>
        ) : (
          <Button ref={again} variant="secondary" pending={retrying} onClick={retry}>
            Try again
          </Button>
        )
      }
    />
  );
}
