import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useState } from "react";
import { ScreenTitle } from "./workspace/screen-title";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";

/** Unexpected route failures stay recoverable without exposing provider details or reloading unsaved work. */
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);

    try {
      await router.invalidate();
      reset();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <ScreenTitle names={["Unable to open this screen"]} />
      <EmptyState
        kind="failed"
        size="page"
        title="Unable to open this screen"
        description="Try again. If you have unsaved changes, keep this tab open rather than refreshing."
        actions={
          <Button variant="secondary" pending={retrying} onClick={() => void retry()}>
            {retrying ? "Trying again…" : "Try again"}
          </Button>
        }
      />
    </>
  );
}
