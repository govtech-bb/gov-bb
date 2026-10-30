/**
 * A content page: what it is, what the editor may send, and the rules every
 * layer shares about its url, its place in the hierarchy and its publication.
 */

import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

/** Who may see a page, in the database enum's order. */
export const VISIBILITIES = ["public", "preview", "draft"] as const;

/** Parses who may see a page. */
export const Visibility = z.enum(VISIBILITIES);

/** Who may see a page. */
export type Visibility = z.infer<typeof Visibility>;

/**
 * What is left of a page's frontmatter once the fields with columns of their
 * own are taken out: title, description, category, visibility and form_id
 * are columns so filters need no JSON lookup, and are not repeated here.
 */
export const Frontmatter = z.object({
  lede: z.string().optional(),
  stage: z.string().optional(),
  featured: z.boolean().optional(),
  section: z.string().optional(),
  service_type: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  source_url: z.string().optional(),
});

/** The frontmatter fields that did not become columns. */
export type Frontmatter = z.infer<typeof Frontmatter>;

/** Parses a content page's id, a UUID. */
export const PageId = z.guid().brand<"PageId">();

/** A parsed content page id. */
export type PageId = z.infer<typeof PageId>;

/**
 * A page's editor version, which the database owns (`017`): it moves with
 * the live page's content and with every write or review step of its pending
 * revision. Clients send back the version they read, never the next value.
 */
export const PageContentVersion = z
  .number()
  .int()
  .positive()
  .max(2_147_483_647)
  .brand<"PageContentVersion">();
/** A parsed page editor version, not an audit revision or edit-lock generation. */
export type PageContentVersion = z.infer<typeof PageContentVersion>;

