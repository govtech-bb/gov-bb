import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";
import {
  NotApprover,
  SelfApproval,
  type Employee,
  type UserId,
} from "../modules/auth";
import {
  changesOf,
  creationOf,
  cycleOf,
  PageConflict,
  PageNotFound,
  PageVersionRequired,
  pendingRevisionOf,
  fieldsOf,
  inheritedFrom,
  placedUnder,
  revisionOf,
  RevisionNotFound,
  RevisionStateConflict,
  withDefaults,
  workingCopy,
  type ContentStoreUnavailable,
  type EditorPage,
  type NewPage,
  type PageDocument,
  type PageFields,
  type PageId,
  PageRejected,
  type PageValues,
  type PendingRevision,
  type RevisionView,
  type SaveFields,
} from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import type { LastEditedBy } from "../modules/content-attribution";
import { chunkMarkdown, type SearchChunk } from "../modules/search-text";
import {
  NO_REVIEW_NOTIFICATIONS,
  type ReviewNotifier,
} from "./review-notifications";

/** Wall-clock time for the stamps a write records. */
export type Clock = () => Date;

/** A page as an insert stores it. */
export interface NewPageRecord {
  readonly id: PageId | undefined;
  readonly values: PageValues;
  readonly publishedAt: Date | null;
}

/** A page as a save overwrites it. */
export interface PageRevision {
  readonly values: PageValues;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
}

/** A public page's pending revision as a save writes it. */
export interface PendingRevisionRecord {
  readonly fields: PageFields;
  readonly liveUpdatedAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly contributors: readonly string[];
}

/** A review step a revision takes, by whom and when. */
export type RevisionMark =
  | { readonly status: "submitted"; readonly by: string; readonly at: Date }
  | {
      readonly status: "rejected";
      readonly by: string;
      readonly at: Date;
      readonly comment: string;
    }
  | {
      readonly status: "published" | "discarded";
      readonly by: string;
      readonly at: Date;
    };

