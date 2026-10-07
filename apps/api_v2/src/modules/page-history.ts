/**
 * A page's change log: each change's version, what it did, who made it and
 * when, and the page as that change left it.
 */

import { z } from "zod";
import { PageDocument, PageId } from "./page";

/** What a change did to a page. */
export const CHANGE_ACTIONS = [
  "created",
  "updated",
  "published",
  "reverted",
  "deleted",
] as const;

/** One entry in a page's change log. */
export const PageVersion = z.object({
  version: z.int().positive(),
  action: z.enum(CHANGE_ACTIONS),
  actor: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
    })
    .describe(
      "Name and email are null for an actor with no account: the seed, the " +
        "local sign-in bypass, or a user since deleted.",
    ),
  occurred_at: z.iso.datetime(),
});

/** One entry in a page's change log. */
export type PageVersion = z.infer<typeof PageVersion>;

/**
 * A page as a change left it. Entries from before pages had parents have no
 * `parent_id`, and it stays absent rather than null: a save that leaves it
 * out keeps the parent, where null would detach the page.
 */
export const PageSnapshot = PageDocument.extend({
  parent_id: PageId.nullable().optional(),
});

/** A page as a change left it. */
export type PageSnapshot = z.infer<typeof PageSnapshot>;

/** A logged snapshot as a page, or null for one recorded in a shape since retired. */
export function readSnapshot(recorded: unknown): PageSnapshot | null {
  const parsed = PageSnapshot.safeParse(recorded);
  return parsed.success ? parsed.data : null;
}
