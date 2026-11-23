import { ApiFailure } from "./client";

/** Why a list is hidden; only session, access and gone refusals hide an already-loaded list. */
export type ListBlockedReason = "session-ended" | "no-access" | "gone" | "unreachable";

/** A list's read state, independent of whether its loaded data is empty or filtered. */
export type ListLoadState =
  | { kind: "loading" }
  | { kind: "shown" }
  | { kind: "refresh-failed" }
  | { kind: "blocked"; reason: ListBlockedReason };

/** Keep the last loaded list on every failure except 401, 403 and 404, including malformed answers. */
export function listLoadState<Value>(read: {
  data: Value | undefined;
  isError: boolean;
  error: Error | null;
}): ListLoadState {
  if (read.isError) {
    const status = read.error instanceof ApiFailure ? read.error.status : undefined;

    if (status === 401) return { kind: "blocked", reason: "session-ended" };

    if (status === 403) return { kind: "blocked", reason: "no-access" };

    if (status === 404) return { kind: "blocked", reason: "gone" };

    return read.data === undefined
      ? { kind: "blocked", reason: "unreachable" }
      : { kind: "refresh-failed" };
  }

  return read.data === undefined ? { kind: "loading" } : { kind: "shown" };
}
