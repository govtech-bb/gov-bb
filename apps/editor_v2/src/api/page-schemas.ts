import { z } from "zod";

/** Positive content counter returned by the API, independent of editing ownership. */
export const pageContentVersionSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483_647)
  .brand<"PageContentVersion">();

/** A version is retained with the page snapshot that the author reviewed. */
export type PageContentVersion = z.infer<typeof pageContentVersionSchema>;

/** Public acquisition sequence; it cannot authorize a content write. */
export const pageEditLockGenerationSchema = z
  .number()
  .int()
  .nonnegative()
  .max(2_147_483_647)
  .brand<"PageEditLockGeneration">();

/** Public generation used for compare-and-swap acquisition. */
export type PageEditLockGeneration = z.infer<typeof pageEditLockGenerationSchema>;

/** Meaningful editing sequence for one acquisition, not a content or ownership version. */
export const pageEditActivitySequenceSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .brand<"PageEditActivitySequence">();

/** Parsed activity counter carried by heartbeats. */
export type PageEditActivitySequence = z.infer<typeof pageEditActivitySequenceSchema>;

/** Redacts the browser's acquisition credential from ordinary object and JSON diagnostics. */
export class PageEditLockToken {
  readonly #value: string;
  private constructor(value: string) {
    this.#value = value;
  }

  /** Accept only a random UUID credential; invalid external values never become ownership evidence. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The credential constructor is the parsing boundary for external UUID values.
  static parse(value: unknown): PageEditLockToken | undefined {
    const parsed = z.uuid({ version: "v4" }).safeParse(value);

    return parsed.success ? new PageEditLockToken(parsed.data) : undefined;
  }

  /** Reveal only while setting the ownership request header. */
  reveal(): string {
    return this.#value;
  }
  /** Keep interpolated diagnostics safe. */
  toString(): string {
    return "[REDACTED]";
  }
  /** Keep structured diagnostics safe. */
  toJSON(): string {
    return "[REDACTED]";
  }
}

/** Validate the full editor page response before it becomes a save baseline. */
export const apiPageSchema = z.object({
  id: z.guid(),
  url: z.string(),
  slug: z.string(),
  category_id: z.guid().nullable(),
  parent_id: z.guid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(["public", "preview", "draft"]),
  form_id: z.string().nullable(),
  body_markdown: z.string(),
  frontmatter: z.object({
    lede: z.string().optional(),
    stage: z.string().optional(),
    featured: z.boolean().optional(),
    section: z.string().optional(),
    service_type: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    source_url: z.string().optional(),
  }),
  published_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  version: pageContentVersionSchema,
});

const lockStatus = z.object({
  lockGeneration: pageEditLockGenerationSchema,
  serverTime: z.iso.datetime(),
});

/** Validate server deadlines and presence; a successful HTTP status alone does not establish ownership. */
export const pageEditLockStatusSchema = z.discriminatedUnion("state", [
  lockStatus.extend({ state: z.literal("unheld") }),
  lockStatus.extend({
    state: z.literal("held"),
    holderName: z.string(),
    ownedByCaller: z.boolean(),
    lockExpiresAt: z.iso.datetime(),
    lastActivityAt: z.iso.datetime(),
    idlePromptAt: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
    activitySequence: pageEditActivitySequenceSchema,
  }),
]);

/** The server's current ownership status, not a replacement for a local content baseline. */
export type PageEditLockStatus = z.infer<typeof pageEditLockStatusSchema>;

/** Expected page request failures; uncertain writes require reconciliation, never automatic retry. */
export type PageApiFailure =
  | { readonly kind: "invalid"; readonly errors: readonly { field: string; message: string }[] }
  | {
      readonly kind: "version-conflict" | "lock-required" | "lock-lost" | "lock-conflict";
      readonly pageId: string;
    }
  | {
      readonly kind:
        | "signed-out"
        | "forbidden"
        | "missing"
        | "unavailable"
        | "invalid-response"
        | "outcome-unknown";
    };

/** Page operations return expected failures as values, including uncertain network outcomes. */
export type PageApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PageApiFailure };

/** Network capability used by one active page's editing-ownership lifecycle. */
export interface PageEditLockApi {
  /** Read presence or reconcile this acquisition without extending its expiry. */
  readPageEditLock(
    pageId: string,
    editLockToken?: PageEditLockToken,
  ): Promise<PageApiResult<PageEditLockStatus>>;
  /** Acquire or explicitly take over exactly the public generation the caller observed. */
  acquirePageEditLock(
    pageId: string,
    editLockToken: PageEditLockToken,
    command: {
      readonly action: "acquire" | "takeover";
      readonly expectedLockGeneration: PageEditLockGeneration;
    },
  ): Promise<PageApiResult<PageEditLockStatus>>;
  /** Renewal requires the live acquisition and cannot reacquire an expired lock. */
  renewPageEditLock(
    pageId: string,
    editLockToken: PageEditLockToken,
    activitySequence: PageEditActivitySequence,
  ): Promise<PageApiResult<PageEditLockStatus>>;
  /** Releasing an expired or superseded acquisition is a harmless no-op. */
  releasePageEditLock(
    pageId: string,
    editLockToken: PageEditLockToken,
  ): Promise<PageApiResult<void>>;
}
