import {
  ApiFailure,
  CategoryConflict,
  CategoryInUse,
  CategoryOutcomeUnknown,
  CategoryRefused,
  outcomeUnknown,
  type FieldError,
} from "./client";
import { apiMessage } from "./failure-messages";

/** A write's answer, or why it cannot yet be confirmed; screens own the wording. */
export type Outcome<Answer> =
  | { kind: "landed"; answer: Answer }
  | { kind: "invalid"; errors: readonly FieldError[] }
  | { kind: "conflict" | "missing" | "signed-out" | "unknown" }
  | { kind: "forbidden"; message?: string }
  | { kind: "refused"; code?: string; message?: string; detail?: unknown };

/** Read-back is independent of cached queries; only absence returns undefined. */
export type Write<Sent, Answer> = {
  send(sent: Sent): Promise<Answer>;
  readBack(sent: Sent): Promise<Answer | undefined>;
  landed(found: Answer | undefined, sent: Sent): boolean;
};

// Category failures are returned rather than thrown. Successful answers keep their declared shape.
function checkedAnswer<Answer>(answer: Answer): Answer {
  if (answer instanceof Object && "ok" in answer && answer.ok === false && "error" in answer)
    throw answer.error;

  return answer;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch-boundary classification; thrown values are not necessarily API refusals.
function failureOutcome(error: unknown): Outcome<never> {
  if (outcomeUnknown(error) || error instanceof CategoryOutcomeUnknown) return { kind: "unknown" };

  if (!(error instanceof ApiFailure)) return { kind: "unknown" };

  if (error instanceof CategoryInUse)
    return {
      kind: "refused",
      code: "category_in_use",
      message: apiMessage(error),
      detail: error.blockers,
    };

  if (
    error instanceof CategoryConflict ||
    (error.status === 409 && error.code === "version_conflict")
  )
    return { kind: "conflict" };

  if (error instanceof CategoryRefused)
    return { kind: "refused", code: error.code, message: apiMessage(error) };

  if (error.status === 422 || (error.status === 400 && error.code === "validation_failed"))
    return { kind: "invalid", errors: error.errors };

  if (error.status === 404) return { kind: "missing" };

  if (error.status === 401) return { kind: "signed-out" };

  if (error.status === 403) return { kind: "forbidden", message: apiMessage(error) };

  return { kind: "refused", code: error.code, message: apiMessage(error) };
}

/** Freeze one request until settled or forgotten; only an author's press may resend it. */
export function writeAttempt<Sent, Answer>(write: Write<Sent, Answer>) {
  let state: "idle" | "sending" | "checking" | "unsettled" = "idle";
  let frozen: { sent: Sent } | undefined;
  let pending: Promise<Outcome<Answer>> | undefined;

  async function check(sent: Sent): Promise<Outcome<Answer>> {
    state = "checking";

    try {
      const found = checkedAnswer(await write.readBack(sent));

      if (write.landed(found, sent)) {
        // SAFETY: A landed check may accept absence only when its Answer includes undefined (deletion).
        return { kind: "landed", answer: found as Answer };
      }
    } catch {
      // An unsuccessful read cannot settle the earlier write.
    }

    return { kind: "unknown" };
  }

  async function run(sent: Sent, retry: boolean): Promise<Outcome<Answer>> {
    if (retry) {
      const checked = await check(sent);

      if (checked.kind === "landed") return checked;
    }

    state = "sending";

    try {
      return { kind: "landed", answer: checkedAnswer(await write.send(sent)) };
    } catch (error) {
      const outcome = failureOutcome(error);

      return outcome.kind === "unknown" ? check(sent) : outcome;
    }
  }

  return {
    press(next: () => Sent): Promise<Outcome<Answer>> {
      if (pending) return pending;
      const retry = !!frozen;
      frozen ??= { sent: structuredClone(next()) };
      pending = run(frozen.sent, retry).then((outcome) => {
        state = outcome.kind === "unknown" ? "unsettled" : "idle";

        if (state === "idle") frozen = undefined;
        pending = undefined;

        return outcome;
      });

      return pending;
    },
    forget() {
      // Discard cannot unlock an in-flight write or let another request overtake it.
      if (pending) return;
      frozen = undefined;
      state = "idle";
    },
    get state() {
      return state;
    },
  };
}
