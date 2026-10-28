import type { ReactNode } from "react";
import { Banner } from "./banner";
import { Button } from "./button";

/**
 * Content that couldn't be read again while what was read before still shows, such as a list after a lost
 * connection: a warning strip that says so and what's on screen, and Try again, which turns while it works.
 */
export function RefreshFailure({
  inset,
  pending,
  pendingLabel,
  onRetry,
  children,
}: {
  /** `card` inside a card, such as over a list's rows. */
  inset?: "bar" | "card";
  /** Trying again. */
  pending: boolean;
  /** Its words meanwhile, such as “Refreshing services…”. */
  pendingLabel?: string;
  onRetry: () => void;
  /** What failed and what shows instead, such as “We could not refresh services. Showing the last loaded list.” */
  children: ReactNode;
}) {
  return (
    <Banner
      tone="warning"
      layout="strip"
      inset={inset}
      actions={
        <Button variant="secondary" pending={pending} pendingLabel={pendingLabel} onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {children}
    </Banner>
  );
}
