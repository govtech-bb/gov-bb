import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type PageDraft,
  type PageLock,
  type PageSnapshot,
} from "../api/client";
import type { DraftStore } from "../persistence/draft-store";
import type { DraftStorage } from "../persistence/types";
import {
  apiPageDocument,
  canonicalBody,
  restoredDetails,
  roleOf,
  savePage,
  type SaveOutcome,
} from "./api-pages";
import { openBodyDocument } from "./documents";
import {
  detailsOf,
  detailsOfDraft,
  keepPublishedPath,
  sameDetails,
  type PageDetails,
} from "./page-details";

/** How long editing has to pause before the draft is saved. */
export const AUTOSAVE_DELAY_MS = 2000;

/** How often editing that saves nothing yet, such as unapplied Markdown, keeps the page's claim; one lapses after five minutes. */
export const CLAIM_REFRESH_MS = 60_000;

/** Where the working copy stands against the server's draft. */
export type DraftSaving = "idle" | "pending" | "saving" | "failed";

/** The page and its draft as the server holds them now. */
export type ServerCopy = { readonly page: ApiPage; readonly draft: PageDraft | null };

export type PageSessionSnapshot = {
  /** The page as last published: what the site serves, what the working copy was edited from, and what publishing replaces. */
  readonly published: ApiPage;
  /**
   * Work saved elsewhere that the working copy has not caught up with: a version published since,
   * or a draft saved over the one read here. Nothing more is saved until the author chooses
   * between them, so neither is overwritten unseen.
   */
  readonly newer: ServerCopy | undefined;
  readonly details: PageDetails;
  /** Whether the working copy differs from the published page. */
  readonly changed: boolean;
  readonly saving: DraftSaving;
  /** Someone else editing the page, which leaves it read-only here until they leave or the author takes over. */
  readonly lockedBy: PageLock["holder"] | undefined;
  /** Whether they took the page over from this author, rather than having it first. */
  readonly takenOver: boolean;
};

type SessionApi = Pick<
  EditorApi,
  "page" | "draft" | "editor" | "saveDraft" | "discardDraft" | "savePage" | "claim" | "stopEditing"
>;

/**
 * A content API page being edited. The working copy lives in memory and is autosaved, once editing
 * pauses, as the page's draft on the server, which every editor shares; the published page changes
 * only when the author publishes, which also discards the draft. Every write names the versions it
 * was made against and runs after the one before it, so a write over someone else's never lands.
 * Editing claims the page, so one person edits it at a time: anyone else sees it read-only until the
 * claim is released or lapses, or they take it over.
 */
export class PageSession {
  readonly store: DraftStore;
  private snapshot: PageSessionSnapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private publishedBody: string;
  private body: string;
  /** The server's draft as last read or written here: its `updated_at`, or null for none. */
  private draftVersion: string | null;
  private writes: Promise<unknown> = Promise.resolve();
  /** Whether this session holds the page's claim, and when it last took or refreshed it. */
  private claimed = false;
  private claimedAt = 0;

  constructor(
    private readonly api: SessionApi,
    page: ApiPage,
    draft: PageDraft | null,
    lock: PageLock | null,
    private readonly delay = AUTOSAVE_DELAY_MS,
  ) {
    const memory = new Map<string, string>();

    const storage: DraftStorage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };

    const document = apiPageDocument({ ...page, role: roleOf(page) });
    this.publishedBody = canonicalBody(page.body_markdown);
    this.body = draft ? canonicalBody(draft.body_markdown) : this.publishedBody;
    storage.setItem(document.keys.committed, this.body);
    this.store = openBodyDocument(document, storage);
    this.draftVersion = draft?.updated_at ?? null;

    this.snapshot = {
      published: page,
      newer: undefined,
      details: this.workingDetails({ page, draft }),
      changed: false,
      saving: "idle",
      lockedBy: lock && !lock.mine ? lock.holder : undefined,
      takenOver: false,
    };

    this.snapshot = { ...this.snapshot, changed: this.differs() };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Follow edits to the body while mounted; leaving saves what the server does not have yet. */
  attach = () => {
    const unsubscribe = this.store.subscribe(() => this.storeChanged());

    return () => {
      unsubscribe();
      void this.leave();
    };
  };

  /** Whether there are edits the server does not have yet. */
  unsaved = () =>
    !this.snapshot.lockedBy &&
    (this.timer !== undefined ||
      this.snapshot.saving !== "idle" ||
      (this.snapshot.newer !== undefined && this.snapshot.changed));

  setDetails = (details: PageDetails) => {
    this.set({ details });
    this.edited();
  };

  /** Save the working copy as the server's draft now; a copy that matches the published page needs none. */
  save = () => this.serially(() => this.saveNow());

