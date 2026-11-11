import { listLoadState } from "../api/list-load-state";
import { RefreshFailure } from "../ui/refresh-failure";
import { BlockedLoadFailure } from "./load-failure";

/** List loading and failure sentences; screens own their layout, rows and empty states. */
export function listLoadView<Value>(
  read: {
    data: Value | undefined;
    isError: boolean;
    error: Error | null;
    isFetching: boolean;
    refetch: () => void;
  },
  noun: string,
  refreshNoun = noun,
) {
  const state = listLoadState(read);
  const loadingLabel = `Loading ${noun}…`;
  const retry = () => void read.refetch();

  return {
    state,
    loadingLabel,
    status: state.kind === "loading" ? loadingLabel : null,
    notices: state.kind === "refresh-failed" && (
      <RefreshFailure
        inset="card"
        pending={read.isFetching}
        pendingLabel={`Refreshing ${noun}…`}
        onRetry={retry}
      >
        We could not refresh {refreshNoun}. Showing the last loaded list.
      </RefreshFailure>
    ),
    failure: state.kind === "blocked" && (
      <BlockedLoadFailure
        noun={noun}
        reason={state.reason}
        retrying={read.isFetching}
        retry={retry}
      />
    ),
  };
}
