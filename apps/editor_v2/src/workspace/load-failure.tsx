import { Link, useRouterState } from "@tanstack/react-router";
import { ApiFailure } from "../api/client";
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
  const href = useRouterState({ select: (state) => state.location.href });
  const status = error instanceof ApiFailure ? error.status : undefined;

  return (
    <EmptyState
      tone="error"
      title={title}
      description={
        status === 401
          ? `Your session has ended. Sign in again to load ${noun}.`
          : status === 403
            ? `You do not have access to these ${noun}.`
            : "Check your connection, then try again."
      }
      actions={
        status === 401 ? (
          <Button
            variant="secondary"
            render={
              <Link to="/auth" search={{ state: "sign-in", returnTo: href, reason: "provider" }} />
            }
          >
            Sign in again
          </Button>
        ) : (
          <Button variant="secondary" pending={retrying} onClick={retry}>
            Try again
          </Button>
        )
      }
    />
  );
}