  /** Publish the working copy: the page becomes it, and the server discards the draft. */
  publish = () =>
    this.serially(async (): Promise<SaveOutcome> => {
      this.stopTimer();
      this.store.flush();
      const { published, details } = this.snapshot;

      const outcome = await savePage(
        this.api,
        { page: published, body: this.publishedBody },
        details,
        this.body,
        this.draftVersion,
      );

      if (outcome.kind === "saved") {
        this.publishedBody = outcome.base.body;
        this.draftVersion = null;
        this.claimedNow();
        this.set({ published: outcome.base.page, newer: undefined });
        this.set({
          changed: this.differs(),
          saving: this.timer === undefined ? "idle" : "pending",
        });
      } else if (outcome.kind === "conflict") await this.catchUp();
      else if (outcome.kind === "locked") this.lockOut(outcome.lock.holder);
      else if (this.snapshot.changed) this.edited();

      return outcome;
    });

  /** Throw away the working copy and the draft it saved, back to what the server holds. */
  discard = () =>
    this.serially(async () => {
      this.stopTimer();
      const { published, newer } = this.snapshot;

      // Work saved elsewhere already replaced this copy's draft: taking it is the discard.
      if (newer) return this.take(newer);

      if (this.draftVersion !== null) {
        try {
          await this.api.discardDraft(published.id, this.draftVersion);
        } catch (error) {
          if (error instanceof ApiFailure && error.status === 409) return this.catchUp();

          if (error instanceof ApiFailure && this.lockedOut(error)) return;
          throw error;
        }

        this.claimedNow();
      }

      this.take({ page: published, draft: null });
    });

  /** Take the page over from whoever is editing it, carrying on from their latest draft. */
  takeOver = () =>
    this.serially(async () => {
      const { id } = this.snapshot.published;
      await this.api.claim(id, true);
      this.claimedNow();
      // Holding the claim, a read that fails here leaves the page read-only, and trying again reads it again.
      const [page, draft] = await Promise.all([this.api.page(id), this.api.draft(id)]);
      this.take({ page, draft });
      this.set({ lockedBy: undefined, takenOver: false });
    });

  /** Who is editing the page, as read from the server: read-only here follows their claim. */
  lockIs = (lock: PageLock | null) =>
    this.serially(async () => {
      const holder = lock && !lock.mine ? lock.holder : undefined;

      if (holder) {
        if (this.snapshot.lockedBy) this.set({ lockedBy: holder });
        else this.lockOut(holder);

        return;
      }

      if (!this.snapshot.lockedBy) return;
      // Whoever was editing has left: carry on from what they saved.
      const { id } = this.snapshot.published;
      const [page, draft] = await Promise.all([this.api.page(id), this.api.draft(id)]);
      this.take({ page, draft });
      this.set({ lockedBy: undefined, takenOver: false });
    });

  /** Stop editing here: save what the server does not have yet, then let others edit, unless that save failed. */
  leave = () =>
    this.serially(async () => {
      if (this.timer !== undefined) await this.saveNow();

      if (!this.claimed || this.unsaved()) return;
      this.claimed = false;
      await this.api.stopEditing(this.snapshot.published.id).catch(() => undefined);
    });

  /** Bring back a past version's content as unpublished changes; the page keeps its path, category and visibility. */
  restore = (version: PageSnapshot) => {
    this.store.edit(canonicalBody(version.body_markdown));

    if (!this.store.apply()) return;
    this.bodyChanged();
    this.setDetails(restoredDetails(this.snapshot.details, version));
  };

  /** The server's published page, as it stands now: follow it while nothing here differs, otherwise hold it for the author. */
  follow = (page: ApiPage) => {
    const { published, newer, changed, lockedBy } = this.snapshot;

    if (page.updated_at === published.updated_at || page.updated_at === newer?.page.updated_at)
      return;

    // Read-only here, nothing differs: show what the editor published.
    if (lockedBy || (!changed && this.draftVersion === null && !this.unsaved()))
      void this.serially(async () => this.take({ page, draft: null }));
    else void this.serially(() => this.catchUp());
  };

  /** Keep the working copy over the work saved elsewhere: it is saved over that, and publishing replaces it. */
  keepMine = () => {
    const { newer, details } = this.snapshot;

    if (!newer) return;
    this.publishedBody = canonicalBody(newer.page.body_markdown);
    this.draftVersion = newer.draft?.updated_at ?? null;
    this.set({
      published: newer.page,
      newer: undefined,
      details: keepPublishedPath(details, newer.page),
    });
    this.edited();
  };

  /** Take the work saved elsewhere in place of the working copy. */
  loadNewer = () =>
    this.serially(async () => {
      const { newer } = this.snapshot;

      if (newer) this.take(newer);
    });

