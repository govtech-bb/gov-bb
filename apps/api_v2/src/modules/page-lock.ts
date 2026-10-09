/**
 * Who is editing a page. Concurrent editing is prevented rather than merged:
 * an editor claims the page when they start, and while their claim lasts
 * anyone else's drafts and saves are refused unless they take it over. A claim
 * lapses five minutes after its holder last touched it, so a closed tab never
 * keeps a page locked for long.
 */

import { z } from "zod";
import type { Employee } from "./auth";

/** How long a claim lasts after its holder last touched it. */
export const LOCK_DURATION_MS = 5 * 60 * 1000;

/** A page's editor, as the caller sees them. */
export const PageLock = z.object({
  holder: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  mine: z.boolean().describe("Whether the caller holds it."),
  expires_at: z.iso.datetime(),
});

/** A page's editor, as the caller sees them. */
export type PageLock = z.infer<typeof PageLock>;

/** A claim as storage keeps it. */
export interface StoredLock {
  readonly holder: Employee;
  readonly touchedAt: Date;
}

const expiryOf = (stored: StoredLock) =>
  new Date(stored.touchedAt.getTime() + LOCK_DURATION_MS);

/** A claim as `caller` sees it. */
export function describeLock(stored: StoredLock, caller: Employee): PageLock {
  return {
    holder: {
      id: stored.holder.id,
      name: stored.holder.name,
      email: stored.holder.email,
    },
    mine: stored.holder.id === caller.id,
    expires_at: expiryOf(stored).toISOString(),
  };
}

/** The claim as `caller` sees it at `now`, or null when there is none or it has lapsed. */
export function lockFor(
  stored: StoredLock | null,
  caller: Employee,
  now: Date,
): PageLock | null {
  return stored === null || expiryOf(stored) <= now
    ? null
    : describeLock(stored, caller);
}

/** Someone else is editing the page. */
export class PageLocked extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PageLocked" as const;
  /** Who holds the page, and until when. */
  constructor(readonly lock: PageLock) {
    super(`${lock.holder.name} is editing this page.`);
  }
}
