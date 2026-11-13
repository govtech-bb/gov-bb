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
  PageUrl,
  type PageValues,
  type PendingRevision,
  type RevisionView,
  type SaveFields,
  segmentsOf,
} from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import type { LastEditedBy } from "../modules/content-attribution";
import type { EditVersion } from "../modules/edit-concurrency";
import {
  restorableFields,
  VersionNotFound,
  type PageEvent,
  type VersionNotRestorable,
} from "../modules/page-history";
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

/** A live page write: a new page, or a revision over the page as it stands. */
export type LivePageWrite =
  | { readonly current: null; readonly page: NewPageRecord }
  | { readonly current: PageDocument; readonly page: PageRevision };

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

/** Live content, working revision, attribution and root version from one database snapshot. */
export interface PageEditorSnapshot {
  readonly live: PageDocument;
  readonly revision: PendingRevision | null;
  readonly version: EditVersion;
  readonly last_edited_by: LastEditedBy;
}

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
  /** One coherent editor snapshot, or null when the page is missing. */
  editorSnapshot(
    id: PageId,
  ): Promise<Result<PageEditorSnapshot | null, ContentStoreUnavailable>>;
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
  /**
   * Insert a page, or overwrite the page as it stands, with what follows
   * from it (ADR 0137): its uncategorised sub-pages are filed under its
   * category, its subtree's former public addresses redirect to where they
   * now are, no rule covers an address now public, and its search chunks are
   * re-cut from the saved body. Storage refuses an unknown category or
   * parent, a mismatched category, and a taken url or id.
   */
  writeLivePage(
    write: LivePageWrite,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>>;
  /** Refuse what a live page write over the page would, without keeping it. */
  checkReplace(
    id: PageId,
    page: PageRevision,
  ): Promise<Result<void, PageRejected | ContentStoreUnavailable>>;
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
  /** Who changed a page's content since it was last public, or ever when it never was. */
  changedSincePublic(
    id: PageId,
  ): Promise<Result<readonly string[], ContentStoreUnavailable>>;
  /** One of the page's history entries, by version, or null. */
  pageEvent(
    id: PageId,
    versionNo: number,
  ): Promise<Result<PageEvent | null, ContentStoreUnavailable>>;
  /** Record the transaction's update of the page as restoring that version (ADR 0135). */
  markRestore(
    id: PageId,
    versionNo: number,
  ): Promise<Result<void, ContentStoreUnavailable>>;
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
   * only for local development under AUTH_BYPASS (ADR 0134), and supplies
   * who hears of a review step once it commits (#3267); nobody, by default.
   */
  constructor(
    private readonly records: PageRecords,
    private readonly clock: Clock,
    private readonly review: { readonly allowSelfApproval: boolean },
    private readonly notifier: ReviewNotifier = NO_REVIEW_NOTIFICATIONS,
  ) {}

  /** The working copy and its baseline, read from one database snapshot. */
  async open(
    id: PageId,
  ): Promise<Result<EditorPage | null, ContentStoreUnavailable>> {
    const snapshot = await this.records.editorSnapshot(id);
    return snapshot.ok
      ? ok(snapshot.value && editorPageOf(snapshot.value))
      : snapshot;
  }

  /** The current revision, its live comparison and enclosing page version from one snapshot. */
  async revision(
    id: PageId,
  ): Promise<Result<RevisionView | null, ContentStoreUnavailable>> {
    const snapshot = await this.records.editorSnapshot(id);
    return snapshot.ok
      ? ok(snapshot.value && revisionViewOf(snapshot.value))
      : snapshot;
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
      const gated = await startLinkGate(records, actor, null, placed.value);
      if (!gated.ok) return gated;
      const created = await records.writeLivePage({
        current: null,
        page: creationOf(page.id, placed.value, this.clock()),
      });
      return created.ok ? savedPage(records, created.value.id) : created;
    });
  }

  /**
   * Replace a page's fields, and return the page as the editor now works on
   * it. The required root version covers live content and the pending revision;
   * a stale baseline is refused before any write or no-op acknowledgement.
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
    expectedVersion: EditVersion,
    actor: Employee,
  ): Promise<
    Result<
      EditorPage,
      | PageRejected
      | PageNotFound
      | PageConflict
      | NotApprover
      | SelfApproval
      | ContentStoreUnavailable
    >
  > {
    return this.records.atomically(actor.id, async (records) => {
      const checked = await versionedPage(records, id, expectedVersion);
      if (!checked.ok) return checked;
      return this.saveWith(records, id, checked.value, fields, actor);
    });
  }

  /**
   * Bring back the page's content as history version `versionNo` left it,
   * as a new change (ADR 0135): every entry stays, and the restore is a save
   * of that version's fields over the page as it stands now, made against
   * the version the caller read. It keeps the page's current visibility, so
   * changing who sees it stays a separate approver action. A page that isn't
   * public is written, and its history records `reverted`, naming the
   * version. A public page's restore goes into its pending revision, as any
   * save does, and is reviewed before citizens see it.
   */
  restore(
    id: PageId,
    versionNo: number,
    expectedVersion: EditVersion,
    actor: Employee,
  ): Promise<
    Result<
      EditorPage,
      | PageRejected
      | PageNotFound
      | PageConflict
      | VersionNotFound
      | VersionNotRestorable
      | NotApprover
      | SelfApproval
      | ContentStoreUnavailable
    >
  > {
    return this.records.atomically(actor.id, async (records) => {
      const checked = await versionedPage(records, id, expectedVersion);
      if (!checked.ok) return checked;
      const event = await records.pageEvent(id, versionNo);
      if (!event.ok) return event;
      if (event.value === null) return err(new VersionNotFound(versionNo));
      const fields = restorableFields(event.value);
      if (fields instanceof Error) return err(fields);
      const marked = await records.markRestore(id, versionNo);
      if (!marked.ok) return marked;
      return this.saveWith(
        records,
        id,
        checked.value,
        { ...fields, visibility: checked.value.live.visibility },
        actor,
      );
    });
  }

  /** `save`, inside the caller's transaction, over the page `versionedPage` locked and checked. */
  private async saveWith(
    records: PageRecords,
    id: PageId,
    checked: PageEditorSnapshot,
    fields: SaveFields,
    actor: Employee,
  ): Promise<
    Result<
      EditorPage,
      PageRejected | NotApprover | SelfApproval | ContentStoreUnavailable
    >
  > {
    const { live: current, revision: pending } = checked;
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
        pending === null ? 0 : Date.parse(pending.updated_at) + 1,
      ),
    );
    if (current.visibility === "public" && fields.visibility !== "public") {
      // Marked first, so the page's history reads the discard before the
      // unpublish, as it reads an approval before the change it lets live.
      if (pending?.status === "submitted") {
        const discarded = await records.markRevision(pending.id, {
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
      if (pending?.status === "draft") {
        const dropped = await records.dropRevision(id);
        if (!dropped.ok) return dropped;
      }
      return savedPage(records, id);
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
          ? (pending?.fields ?? current).parent_id
          : fields.parent_id,
    });
    if (!placed.ok) return placed;
    if (changesOf(workingCopy(current, pending), placed.value).length === 0)
      return savedPage(records, id);
    // A public page's save waits for review; any other writes the page now.
    if (current.visibility !== "public") {
      const gated = await startLinkGate(records, actor, current, placed.value);
      if (!gated.ok) return gated;
    }
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
          pending,
          placed.value,
          actor.id,
          this.clock(),
        ),
      );
      return proposed.ok ? savedPage(records, id) : proposed;
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
    return saved.ok ? savedPage(records, id) : saved;
  }

  /**
   * Send a page's draft revision for review. The submitter is recorded, and
   * none may approve their own submission. A root version that changed since
   * the caller read it is refused. Once it commits, the
   * approvers hear a change waits for them.
   *
   * A rejected revision can be submitted again as it is: it is copied into a
   * new revision with the same version, since its content is unchanged, and
   * the rejected one is kept with its comment. The copy's contributors gain
   * the rejected round's submitter, so they still can't approve it.
   */
  async submit(
    id: PageId,
    expectedVersion: EditVersion,
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
          expectedVersion,
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
        return marked.ok ? savedRevision(records, id) : marked;
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
    expectedVersion: EditVersion,
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
          expectedVersion,
          "decide",
        );
        if (!reviewing.ok) return reviewing;
        const { revision } = reviewing.value;
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
        return marked.ok ? savedRevision(records, id) : marked;
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
    expectedVersion: EditVersion,
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
          expectedVersion,
          "decide",
        );
        if (!reviewing.ok) return reviewing;
        const { live, revision } = reviewing.value;
        if (this.isOwn(revision, actor)) return err(new SelfApproval());
        const url = PageUrl.safeParse(revision.fields.url);
        if (!url.success)
          return err(
            new PageRejected(
              url.error.issues.map(({ message }) => ({
                field: "url",
                message,
              })),
            ),
          );
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
        const page = await savedPage(records, id);
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

  /** Delete only the displayed identity; a missing target is not a successful deletion. */
  delete(
    id: PageId,
    expectedVersion: EditVersion,
    actor: Employee,
  ): Promise<
    Result<
      void,
      | PageNotFound
      | PageConflict
      | PageRejected
      | NotApprover
      | ContentStoreUnavailable
    >
  > {
    return this.records.atomically(actor.id, async (records) => {
      const checked = await versionedPage(records, id, expectedVersion);
      if (!checked.ok) return checked;
      if (
        checked.value.live.visibility === "public" &&
        !actor.roles.includes("approver")
      )
        return err(new NotApprover());
      const gated = await startLinkGate(
        records,
        actor,
        checked.value.live,
        null,
      );
      if (!gated.ok) return gated;
      const removed = await records.remove(id);
      return removed.ok ? ok(undefined) : removed;
    });
  }
}

