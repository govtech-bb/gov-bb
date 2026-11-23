/**
 * A page's history as the editor lists it, read from `change_events`: what
 * happened, who did it, when, and for a change to the live page which fields
 * it changed. Restoring an entry writes a new one (ADR 0135).
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
  restored_from: z
    .int()
    .nullable()
    .describe(
      "For a `reverted` entry, the version it restored; null for any other.",
    ),
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
  readonly restoredFrom: number | null;
}

/** A `change_events` row for a page, as a restore reads it. */
export type PageEvent = Pick<
  PageChangeEvent,
  "versionNo" | "action" | "snapshot"
>;

/** A page's history has no entry with the version a restore named. */
export class VersionNotFound extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "VersionNotFound" as const;
  constructor(readonly versionNo: number) {
    super(`This page has no version ${versionNo} in its history.`);
  }
}

/** A restore named an entry with no page content to bring back. */
export class VersionNotRestorable extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "VersionNotRestorable" as const;
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
    const redacted = event.snapshot.redacted === true;
    const before = previous;
    if (!review) previous = redacted ? null : event.snapshot;
    return {
      version_no: event.versionNo,
      action: event.action,
      actor: event.actor,
      actor_name: event.actorName,
      occurred_at: event.occurredAt.toISOString(),
      changed:
        review || redacted || before === null
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
      restored_from: event.restoredFrom,
    };
  });
  return entries.reverse();
}

/**
 * The page's fields as an entry left them, for a restore to bring back, or
 * why it can't: a review step's snapshot is a revision, a deletion's is the
 * page that went, a redacted one is gone, and a snapshot older than the
 * page's fields doesn't hold them all.
 */
export function restorableFields(
  event: PageEvent,
): PageFields | VersionNotRestorable {
  if (REVIEW_STEPS.has(event.action))
    return new VersionNotRestorable(
      `Version ${event.versionNo} is a review step, not a version of the page.`,
    );
  if (event.action === "deleted")
    return new VersionNotRestorable(
      `Version ${event.versionNo} is the page's deletion.`,
    );
  if (event.snapshot.redacted === true)
    return new VersionNotRestorable(
      `Version ${event.versionNo} was removed from the history.`,
    );
  const fields = PageFields.safeParse(event.snapshot);
  return fields.success
    ? fields.data
    : new VersionNotRestorable(
        `Version ${event.versionNo} was recorded in an older format that can't be restored.`,
      );
}