/** The persistence the editor's page operations need. */
export interface PageRecords {
  /**
   * Run `work` as one transaction on behalf of `actorId`, whom storage
   * records against every change it makes, after taking the shared content
   * advisory lock; an error result rolls back everything it wrote.
   */
  atomically<R extends Result<unknown, Error>>(
    actorId: UserId,
    work: (records: PageRecords) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>>;
  /** The actor of the page's highest-version event, including review steps; null without history. */
  lastEditedBy(
    id: PageId,
  ): Promise<Result<LastEditedBy, ContentStoreUnavailable>>;
  /** The page with this id, or null. */
  find(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>>;
  /** The page with this id, held against other writers until the transaction ends, or null. */
  lock(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>>;
  /** Refuse a new page URL owned by a category, including an empty category. */
  checkPageUrl(
    url: string,
  ): Promise<Result<void, PageRejected | ContentStoreUnavailable>>;
  /** The ids of the pages above this one; a loop in the data ends rather than repeating. */
  ancestorIds(
    pageId: PageId,
  ): Promise<Result<string[], ContentStoreUnavailable>>;
  /** A page's category, or null when it has none or there is no such page. */
  categoryOf(
    pageId: PageId,
  ): Promise<Result<string | null, ContentStoreUnavailable>>;
  /** Insert a page; storage refuses an unknown category or parent, a mismatched category, and a taken url or id. */
  insert(
    page: NewPageRecord,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>>;
  /** Overwrite a page that exists; storage refuses what an insert would. */
  replace(
    id: PageId,
    page: PageRevision,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>>;
  /** Refuse what `replace` would, without keeping the write. */
  checkReplace(
    id: PageId,
    page: PageRevision,
  ): Promise<Result<void, PageRejected | ContentStoreUnavailable>>;
  /** File a page's uncategorised sub-pages, all the way down, under its category. */
  fileUncategorisedBelow(
    id: PageId,
    categoryId: string,
  ): Promise<Result<void, ContentStoreUnavailable>>;
  /**
   * A page's open revision, draft or submitted; otherwise its latest rejected
   * one while the live page has not moved since it was saved over; or null.
   */
  currentRevision(
    pageId: PageId,
  ): Promise<Result<PendingRevision | null, ContentStoreUnavailable>>;
  /** Start a page's open revision, or overwrite it, keeping who started it. */
  writeRevision(
    pageId: PageId,
    revision: PendingRevisionRecord,
  ): Promise<Result<PendingRevision, ContentStoreUnavailable>>;
  /** Discard a page's open revision, if it has one. */
  dropRevision(pageId: PageId): Promise<Result<void, ContentStoreUnavailable>>;
  /** Move a revision to a review status, recording who moved it; a rejection moves its version to its time, and a discard closes it. */
  markRevision(
    revisionId: string,
    mark: RevisionMark,
  ): Promise<Result<PendingRevision, ContentStoreUnavailable>>;
  /** Replace a page's search chunks. */
  replaceSearchChunks(
    pageId: PageId,
    chunks: readonly SearchChunk[],
  ): Promise<Result<void, ContentStoreUnavailable>>;
  /** Who changed a page's content since it was last public, or ever when it never was. */
  changedSincePublic(
    id: PageId,
  ): Promise<Result<readonly string[], ContentStoreUnavailable>>;
  /** Delete a page, returning it as it stood, or null when there was none; one with sub-pages is refused. */
  remove(
    id: PageId,
  ): Promise<
    Result<PageDocument | null, PageRejected | ContentStoreUnavailable>
  >;
}

/**
 * The editor's page operations: reads of any visibility, and writes that
 * commit with their search text or not at all, recorded against the
 * employee. Only an
 * approver changes what citizens see: sets a page's visibility, creates one
 * public, or deletes a public one. A save to a public page that keeps it
 * public, whoever makes it, goes into the page's pending revision and leaves
 * the live page as it is (#3198). An editor submits the revision for review,
 * and an approver who neither changed nor submitted it rejects it or
 * publishes it to the live page (#3199). Saves to a revision waiting for
 * review update it, and it keeps waiting (#3203). Making a page public is a
 * direct approver action, by an approver who hasn't changed its content
 * since it was last public, nor creates it public (#3201).
 */
export class PageEditing {
  /**
   * The root supplies content storage and the clock, allows self-approval
   * only for local development under AUTH_BYPASS (ADR 0079), and supplies
   * who hears of a review step once it commits (#3267); nobody, by default.
   */
  constructor(
    private readonly records: PageRecords,
    private readonly clock: Clock,
    private readonly review: { readonly allowSelfApproval: boolean },
    private readonly notifier: ReviewNotifier = NO_REVIEW_NOTIFICATIONS,
  ) {}

  /**
   * The page with this id as the editor works on it: with its pending
   * revision laid over it. Separate reads rather than one snapshot: a save
   * between them leaves this with a version no save matches, so the next save is a
   * conflict, never a lost write.
   */
  async open(
    id: PageId,
  ): Promise<Result<EditorPage | null, ContentStoreUnavailable>> {
    const live = await this.records.find(id);
    if (!live.ok) return live;
    if (live.value === null) return ok(null);
    const revision = await this.records.currentRevision(id);
    if (!revision.ok) return revision;
    return attributedPage(this.records, live.value, revision.value);
  }

  /** The page's current revision and what it changes, or null when it has none. */
  async revision(
    id: PageId,
  ): Promise<Result<RevisionView | null, ContentStoreUnavailable>> {
    const live = await this.records.find(id);
    if (!live.ok) return live;
    if (live.value === null) return ok(null);
    const revision = await this.records.currentRevision(id);
    if (!revision.ok) return revision;
    return ok(revision.value && viewOf(live.value, revision.value));
  }

  /**
   * Create a page where it belongs, stamping publication when it starts
   * public, and index it. Only an approver creates one public, and not one
   * they wrote, which is every one, unless self-approval is allowed.
   */
  create(
    page: NewPage,
    actor: Employee,
  ): Promise<
    Result<
      EditorPage,
      PageRejected | NotApprover | SelfApproval | ContentStoreUnavailable
    >
  > {
    return this.records.atomically(actor.id, async (records) => {
      if (page.visibility === "public" && !actor.roles.includes("approver"))
        return err(new NotApprover());
      // Its author wrote all of it, so another approver makes it public.
      if (page.visibility === "public" && !this.review.allowSelfApproval)
        return err(new SelfApproval(CREATED_PUBLIC));
      const fields = withDefaults(page);
      const invalidContent = markdownRejection(fields);
      if (invalidContent) return err(invalidContent);
      const available = await records.checkPageUrl(page.url);
      if (!available.ok) return available;
      const placed = await place(records, page.id, fields);
      if (!placed.ok) return placed;
      const created = await records.insert(
        creationOf(page.id, placed.value, this.clock()),
      );
      if (!created.ok) return created;
      const indexed = await records.replaceSearchChunks(
        created.value.id,
        chunkMarkdown(created.value.body_markdown),
      );
      return indexed.ok
        ? attributedPage(records, created.value, null)
        : indexed;
    });
  }

  /**
   * Replace a page's fields, and return the page as the editor now works on
   * it. With `expectedUpdatedAt`, a page that has moved on since the caller
   * read it is refused rather than silently discarding whoever wrote first;
   * without it the caller accepts whatever is stored. A public page's version
   * is its pending revision's, when it has one.
   *
   * A save that keeps a public page public goes into its pending revision.
   * A save to a page that is not public writes the page, as it always has.
   *
   * A save to a revision waiting for review updates it in place and it stays
   * submitted (#3203). It must name the version it was made against. The saver joins its contributors, so can't approve
   * it, and its version moves, so an approver holding the earlier one gets a
   * conflict rather than publishing a version they haven't seen.
   *
   * An approver's save that takes a public page out of public view changes
   * only its visibility: every other field it sends is ignored and the live
   * content stays, so no unreviewed content reaches the page that way, to be
   * made public again without review. It closes the page's open revision,
   * keeping #3198's rule that only a public page has one: a draft is
   * dropped, and one waiting for review is marked `discarded`, which the
   * page's history records (#3203). A rejected revision is retired by the
   * live page moving on.
   *
   * Making a page public approves its content, so an approver who changed
   * it since it was last public, in this save or before, is refused: another
   * approver makes it public (#3201).
   */
  save(
    id: PageId,
    fields: SaveFields,
    expectedUpdatedAt: Date | null,
    actor: Employee,
  ): Promise<
    Result<
      EditorPage,
      | PageRejected
      | PageNotFound
      | PageConflict
      | PageVersionRequired
      | NotApprover
      | SelfApproval
      | ContentStoreUnavailable
    >
  > {
    return this.records.atomically(actor.id, async (records) => {
      const locked = await records.lock(id);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (current === null) return err(new PageNotFound(id));
      const pending = await records.currentRevision(id);
      if (!pending.ok) return pending;
      if (expectedUpdatedAt === null && pending.value?.status === "submitted")
        return err(new PageVersionRequired());
      if (
        expectedUpdatedAt !== null &&
        (pending.value ?? current).updated_at !==
          expectedUpdatedAt.toISOString()
      )
        return err(new PageConflict(id));
      if (
        fields.visibility !== current.visibility &&
        !actor.roles.includes("approver")
      )
        return err(new NotApprover());

      const invalidContent = markdownRejection(
        current.visibility === "public" && fields.visibility !== "public"
          ? { ...fieldsOf(current), visibility: fields.visibility }
          : fields,
      );
      if (invalidContent) return err(invalidContent);
      // Past the pending revision's version too, which can run ahead of the
      // clock, so no client holding it matches the page's new one.
      const now = new Date(
        Math.max(
          this.clock().getTime(),
          pending.value === null ? 0 : Date.parse(pending.value.updated_at) + 1,
        ),
      );
      if (current.visibility === "public" && fields.visibility !== "public") {
        // Marked first, so the page's history reads the discard before the
        // unpublish, as it reads an approval before the change it lets live.
        if (pending.value?.status === "submitted") {
          const discarded = await records.markRevision(pending.value.id, {
            status: "discarded",
            by: actor.id,
            at: now,
          });
          if (!discarded.ok) return discarded;
        }
        const hidden = await writeLive(
          records,
          current,
          { ...fieldsOf(current), visibility: fields.visibility },
          now,
        );
        if (!hidden.ok) return hidden;
        if (pending.value?.status !== "draft")
          return attributedPage(records, hidden.value, null);
        const dropped = await records.dropRevision(id);
        return dropped.ok
          ? attributedPage(records, hidden.value, null)
          : dropped;
      }

      if (fields.url !== current.url) {
        const available = await records.checkPageUrl(fields.url);
        if (!available.ok) return available;
      }

      // Null moves the page to its category's root; only leaving it out keeps the parent.
      const placed = await place(records, id, {
        ...fields,
        parent_id:
          fields.parent_id === undefined
            ? (pending.value?.fields ?? current).parent_id
            : fields.parent_id,
      });
      if (!placed.ok) return placed;
      if (current.visibility === "public" && fields.visibility === "public") {
        // Refused now for what publishing it would be refused for today.
        const valid = await records.checkReplace(
          id,
          revisionOf(current, placed.value, this.clock()),
        );
        if (!valid.ok) return valid;
        const proposed = await records.writeRevision(
          id,
          pendingRevisionOf(
            current,
            pending.value,
            placed.value,
            actor.id,
            this.clock(),
          ),
        );
        return proposed.ok
          ? attributedPage(records, current, proposed.value)
          : proposed;
      }
      if (fields.visibility === "public" && !this.review.allowSelfApproval) {
        // Making it public approves every change since it was last public,
        // this save's included, so none of them may be the approver's.
        if (
          changesOf(current, placed.value).some(
            ({ field }) => field !== "visibility",
          )
        )
          return err(new SelfApproval(CHANGED_SINCE_PUBLIC));
        const changers = await records.changedSincePublic(id);
        if (!changers.ok) return changers;
        if (changers.value.includes(actor.id))
          return err(new SelfApproval(CHANGED_SINCE_PUBLIC));
      }
      // Only a public page has a revision, so there is none to close here.
      const saved = await writeLive(records, current, placed.value, now);
      return saved.ok ? attributedPage(records, saved.value, null) : saved;
    });
  }

  /**
   * Send a page's draft revision for review. The submitter is recorded, and
   * none may approve their own submission. With `expectedUpdatedAt`, a draft
   * saved since the caller read it is refused. Once it commits, the
   * approvers hear a change waits for them.
   *
   * A rejected revision can be submitted again as it is: it is copied into a
   * new revision with the same version, since its content is unchanged, and
   * the rejected one is kept with its comment. The copy's contributors gain
   * the rejected round's submitter, so they still can't approve it.
   */
  async submit(
    id: PageId,
    expectedUpdatedAt: Date | null,
    actor: Employee,
  ): Promise<
    Result<
      RevisionView,
      | PageNotFound
      | RevisionNotFound
      | PageConflict
      | RevisionStateConflict
      | ContentStoreUnavailable
    >
  > {
    const submitted = await this.records.atomically(
      actor.id,
      async (records) => {
        const reviewing = await underReview(
          records,
          id,
          expectedUpdatedAt,
          "submit",
        );
        if (!reviewing.ok) return reviewing;
        const { live, revision } = reviewing.value;
        let draft = revision;
        if (revision.status === "rejected") {
          const again = await records.writeRevision(id, {
            fields: revision.fields,
            liveUpdatedAt: new Date(live.updated_at),
            updatedAt: new Date(revision.updated_at),
            createdBy: actor.id,
            contributors: inheritedFrom(revision),
          });
          if (!again.ok) return again;
          draft = again.value;
        }
        const marked = await records.markRevision(draft.id, {
          status: "submitted",
          by: actor.id,
          at: this.clock(),
        });
        return marked.ok ? ok(viewOf(live, marked.value)) : marked;
      },
    );
    if (submitted.ok)
      await this.notifier.notify({
        kind: "submitted",
        pageId: id,
        title: submitted.value.fields.title,
        submittedBy: actor.id,
        contributors: submitted.value.contributors,
      });
    return submitted;
  }

  /**
   * Reject a submitted revision with the approver's comment. The live page is
   * unchanged and the rejected revision is kept; the next save starts a new
   * draft from it. The approver names the version they reviewed. Rejecting
   * moves the revision's version, so an editor still holding the earlier one
   * reloads and sees the rejection rather than saving over it. Once it
   * commits, the submitter hears it was rejected.
   */
  async reject(
    id: PageId,
    comment: string,
    expectedUpdatedAt: Date,
    actor: Employee,
  ): Promise<
    Result<
      RevisionView,
      | PageNotFound
      | RevisionNotFound
      | PageConflict
      | RevisionStateConflict
      | SelfApproval
      | ContentStoreUnavailable
    >
  > {
    const rejected = await this.records.atomically(
      actor.id,
      async (records) => {
        const reviewing = await underReview(
          records,
          id,
          expectedUpdatedAt,
          "decide",
        );
        if (!reviewing.ok) return reviewing;
        const { live, revision } = reviewing.value;
        if (this.isOwn(revision, actor)) return err(new SelfApproval());
        const marked = await records.markRevision(revision.id, {
          status: "rejected",
          by: actor.id,
          at: new Date(
            Math.max(
              this.clock().getTime(),
              Date.parse(revision.updated_at) + 1,
            ),
          ),
          comment,
        });
        return marked.ok ? ok(viewOf(live, marked.value)) : marked;
      },
    );
    if (rejected.ok && rejected.value.submitted_by !== null)
      await this.notifier.notify({
        kind: "rejected",
        pageId: id,
        title: rejected.value.fields.title,
        submittedBy: rejected.value.submitted_by,
      });
    return rejected;
  }

  /**
   * Approve a submitted revision and publish it to the live page, all in one
   * transaction: the page is written, re-indexed and audited as a live save
   * is, with the approver as the actor, and the revision is marked published.
   * The revision is checked again as a save would check it, since the
   * estate can have moved on while it waited; a stale one is refused with
   * the field to fix, and nothing changes. The approver names the version
   * they reviewed, so a revision changed since is a conflict. Once it
   * commits, the submitter hears it is live: publishing is the approval.
   */
  async publish(
    id: PageId,
    expectedUpdatedAt: Date,
    actor: Employee,
  ): Promise<
    Result<
      EditorPage,
      | PageNotFound
      | RevisionNotFound
      | PageConflict
      | RevisionStateConflict
      | SelfApproval
      | PageRejected
      | ContentStoreUnavailable
    >
  > {
    const published = await this.records.atomically(
      actor.id,
      async (records) => {
        const reviewing = await underReview(
          records,
          id,
          expectedUpdatedAt,
          "decide",
        );
        if (!reviewing.ok) return reviewing;
        const { live, revision } = reviewing.value;
        if (this.isOwn(revision, actor)) return err(new SelfApproval());
        const invalidContent = markdownRejection(revision.fields);
        if (invalidContent) return err(invalidContent);
        if (revision.fields.url !== live.url) {
          const available = await records.checkPageUrl(revision.fields.url);
          if (!available.ok) return available;
        }
        const placed = await place(records, id, revision.fields);
        if (!placed.ok) return placed;
        // Past the revision's version, which can run ahead of the clock.
        const now = new Date(
          Math.max(this.clock().getTime(), Date.parse(revision.updated_at) + 1),
        );
        // Marked first, so the page's history reads the approval before the
        // change it lets live.
        const marked = await records.markRevision(revision.id, {
          status: "published",
          by: actor.id,
          at: now,
        });
        if (!marked.ok) return marked;
        const saved = await writeLive(records, live, placed.value, now);
        if (!saved.ok) return saved;
        const page = await attributedPage(records, saved.value, null);
        return page.ok
          ? ok({ page: page.value, submittedBy: marked.value.submitted_by })
          : page;
      },
    );
    if (!published.ok) return published;
    const { page, submittedBy } = published.value;
    if (submittedBy !== null)
      await this.notifier.notify({
        kind: "published",
        pageId: id,
        title: page.title,
        submittedBy,
      });
    return ok(page);
  }

  /** Whether the employee changed or submitted the revision, and so may not decide on it. */
  private isOwn(revision: PendingRevision, actor: Employee): boolean {
    return (
      !this.review.allowSelfApproval &&
      (revision.contributors.includes(actor.id) ||
        revision.submitted_by === actor.id)
    );
  }

  /** Delete a page; one with sub-pages is refused, and one already gone is not an error. */
  delete(
    id: PageId,
    actor: Employee,
  ): Promise<
    Result<void, PageRejected | NotApprover | ContentStoreUnavailable>
  > {
    return this.records.atomically(actor.id, async (records) => {
      const locked = await records.lock(id);
      if (!locked.ok) return locked;
      if (
        locked.value?.visibility === "public" &&
        !actor.roles.includes("approver")
      )
        return err(new NotApprover());
      const removed = await records.remove(id);
      return removed.ok ? ok(undefined) : removed;
    });
  }
}

function markdownRejection(fields: SaveFields): PageRejected | null {
  // Drafts retain incomplete or unsupported source; public and preview pages must compile.
  if (fields.visibility === "draft") return null;
  const { errors } = parseContentMarkdown(fields.body_markdown, {
    frontmatter: false,
  });
  return errors.length
    ? new PageRejected(
        errors.map((error) => ({
          field: "body_markdown",
          message: `Line ${error.line}, column ${error.column}: ${error.message}`,
        })),
      )
    : null;
}

/** Why an approver can't create a page as Public (ADR 0079, #3201). */
const CREATED_PUBLIC =
  "Another approver needs to make a page you wrote public. Create it as Preview or Draft.";

/** Why an approver can't make public a page they changed (ADR 0079, #3201). */
const CHANGED_SINCE_PUBLIC =
  "You changed this page since it was last public, so another approver needs to make it public.";

/** Read attribution after writes, inside their transaction, so no-ops keep the previous actor. */
async function attributedPage(
  records: PageRecords,
  live: PageDocument,
  revision: PendingRevision | null,
): Promise<Result<EditorPage, ContentStoreUnavailable>> {
  const author = await records.lastEditedBy(live.id);
  return author.ok
    ? ok({ ...workingCopy(live, revision), last_edited_by: author.value })
    : author;
}

/** A revision with what it changes against the live page. */
function viewOf(live: PageDocument, revision: PendingRevision): RevisionView {
  return { ...revision, changes: changesOf(live, revision.fields) };
}

/**
 * The locked live page and the revision a review step acts on, when it is in
 * the state the step needs and, with `expectedUpdatedAt`, still the version
 * the caller read. Submitting takes a draft, or a rejected revision to send
 * again; deciding takes a submitted one.
 */
async function underReview(
  records: PageRecords,
  id: PageId,
  expectedUpdatedAt: Date | null,
  step: "submit" | "decide",
): Promise<
  Result<
    { live: PageDocument; revision: PendingRevision },
    | PageNotFound
    | RevisionNotFound
    | PageConflict
    | RevisionStateConflict
    | ContentStoreUnavailable
  >
> {
  const locked = await records.lock(id);
  if (!locked.ok) return locked;
  if (locked.value === null) return err(new PageNotFound(id));
  const revision = await records.currentRevision(id);
  if (!revision.ok) return revision;
  if (
    revision.value === null ||
    (step === "decide" && revision.value.status === "rejected")
  )
    return err(
      new RevisionNotFound(
        step === "submit"
          ? "This page has no saved change to submit."
          : "This page has no change waiting for review.",
      ),
    );
  if (
    expectedUpdatedAt !== null &&
    revision.value.updated_at !== expectedUpdatedAt.toISOString()
  )
    return err(new PageConflict(id));
  if (step === "submit" && revision.value.status === "submitted")
    return err(
      new RevisionStateConflict(
        "under_review",
        "This change is already waiting for review.",
      ),
    );
  if (step === "decide" && revision.value.status !== "submitted")
    return err(
      new RevisionStateConflict(
        "not_submitted",
        "This change hasn't been submitted for review yet.",
      ),
    );
  return ok({ live: locked.value, revision: revision.value });
}

/**
 * Write `fields` over the live page as a save does: filing its uncategorised
 * sub-pages under its category and re-cutting its search chunks. The history
 * trigger records it against the transaction's actor.
 */
async function writeLive(
  records: PageRecords,
  current: PageDocument,
  fields: PageFields,
  now: Date,
): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>> {
  const saved = await records.replace(
    current.id,
    revisionOf(current, fields, now),
  );
  if (!saved.ok) return saved;
  if (saved.value.category_id !== null) {
    const filed = await records.fileUncategorisedBelow(
      current.id,
      saved.value.category_id,
    );
    if (!filed.ok) return filed;
  }
  const indexed = await records.replaceSearchChunks(
    current.id,
    chunkMarkdown(saved.value.body_markdown),
  );
  return indexed.ok ? saved : indexed;
}

/**
 * Where a write puts a page: beneath its parent and in its parent's category
 * when it names none, and never beneath itself. Hierarchy changes are held
 * still before the loop check, so two moves cannot each pass it and together
 * close one.
 */
async function place(
  records: PageRecords,
  id: PageId | undefined,
  fields: PageFields,
): Promise<Result<PageFields, PageRejected | ContentStoreUnavailable>> {
  if (fields.parent_id === null) return ok(fields);
  if (id !== undefined) {
    const above = await records.ancestorIds(fields.parent_id);
    if (!above.ok) return above;
    const loop = cycleOf(id, fields.parent_id, above.value);
    if (loop) return err(loop);
  }
  if (fields.category_id !== null) return ok(fields);
  const parentCategory = await records.categoryOf(fields.parent_id);
  if (!parentCategory.ok) return parentCategory;
  return ok(placedUnder(fields, parentCategory.value));
}
