import type { ReactNode } from "react";
import { Banner } from "./banner";
import { Button } from "./button";

/** Retry notice for a failed refresh while the last successful result remains visible. */
export function RefreshFailure({
  inset,
  pending,
  pendingLabel,
  onRetry,
  children,
}: {
  /** `card` inside a card, such as over a list's rows. */
  inset?: "bar" | "card";
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