/**
 * Refuse an editor's write that adds, removes, moves or renames a hidden
 * `start` sub-page of a public page. Such a sub-page can hide that page's
 * Start link from citizens (PageResolution), so the write changes the public
 * page as surely as editing it, and only an approver does that. Editing the
 * sub-page where it stands is allowed. This is deliberately stricter than
 * resolution: it refuses some writes, such as adding a second hidden `start`
 * sub-page, that leave the link as it was.
 */
async function startLinkGate(
  records: PageRecords,
  actor: Employee,
  before: StartStepPlace | null,
  after: StartStepPlace | null,
): Promise<Result<void, NotApprover | ContentStoreUnavailable>> {
  if (actor.roles.includes("approver")) return ok(undefined);
  const hidBefore = await publicPageHiddenFrom(records, before);
  if (!hidBefore.ok) return hidBefore;
  const hidesAfter = await publicPageHiddenFrom(records, after);
  if (!hidesAfter.ok) return hidesAfter;
  // Compared by page, so moving one between public pages is refused too.
  return hidBefore.value === hidesAfter.value
    ? ok(undefined)
    : err(new NotApprover());
}

/** Where a page sits, and who sees it: all that decides a Start link. */
type StartStepPlace = Pick<PageFields, "url" | "parent_id" | "visibility">;

