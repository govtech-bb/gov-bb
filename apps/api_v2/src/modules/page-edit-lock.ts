import { z } from "zod";
import type { Employee, UserId } from "./auth";
import type { PageId } from "./page";
import { Redacted } from "./redacted";
import { err, ok, type Result } from "./result";

const milliseconds = z.number().int().positive().brand<"Milliseconds">();
const LOCK_DURATION_MS = milliseconds.parse(120_000);
const IDLE_PROMPT_MS = milliseconds.parse(600_000);
const IDLE_EXPIRY_MS = milliseconds.parse(720_000);

/** A public acquisition sequence, independent of the page's content version. */
export const PageEditLockGeneration = z
  .number()
  .int()
  .nonnegative()
  .max(2_147_483_647)
  .brand<"PageEditLockGeneration">();
/** Parsed public edit-lock generation; never an ownership credential. */
export type PageEditLockGeneration = z.infer<typeof PageEditLockGeneration>;

/** A fresh random credential for one acquisition, redacted before it reaches application code. */
export const PageEditLockToken = z
  .uuid({ version: "v4" })
  .brand<"PageEditLockToken">()
  .transform((token) => new Redacted(token));
/** Only reveal a page edit-lock token at the persistence or HTTP boundary. */
export type PageEditLockToken = z.infer<typeof PageEditLockToken>;

/** A per-acquisition activity sequence; duplicate heartbeats do not indicate new editing. */
export const PageEditActivitySequence = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .brand<"PageEditActivitySequence">();
/** Parsed meaningful-edit sequence, separate from content and ownership versions. */
export type PageEditActivitySequence = z.infer<typeof PageEditActivitySequence>;

/** Explicit takeover may replace only the generation the caller observed. */
export const AcquirePageEditLock = z.object({
  action: z.enum(["acquire", "takeover"]),
  expectedLockGeneration: PageEditLockGeneration,
});
/** Acquisition intent; renewal cannot be expressed through this command. */
export type AcquirePageEditLock = z.infer<typeof AcquirePageEditLock>;

/** A renewal carries editing activity, not client-controlled timestamps. */
export const RenewPageEditLock = z.object({
  activitySequence: PageEditActivitySequence,
});
/** Parsed edit-lock heartbeat. */
export type RenewPageEditLock = z.infer<typeof RenewPageEditLock>;

const lockStatus = z.object({
  lockGeneration: PageEditLockGeneration,
  serverTime: z.iso.datetime(),
});

/** Public presence never includes credentials, email addresses or login-session identifiers. */
export const PageEditLockStatus = z.discriminatedUnion("state", [
  lockStatus.extend({ state: z.literal("unheld") }),
  lockStatus.extend({
    state: z.literal("held"),
    holderName: z.string(),
    ownedByCaller: z.boolean(),
    lockExpiresAt: z.iso.datetime(),
    lastActivityAt: z.iso.datetime(),
    idlePromptAt: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
    activitySequence: PageEditActivitySequence,
  }),
]);
/** Authoritative server status used for presence and uncertain-acquisition reconciliation. */
export type PageEditLockStatus = z.infer<typeof PageEditLockStatus>;

/** Persisted acquisition claim; callers must check its deadline before treating it as live. */
export interface PageEditLockClaim {
  readonly userId: UserId;
  readonly holderName: string;
  readonly token: PageEditLockToken;
  readonly acquiredAt: Date;
  readonly lockExpiresAt: Date;
  readonly lastActivityAt: Date;
  readonly activitySequence: PageEditActivitySequence;
}

/** Retaining an unheld generation fences delayed acquisition commands. */
export interface PageEditLockRecord {
  readonly lockGeneration: PageEditLockGeneration;
  readonly claim: PageEditLockClaim | null;
}

/** Live ownership requires both the employee and exact acquisition credential. */
export function ownsPageEditLock(
  record: PageEditLockRecord,
  now: Date,
  userId: UserId,
  token: PageEditLockToken,
): boolean {
  const claim = record.claim;
  return (
    claim !== null &&
    claim.lockExpiresAt > now &&
    claim.userId === userId &&
    claim.token.equals(token)
  );
}

