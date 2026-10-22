import { Link, useRouterState } from "@tanstack/react-router";
import { ApiFailure } from "../api/client";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { TextLink } from "../ui/text-link";

/**
 * A list the content API didn't give: why, for the reason it gave, and the way on. An ended session signs in again and
 * comes back here; anything else is tried again.
 */
export function LoadFailure({
  noun,
  error,
  retrying,
  retry,
}: {
  /** What the list holds, such as “categories”. */
  noun: string;
  error: Error | null;
  retrying: boolean;
  retry: () => void;
}) {
  const href = useRouterState({ select: (state) => state.location.href });
  const status = error instanceof ApiFailure ? error.status : undefined;

  return (
    <EmptyState
      kind="failed"
      title={`We could not load ${noun}`}
      description={
        status === 401
          ? `Your session has ended. Sign in again to load ${noun}.`
          : status === 403
            ? `You do not have access to these ${noun}.`
            : "Check your connection, then try again."
      }
      actions={
        status === 401 ? (
          <TextLink
            render={
              <Link to="/auth" search={{ state: "sign-in", returnTo: href, reason: "provider" }} />
            }
          >
            Sign in again
          </TextLink>
        ) : (
          <Button variant="secondary" pending={retrying} onClick={retry}>
            Try again
          </Button>
        )
      }
    />
  );
}