/** Parses a page's url: a path with no trailing slash, query or fragment. */
export const PageUrl = z
  .string()
  .max(512)
  .regex(/^\/[^?#]*[^/?#]$/)
  .refine(
    (url) => (segmentsOf(url).at(-1) ?? "").length <= 200,
    "The url's last segment, its slug, can be at most 200 characters.",
  )
  .describe("The site's routing key.");

/** Parses every field of a page its author sets. */
export const PageFields = z.object({
  url: PageUrl,
  category_id: z.guid().nullable(),
  parent_id: PageId.nullable().describe(
    "The page this one sits beneath, in the same category; null for a " +
      "page at the root of its category, which is what the category lists.",
  ),
  title: z.string().min(1).max(300),
  description: z.string().nullable(),
  visibility: Visibility,
  form_id: z.string().max(100).nullable(),
  body_markdown: z.string(),
  frontmatter: Frontmatter,
});

/** Every field of a page its author sets. */
export type PageFields = z.infer<typeof PageFields>;

/** Parses what a write sends: url, title and body, an optional id, and other fields that default when left out. */
export const NewPage = PageFields.partial({
  category_id: true,
  parent_id: true,
  description: true,
  visibility: true,
  form_id: true,
  frontmatter: true,
}).extend({ id: PageId.optional() });

/** A page as the editor sends it. The slug is derived from the url, never sent. */
export type NewPage = z.infer<typeof NewPage>;

/** A page as the editor reads it: its fields, plus what storage records. */
export const PageDocument = PageFields.extend({
  id: PageId,
  slug: z.string().describe("The url's last segment."),
  published_at: z.iso
    .datetime()
    .nullable()
    .describe("When the page first went public; null until it has."),
  created_at: z.iso.datetime(),
  updated_at: z.iso
    .datetime()
    .describe("When the page was last directly saved."),
  version: PageContentVersion.describe(
    "The page's version: send it back to save, delete, submit, reject or " +
      "publish. It moves whenever the page or its pending revision changes.",
  ),
});

/** A page as the editor reads it. */
export type PageDocument = z.infer<typeof PageDocument>;

/**
 * Where a pending revision stands: an editor submits a `draft`, and an
 * approver rejects or publishes a `submitted` one (#3199). Taking the page
 * out of public view while it waits closes it as `discarded` (#3203).
 */
export const REVISION_STATUSES = [
  "draft",
  "submitted",
  "rejected",
  "published",
  "discarded",
] as const;

/** The statuses of a page's one open revision. */
export const OPEN_REVISION_STATUSES = ["draft", "submitted"] as const;

/** Parses where a pending revision stands. */
export const RevisionStatus = z.enum(REVISION_STATUSES);

/**
 * A change to a public page, saved apart from the live page, which citizens
 * keep seeing until an approver publishes the change.
 */
export const PendingRevision = z.object({
  id: z.guid(),
  page_id: PageId,
  status: RevisionStatus,
  fields: PageFields.describe("The page as the change would make it."),
  live_updated_at: z.iso
    .datetime()
    .describe(
      "The live page's `updated_at` this revision was last saved over.",
    ),
  created_by: z.string().describe("The user id of whoever started it."),
  contributors: z
    .array(z.string())
    .describe(
      "The user id of everyone who saved to it, and of whoever submitted " +
        "an earlier, rejected round of it; none of them may approve it.",
    ),
  submitted_by: z
    .string()
    .nullable()
    .describe("The user id of whoever submitted it for review."),
  submitted_at: z.iso.datetime().nullable(),
  decided_by: z
    .string()
    .nullable()
    .describe("The user id of the approver who rejected or published it."),
  decided_at: z.iso.datetime().nullable(),
  comment: z.string().nullable().describe("Why the approver rejected it."),
  created_at: z.iso.datetime(),
  updated_at: z.iso
    .datetime()
    .describe(
      "Moves when its content is saved or it is rejected. To act on it, " +
        "send the page's `version`.",
    ),
});

/** A change to a public page, waiting for an approver. */
export type PendingRevision = z.infer<typeof PendingRevision>;

/** Parses why an approver rejected a revision. */
export const RevisionComment = z.string().trim().min(1).max(2000);

/** One field a revision changes, as the live page has it and as the revision would make it. */
export const FieldChange = z.object({
  field: PageFields.keyof(),
  live: z.unknown(),
  proposed: z.unknown(),
});

/** One field a revision changes. */
export type FieldChange = z.infer<typeof FieldChange>;

/** A pending revision, with what it changes against the live page. */
export const RevisionView = PendingRevision.extend({
  version: PageContentVersion.describe(
    "The page's version, to send back with a review decision.",
  ),
  changes: z
    .array(FieldChange)
    .describe(
      "The fields whose proposed value differs from the live page's, in " +
        "field order. Empty when the revision matches the live page.",
    ),
});

/** A pending revision, with what it changes. */
export type RevisionView = z.infer<typeof RevisionView>;

/** A revision waiting for review, as the review queue lists it (#3202). */
export const ReviewQueueEntry = z.object({
  id: z.guid(),
  page_id: PageId,
  title: z.string().describe("The page's title as the change would make it."),
  url: z.string().describe("The page's url as the change would make it."),
  submitted_by: z.string().describe("The user id of whoever submitted it."),
  submitted_by_name: z
    .string()
    .nullable()
    .describe("Their name, or null when their account is gone."),
  submitted_at: z.iso.datetime(),
  updated_at: z.iso.datetime().describe("When its content was last saved."),
  version: PageContentVersion.describe(
    "The page's version, as `GET /pages/{id}/revision` has it.",
  ),
});

/** A revision waiting for review. */
export type ReviewQueueEntry = z.infer<typeof ReviewQueueEntry>;

/** A page as the editor opens and saves it: the live page with its pending revision, if any, laid over it. */
export const EditorPage = PageDocument.extend({
  pending_revision: z
    .object({
      status: RevisionStatus.exclude(["published", "discarded"]),
      comment: z
        .string()
        .nullable()
        .describe("Why an approver rejected it; null unless rejected."),
    })
    .nullable()
    .describe(
      "Set when the page is public and has a change waiting for an approver, " +
        "or a rejected one that has not been replaced. The fields and " +
        "`updated_at` are then the revision's, and citizens still see the " +
        "live page.",
    ),
});

/** A page as the editor opens and saves it. */
export type EditorPage = z.infer<typeof EditorPage>;

/**
 * Parses what a save sends: every field, since a save replaces the page and
 * defaults none, except `parent_id`. Leaving that out keeps the page's parent,
 * so a client that does not know about the hierarchy cannot detach a
 * sub-page, and so publish it, by omission.
 */
export const SaveFields = PageFields.partial({ parent_id: true });

/** What a save sends. */
export type SaveFields = z.infer<typeof SaveFields>;

/** A page's stored values, as a write sets them. */
export interface PageValues {
  readonly url: string;
  readonly slug: string;
  readonly categoryId: string | null;
  readonly parentId: PageId | null;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: Visibility;
  readonly formId: string | null;
  readonly bodyMarkdown: string;
  readonly frontmatter: Frontmatter;
}

/** A url's path segments: `/a/b` → `["a", "b"]`. */
export function segmentsOf(url: string): string[] {
  return url.split("/").filter(Boolean);
}

/** The slug a bare `/<slug>` url names, or null for a url of more levels. */
export function bareSlugOf(url: string): string | null {
  const segments = segmentsOf(url);
  return segments.length === 1 ? (segments[0] ?? null) : null;
}

/** A page's fields with what a write left out filled in: an unfiled, formless draft at its category's root. */
export function withDefaults(page: NewPage): PageFields {
  return {
    url: page.url,
    category_id: page.category_id ?? null,
    parent_id: page.parent_id ?? null,
    title: page.title,
    description: page.description ?? null,
    visibility: page.visibility ?? "draft",
    form_id: page.form_id ?? null,
    body_markdown: page.body_markdown,
    frontmatter: page.frontmatter ?? {},
  };
}

/** A page's fields as storage keeps them, the slug derived from the url. */
export function pageValues(fields: PageFields): PageValues {
  return {
    url: fields.url,
    slug: segmentsOf(fields.url).at(-1) ?? "",
    categoryId: fields.category_id,
    parentId: fields.parent_id,
    title: fields.title,
    description: fields.description,
    visibility: fields.visibility,
    formId: fields.form_id,
    bodyMarkdown: fields.body_markdown,
    frontmatter: fields.frontmatter,
  };
}

/** A sub-page that names no category takes its parent's. */
export function placedUnder(
  fields: PageFields,
  parentCategoryId: string | null,
): PageFields {
  return fields.parent_id !== null && fields.category_id === null
    ? { ...fields, category_id: parentCategoryId }
    : fields;
}

/** A page cannot sit beneath itself, directly or further down. */
export function cycleOf(
  id: PageId,
  parentId: PageId,
  ancestorIds: readonly string[],
): PageRejected | null {
  return parentId === id || ancestorIds.includes(id)
    ? new PageRejected([
        { field: "parent_id", message: "A page cannot be its own sub-page." },
      ])
    : null;
}

/** What creating a page writes: published now if it starts public. */
export function creationOf(
  id: PageId | undefined,
  fields: PageFields,
  now: Date,
) {
  return {
    id,
    values: pageValues(fields),
    publishedAt: fields.visibility === "public" ? now : null,
  };
}

/**
 * What saving `fields` over the stored page writes. The timestamp moves
 * strictly forward; the database separately advances the content version, and
 * publication is stamped the first time the page goes public and never moves
 * after that.
 */
export function revisionOf(
  current: PageDocument,
  fields: PageFields,
  now: Date,
) {
  const updatedAt = new Date(
    Math.max(now.getTime(), Date.parse(current.updated_at) + 1),
  );
  const publishedAt =
    current.published_at !== null
      ? new Date(current.published_at)
      : fields.visibility === "public"
        ? updatedAt
        : null;
  return { values: pageValues(fields), updatedAt, publishedAt };
}

/**
 * What the editor works on: the live page, or its current revision laid over
 * it. A published revision is the live page, and a discarded one is gone, so
 * neither is laid over.
 */
export function workingCopy(
  live: PageDocument,
  revision: PendingRevision | null,
): EditorPage {
  if (
    revision === null ||
    revision.status === "published" ||
    revision.status === "discarded"
  )
    return { ...live, pending_revision: null };
  return {
    ...live,
    ...revision.fields,
    slug: segmentsOf(revision.fields.url).at(-1) ?? "",
    updated_at: revision.updated_at,
    pending_revision: { status: revision.status, comment: revision.comment },
  };
}

/** A page's own fields, without what storage records. */
export function fieldsOf(page: PageDocument): PageFields {
  return {
    url: page.url,
    category_id: page.category_id,
    parent_id: page.parent_id,
    title: page.title,
    description: page.description,
    visibility: page.visibility,
    form_id: page.form_id,
    body_markdown: page.body_markdown,
    frontmatter: page.frontmatter,
  };
}

/** The fields a revision changes against the live page, in field order. */
export function changesOf(live: PageFields, fields: PageFields): FieldChange[] {
  return PageFields.keyof()
    .options.filter((field) => !isDeepStrictEqual(live[field], fields[field]))
    .map((field) => ({ field, live: live[field], proposed: fields[field] }));
}

/**
 * What saving `fields` into a public page's pending revision writes. Its
 * version moves strictly past both the live page's and the revision's, so a
 * client holding either one conflicts rather than overwriting the other. A
 * save over a rejected revision starts a new draft by the saver, which keeps
 * the rejected one's contributors, and its submitter, as `inheritedFrom`
 * says: it starts from their content.
 */
export function pendingRevisionOf(
  live: PageDocument,
  revision: PendingRevision | null,
  fields: PageFields,
  actorId: string,
  now: Date,
) {
  const versions = [live.updated_at, revision?.updated_at ?? live.updated_at];
  const updatedAt = new Date(
    Math.max(now.getTime(), ...versions.map((at) => Date.parse(at) + 1)),
  );
  const contributors =
    revision?.status === "rejected"
      ? inheritedFrom(revision)
      : (revision?.contributors ?? []);
  return {
    fields,
    liveUpdatedAt: new Date(live.updated_at),
    updatedAt,
    createdBy:
      revision === null || revision.status === "rejected"
        ? actorId
        : revision.created_by,
    contributors: contributors.includes(actorId)
      ? contributors
      : [...contributors, actorId],
  };
}

/**
 * Who a revision started from a rejected one counts as having changed it:
 * the rejected one's contributors and its submitter. None of them may
 * approve the new round (ADR 0079), so resubmitting it under someone else's
 * name can't let its earlier submitter approve it.
 */
export function inheritedFrom(rejected: PendingRevision): string[] {
  const { contributors, submitted_by: submitter } = rejected;
  return submitter === null || contributors.includes(submitter)
    ? [...contributors]
    : [...contributors, submitter];
}

/** One field a write cannot have as sent. */
export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/** A write the rules or the database refused: an unknown category or parent, a taken url, a loop. */
export class PageRejected extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PageRejected" as const;
  /** The refused fields, each with what the editor can do about it. */
  constructor(readonly errors: readonly FieldError[]) {
    super(`${errors.length} validation error(s)`);
  }
}

/** A save named a page that does not exist. */
export class PageNotFound extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PageNotFound" as const;
  /** The id that matched nothing. */
  constructor(readonly id: PageId) {
    super(`No document with id ${id}`);
  }
}

/** A save lost to a write its caller had not read. */
export class PageVersionConflict extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PageVersionConflict" as const;
  /** The page that changed underneath the caller. */
  constructor(readonly pageId: PageId) {
    super(
      "This page was changed somewhere else since you opened it. Reload to see the current version.",
    );
  }
}

/** There is no revision in the state the operation acts on. */
export class RevisionNotFound extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "RevisionNotFound" as const;
}

/**
 * A revision is not in the state the operation needs: a submission of one
 * already waiting for review, or a decision on one never submitted.
 */
export class RevisionStateConflict extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "RevisionStateConflict" as const;
  /** `reason` is the 409's `error`. */
  constructor(
    readonly reason: "under_review" | "not_submitted",
    message: string,
  ) {
    super(message);
  }
}

/** Content storage could not complete an operation. The cause can carry SQL parameters, so it is never logged or sent. */
export class ContentStoreUnavailable extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "ContentStoreUnavailable" as const;
  /** The storage operation that failed, safe to log. */
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`Content storage failed during ${operation}.`, { cause });
  }
}