/** The public page whose `start` sub-page, hidden, a page with these fields is, or null. */
async function publicPageHiddenFrom(
  records: PageRecords,
  page: StartStepPlace | null,
): Promise<Result<PageId | null, ContentStoreUnavailable>> {
  if (
    page === null ||
    page.parent_id === null ||
    page.visibility === "public" ||
    segmentsOf(page.url).at(-1) !== "start"
  )
    return ok(null);
  const parent = await records.editorSnapshot(page.parent_id);
  if (!parent.ok) return parent;
  return ok(parent.value?.live.visibility === "public" ? page.parent_id : null);
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

/** Why an approver can't create a page as Public (ADR 0134, #3201). */
const CREATED_PUBLIC =
  "Another approver needs to make a page you wrote public. Create it as Preview or Draft.";

/** Why an approver can't make public a page they changed (ADR 0134, #3201). */
const CHANGED_SINCE_PUBLIC =
  "You changed this page since it was last public, so another approver needs to make it public.";

function editorPageOf(snapshot: PageEditorSnapshot): EditorPage {
  return {
    ...workingCopy(snapshot.live, snapshot.revision),
    version: snapshot.version,
    last_edited_by: snapshot.last_edited_by,
  };
}

function revisionViewOf(snapshot: PageEditorSnapshot): RevisionView | null {
  return (
    snapshot.revision && {
      ...snapshot.revision,
      version: snapshot.version,
      changes: changesOf(snapshot.live, snapshot.revision.fields),
    }
  );
}

/** Read final persisted versions after every write in the locked transaction. */
async function savedPage(
  records: PageRecords,
  id: PageId,
): Promise<Result<EditorPage, ContentStoreUnavailable>> {
  const snapshot = await records.editorSnapshot(id);
  if (!snapshot.ok) return snapshot;
  if (!snapshot.value)
    throw new Error("Saved page missing inside its write transaction");
  return ok(editorPageOf(snapshot.value));
}

async function savedRevision(
  records: PageRecords,
  id: PageId,
): Promise<Result<RevisionView, ContentStoreUnavailable>> {
  const snapshot = await records.editorSnapshot(id);
  if (!snapshot.ok) return snapshot;
  const revision = snapshot.value && revisionViewOf(snapshot.value);
  if (!revision)
    throw new Error("Saved revision missing inside its write transaction");
  return ok(revision);
}

/** Lock and check the root before examining revisions or applying business rules. */
async function versionedPage(
  records: PageRecords,
  id: PageId,
  expectedVersion: EditVersion,
): Promise<
  Result<
    PageEditorSnapshot,
    PageNotFound | PageConflict | ContentStoreUnavailable
  >
> {
  const locked = await records.lock(id);
  if (!locked.ok) return locked;
  if (!locked.value) return err(new PageNotFound(id));
  const snapshot = await records.editorSnapshot(id);
  if (!snapshot.ok) return snapshot;
  if (!snapshot.value)
    throw new Error("Locked page missing inside its transaction");
  return snapshot.value.version === expectedVersion
    ? ok(snapshot.value)
    : err(new PageConflict(id));
}

/**
 * The locked live page and the revision a review step acts on, when it is in
 * the state the step needs and still the root version the caller read. Submitting takes a draft, or a rejected revision to send
 * again; deciding takes a submitted one.
 */
async function underReview(
  records: PageRecords,
  id: PageId,
  expectedVersion: EditVersion,
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
  const checked = await versionedPage(records, id, expectedVersion);
  if (!checked.ok) return checked;
  const revision = checked.value.revision;
  if (
    revision === null ||
    (step === "decide" && revision.status === "rejected")
  )
    return err(
      new RevisionNotFound(
        step === "submit"
          ? "This page has no saved change to submit."
          : "This page has no change waiting for review.",
      ),
    );
  if (step === "submit" && revision.status === "submitted")
    return err(
      new RevisionStateConflict(
        "under_review",
        "This change is already waiting for review.",
      ),
    );
  if (step === "decide" && revision.status !== "submitted")
    return err(
      new RevisionStateConflict(
        "not_submitted",
        "This change hasn't been submitted for review yet.",
      ),
    );
  return ok({ live: checked.value.live, revision: revision });
}

/**
 * Write `fields` over the live page as a save does, through the one live
 * page write, unless they change nothing. The history trigger records it
 * against the transaction's actor.
 */
async function writeLive(
  records: PageRecords,
  current: PageDocument,
  fields: PageFields,
  now: Date,
): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>> {
  if (changesOf(current, fields).length === 0) return ok(current);
  return records.writeLivePage({
    current,
    page: revisionOf(current, fields, now),
  });
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