  /** The save itself, for writes already in their turn. */
  private async saveNow() {
    this.stopTimer();

    if (this.snapshot.lockedBy) return;

    // Held until the author chooses between this copy and the work saved elsewhere.
    if (this.snapshot.newer) {
      this.set({ saving: "idle" });

      return;
    }

    const { published, details, changed } = this.snapshot;
    this.set({ saving: "saving" });

    try {
      if (changed) {
        const saved = await this.api.saveDraft(
          published.id,
          { ...details, body_markdown: this.body, base_updated_at: published.updated_at },
          this.draftVersion ?? undefined,
        );

        this.draftVersion = saved.updated_at;
        this.claimedNow();
      } else if (this.draftVersion !== null) {
        await this.api.discardDraft(published.id, this.draftVersion);
        this.draftVersion = null;
        this.claimedNow();
      }

      // An edit made while the request was out is saved by its own timer.
      if (this.timer === undefined) this.set({ saving: "idle" });
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 409) await this.catchUp();
      else if (error instanceof ApiFailure && this.lockedOut(error)) return;
      else if (this.timer === undefined) this.set({ saving: "failed" });
    }
  }

  /** Read the server's page and draft after a write it refused, and hold them for the author. */
  private async catchUp() {
    try {
      const id = this.snapshot.published.id;
      const [page, draft] = await Promise.all([this.api.page(id), this.api.draft(id)]);
      this.set({ newer: { page, draft }, saving: "idle" });
    } catch {
      this.set({ saving: "failed" });
    }
  }

  /** Make the server's copy the working copy. */
  private take({ page, draft }: ServerCopy) {
    this.stopTimer();
    this.publishedBody = canonicalBody(page.body_markdown);
    this.draftVersion = draft?.updated_at ?? null;
    // Set first, so the body the store applies does not count as an edit.
    this.body = draft ? canonicalBody(draft.body_markdown) : this.publishedBody;
    this.store.edit(this.body);
    this.store.apply();

    this.set({
      published: page,
      newer: undefined,
      details: this.workingDetails({ page, draft }),
      saving: "idle",
    });
    this.set({ changed: this.differs() });
  }

  /** A draft's details, holding a published page's path, which it cannot change. */
  private workingDetails({ page, draft }: ServerCopy) {
    return draft ? keepPublishedPath(detailsOfDraft(draft), page) : detailsOf(page);
  }

  /** Run a write once the ones before it have settled, so no two are ever out at once. */
  private serially<Outcome>(write: () => Promise<Outcome>): Promise<Outcome> {
    const next = this.writes.then(write, write);
    this.writes = next.catch(() => undefined);

    return next;
  }

  private storeChanged() {
    // Unapplied Markdown is editing too, so it claims the page and keeps the claim.
    if (this.store.getSnapshot().dirty) this.touch();
    this.bodyChanged();
  }

  private bodyChanged() {
    const { committed } = this.store.getSnapshot();

    if (committed === this.body) return;
    this.body = committed;
    this.edited();
  }

  private edited() {
    if (this.snapshot.lockedBy) return;
    this.touch();
    this.set({ changed: this.differs(), saving: "pending" });
    this.stopTimer();
    this.timer = setTimeout(() => void this.save(), this.delay);
  }

  /** Claim the page at the first edit, and keep the claim while editing goes on. */
  private touch() {
    if (this.snapshot.lockedBy) return;

    if (this.claimed && Date.now() - this.claimedAt < CLAIM_REFRESH_MS) return;
    this.claimedNow();

    void this.serially(async () => {
      try {
        await this.api.claim(this.snapshot.published.id);
      } catch (error) {
        this.claimed = false;

        if (error instanceof ApiFailure) this.lockedOut(error);
      }
    });
  }

  /** The server took or refreshed this session's claim: every write does. */
  private claimedNow() {
    this.claimed = true;
    this.claimedAt = Date.now();
  }

  /** Whether a refusal says someone else is editing the page, leaving it read-only here. */
  private lockedOut(failure: ApiFailure) {
    const holder = failure.status === 423 ? failure.lock?.holder : undefined;

    if (!holder) return false;
    this.lockOut(holder);

    return true;
  }

  /** Someone else has the page: taken from this author if they had claimed it. */
  private lockOut(holder: PageLock["holder"]) {
    this.stopTimer();
    this.set({ lockedBy: holder, takenOver: this.claimed, saving: "idle" });
    this.claimed = false;
  }

  private differs() {
    return (
      this.body !== this.publishedBody ||
      !sameDetails(this.snapshot.details, detailsOf(this.snapshot.published))
    );
  }

  private stopTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private set(patch: Partial<PageSessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };

    for (const listener of this.listeners) listener();
  }
}
