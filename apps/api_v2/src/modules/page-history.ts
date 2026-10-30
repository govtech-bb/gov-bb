/**
 * A page's history as the editor lists it, read from `change_events`: what
 * happened, who did it, when, and for a change to the live page which fields
 * it changed. Read-only: there is no restore.
 */

import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { PageFields } from "./page";

/** What happened to a page: a change to the live page, or a review step. */
export const HistoryAction = z.enum([
  "created",
  "updated",
  "published",
  "unpublished",
  "reverted",
  "deleted",
  "submitted",
  "approved",
  "rejected",
  "discarded",
]);

/** One entry in a page's history. */
export const PageHistoryEntry = z.object({
  version_no: z.int(),
  action: HistoryAction,
  actor: z.string().describe("The user id of whoever did it, or `system`."),
  actor_name: z
    .string()
    .nullable()
    .describe("Their name, or null when their account is gone."),
  occurred_at: z.iso.datetime(),
  changed: z
    .array(PageFields.keyof())
    .describe(
      "For a change to the live page, the fields it changed against the " +
        "page's previous entry, in field order. Empty for its creation and " +
        "for a review step, whose snapshot is a revision.",
    ),
  comment: z
    .string()
    .nullable()
    .describe("Why an approver rejected the change; null for any other entry."),
});

/** One entry in a page's history. */
export type PageHistoryEntry = z.infer<typeof PageHistoryEntry>;

/** A `change_events` row for a page, with its actor's name. */
export interface PageChangeEvent {
  readonly versionNo: number;
  readonly action: z.infer<typeof HistoryAction>;
  readonly actor: string;
  readonly actorName: string | null;
  readonly occurredAt: Date;
  readonly snapshot: Readonly<Record<string, unknown>>;
}

const REVIEW_STEPS = new Set([
  "submitted",
  "approved",
  "rejected",
  "discarded",
]);

/** A page's history, newest first, from its events in version order. */
export function historyOf(
  events: readonly PageChangeEvent[],
): PageHistoryEntry[] {
  let previous: Readonly<Record<string, unknown>> | null = null;
  const entries = events.map((event): PageHistoryEntry => {
    const review = REVIEW_STEPS.has(event.action);
    const before = previous;
    if (!review) previous = event.snapshot;
    return {
      version_no: event.versionNo,
      action: event.action,
      actor: event.actor,
      actor_name: event.actorName,
      occurred_at: event.occurredAt.toISOString(),
      changed:
        review || before === null
          ? []
          : PageFields.keyof().options.filter(
              (field) =>
                !isDeepStrictEqual(
                  before[field] ?? null,
                  event.snapshot[field] ?? null,
                ),
            ),
      comment:
        event.action === "rejected" &&
        typeof event.snapshot.comment === "string"
          ? event.snapshot.comment
          : null,
    };
  });
  return entries.reverse();
}