/** Produce public presence without serializing the stored employee ID or credential. */
export function describePageEditLock(
  record: PageEditLockRecord,
  now: Date,
  userId: UserId,
  token?: PageEditLockToken,
): PageEditLockStatus {
  const common = {
    lockGeneration: record.lockGeneration,
    serverTime: now.toISOString(),
  };
  const claim = record.claim;
  if (claim === null || claim.lockExpiresAt <= now)
    return { ...common, state: "unheld" };
  return {
    ...common,
    state: "held",
    holderName: claim.holderName,
    ownedByCaller:
      token !== undefined && ownsPageEditLock(record, now, userId, token),
    lockExpiresAt: claim.lockExpiresAt.toISOString(),
    lastActivityAt: claim.lastActivityAt.toISOString(),
    idlePromptAt: new Date(
      claim.lastActivityAt.getTime() + IDLE_PROMPT_MS,
    ).toISOString(),
    idleExpiresAt: new Date(
      claim.lastActivityAt.getTime() + IDLE_EXPIRY_MS,
    ).toISOString(),
    activitySequence: claim.activitySequence,
  };
}

/** Duplicate acquisition returns the live claim unchanged; stale generations never replace later claims. */
export function claimPageEditLock(
  pageId: PageId,
  record: PageEditLockRecord,
  now: Date,
  employee: Employee,
  token: PageEditLockToken,
  command: AcquirePageEditLock,
): Result<PageEditLockRecord, PageEditLockConflict> {
  if (ownsPageEditLock(record, now, employee.id, token)) return ok(record);
  if (
    record.lockGeneration !== command.expectedLockGeneration ||
    (command.action === "acquire" &&
      record.claim !== null &&
      record.claim.lockExpiresAt > now)
  ) {
    return err(new PageEditLockConflict(pageId));
  }
  return ok({
    lockGeneration: PageEditLockGeneration.parse(record.lockGeneration + 1),
    claim: {
      userId: employee.id,
      holderName: employee.name,
      token,
      acquiredAt: now,
      lockExpiresAt: new Date(now.getTime() + LOCK_DURATION_MS),
      lastActivityAt: now,
      activitySequence: PageEditActivitySequence.parse(0),
    },
  });
}

/** Extend only a live claim; repeated activity sequences cannot postpone idle expiry. */
export function extendPageEditLock(
  pageId: PageId,
  record: PageEditLockRecord,
  now: Date,
  userId: UserId,
  token: PageEditLockToken,
  activitySequence: PageEditActivitySequence,
): Result<PageEditLockRecord, PageEditLockLost> {
  const claim = record.claim;
  if (claim === null || !ownsPageEditLock(record, now, userId, token))
    return err(new PageEditLockLost(pageId));
  const lastActivityAt =
    activitySequence > claim.activitySequence ? now : claim.lastActivityAt;
  return ok({
    lockGeneration: record.lockGeneration,
    claim: {
      ...claim,
      lastActivityAt,
      activitySequence:
        activitySequence > claim.activitySequence
          ? activitySequence
          : claim.activitySequence,
      lockExpiresAt: new Date(
        Math.min(
          now.getTime() + LOCK_DURATION_MS,
          lastActivityAt.getTime() + IDLE_EXPIRY_MS,
        ),
      ),
    },
  });
}

/** Superseded release is a no-op; the public generation is retained after a matching release. */
export function clearPageEditLock(
  record: PageEditLockRecord,
  userId: UserId,
  token: PageEditLockToken,
): PageEditLockRecord {
  const claim = record.claim;
  return claim !== null && claim.userId === userId && claim.token.equals(token)
    ? { lockGeneration: record.lockGeneration, claim: null }
    : record;
}

/** A page write omitted its editing-session credential. */
export class PageEditLockRequired extends Error {
  /** Stable ownership-refusal discriminator, distinct from a content conflict. */
  readonly _tag = "PageEditLockRequired" as const;
  /** The page needs an acquired edit lock, not just an employee session. */
  constructor(readonly pageId: PageId) {
    super("Acquire this page's edit lock before saving or deleting it.");
  }
}

/** The supplied acquisition expired or was replaced; its working copy must be retained. */
export class PageEditLockLost extends Error {
  /** Stable ownership-loss discriminator for client reconciliation. */
  readonly _tag = "PageEditLockLost" as const;
  /** Safe recovery guidance contains no rejected credentials. */
  constructor(readonly pageId: PageId) {
    super(
      "This page's edit lock is no longer yours. Your unsaved changes are still in this tab.",
    );
  }
}

/** Another acquisition won, or takeover was based on an outdated public generation. */
export class PageEditLockConflict extends Error {
  /** Stable compare-and-swap refusal discriminator. */
  readonly _tag = "PageEditLockConflict" as const;
  /** Refresh ownership status before offering another explicit acquisition. */
  constructor(readonly pageId: PageId) {
    super(
      "This page's edit lock changed. Check who is editing before trying again.",
    );
  }
}
