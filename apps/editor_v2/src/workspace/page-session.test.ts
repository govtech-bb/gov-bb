import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiFailure,
  type ApiPage,
  type DraftFields,
  type PageDraft,
  type PageLock,
  type SaveFields,
} from "../api/client";
import { detailsOf, type PageDetails } from "./page-details";
import { AUTOSAVE_DELAY_MS, CLAIM_REFRESH_MS, PageSession } from "./page-session";

const page: ApiPage = {
  id: "page-1",
  url: "/money-financial-support/severance/how-it-is-worked-out",
  slug: "how-it-is-worked-out",
  category_id: null,
  parent_id: "entry-1",
  title: "How severance is worked out",
  description: null,
  visibility: "public",
  form_id: null,
  body_markdown: "Hello",
  frontmatter: {},
  published_at: "2026-10-01T12:00:00.000Z",
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
};

/**
 * The content API as far as a session uses it, holding a page and its draft and refusing, as the
 * API does, any write over versions the writer did not read.
 */
const ME = { id: "employee-me", name: "Me", email: "me@govtech.bb" };

const OTHER = { id: "employee-other", name: "Other editor", email: "other@govtech.bb" };

const lockOf = (holder: typeof ME): PageLock => ({
  holder,
  mine: holder === ME,
  expires_at: "2026-10-07T12:05:00.000Z",
});

/** What the fake server holds: the page, its draft and whoever is editing it. */
type Held = { page: ApiPage; draft: PageDraft | null; holder: typeof ME | null };

function fakeServer(draft: PageDraft | null = null) {
  const held: Held = { page, draft, holder: null };

  /** Every write is editing: someone else's claim refuses it, and otherwise it is the writer's claim. */
  const claimFor = () => {
    if (held.holder === OTHER)
      throw new ApiFailure(423, [], "Other editor is editing this page.", lockOf(OTHER));
    held.holder = ME;
  };

  let stamps = 0;
  const stamp = () => new Date(Date.parse(page.updated_at) + ++stamps * 60_000).toISOString();
  const refused = () => new ApiFailure(409);

  const draftOf = (base: ApiPage, changes: Partial<PageDetails & { body_markdown: string }>) => ({
    ...detailsOf(base),
    body_markdown: base.body_markdown,
    ...changes,
    base_updated_at: base.updated_at,
    updated_by: "someone",
    updated_at: stamp(),
  });

  const api = {
    page: vi.fn(async (_id: string) => held.page),
    draft: vi.fn(async (_id: string) => held.draft),
    editor: vi.fn(async (_id: string) => (held.holder ? lockOf(held.holder) : null)),
    claim: vi.fn(async (_id: string, takeOver = false) => {
      if (!takeOver) claimFor();
      held.holder = ME;

      return lockOf(ME);
    }),
    stopEditing: vi.fn(async (_id: string) => {
      if (held.holder === ME) held.holder = null;
    }),
    saveDraft: vi.fn(async (_id: string, write: DraftFields, ifUpdatedAt?: string) => {
      claimFor();

      if (write.base_updated_at !== held.page.updated_at || held.draft?.updated_at !== ifUpdatedAt)
        throw refused();
      held.draft = { ...write, updated_by: "me", updated_at: stamp() };

      return held.draft;
    }),
    discardDraft: vi.fn(async (_id: string, ifUpdatedAt?: string) => {
      claimFor();

      if (held.draft && held.draft.updated_at !== ifUpdatedAt) throw refused();
      held.draft = null;
    }),
    savePage: vi.fn(
      async (_id: string, fields: SaveFields, ifUpdatedAt: string, ifDraftUpdatedAt?: string) => {
        claimFor();

        if (ifUpdatedAt !== held.page.updated_at) throw refused();

        if (held.draft && held.draft.updated_at !== ifDraftUpdatedAt) throw refused();
        held.page = { ...held.page, ...fields, updated_at: stamp() };
        held.draft = null;

        return held.page;
      },
    ),
  };

  return {
    api,
    held,
    draftOf,
    /** Someone else starting to edit the page. */
    claimElsewhere: () => {
      held.holder = OTHER;
    },
    /** Someone else replacing the draft, having read the current one. */
    draftElsewhere: (changes: Partial<PageDetails>) => {
      held.draft = draftOf(held.page, changes);

      return held.draft;
    },
    /** Someone else publishing, which discards the draft they read. */
    publishElsewhere: (changes: Partial<ApiPage>) => {
      held.page = { ...held.page, ...changes, updated_at: stamp() };
      held.draft = null;

      return held.page;
    },
  };
}

const retitled = (session: PageSession, title: string) =>
  session.setDetails({ ...session.getSnapshot().details, title });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a content API page being edited", () => {
  it("opens the server's draft over the published page", () => {
    const server = fakeServer();
    const draft = server.draftOf(page, { title: "Draft title", body_markdown: "Draft body" });
    const session = new PageSession(server.api, page, draft, null);

    expect(session.getSnapshot()).toMatchObject({
      changed: true,
      details: { title: "Draft title" },
    });
    expect(session.store.getSnapshot().committed).toBe("Draft body\n");
  });

  it("keeps a published page's path when a draft holds another", () => {
    const server = fakeServer();
    const draft = server.draftOf(page, { url: "/somewhere/else" });

    expect(new PageSession(server.api, page, draft, null).getSnapshot().details.url).toBe(page.url);
  });

  it("autosaves the working copy as the draft once editing pauses, and not before", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "New title");
    expect(session.getSnapshot().saving).toBe("pending");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(server.api.saveDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(server.api.saveDraft).toHaveBeenCalledWith(
      page.id,
      {
        ...detailsOf(page),
        title: "New title",
        body_markdown: "Hello\n",
        base_updated_at: page.updated_at,
      },
      undefined,
    );
    expect(session.getSnapshot()).toMatchObject({ saving: "idle", changed: true });
    expect(session.unsaved()).toBe(false);
  });

  it("replaces only the draft it saved last", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "First");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const first = server.held.draft?.updated_at;
    retitled(session, "Second");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.api.saveDraft).toHaveBeenLastCalledWith(
      page.id,
      expect.objectContaining({ title: "Second" }),
      first,
    );
    expect(server.held.draft?.title).toBe("Second");
  });

  it("autosaves an edit to the body while attached, and keeps listening after a remount", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    // React's development double mount.
    session.attach()();
    session.attach();
    session.store.edit("Hello again\n");
    session.store.apply();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.held.draft?.body_markdown).toBe("Hello again\n");
  });

  it("deletes the draft once the working copy matches the published page again", async () => {
    const server = fakeServer();
    const draft = server.draftElsewhere({ title: "Draft title" });
    const session = new PageSession(server.api, page, draft, null);

    session.setDetails(detailsOf(page));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.api.discardDraft).toHaveBeenCalledWith(page.id, draft.updated_at);
    expect(server.held.draft).toBeNull();
    expect(session.getSnapshot().changed).toBe(false);
  });

  it("publishes the working copy and its draft, sending an untouched body back exactly as it came", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "New title");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const draft = server.held.draft?.updated_at;
    const outcome = await session.publish();

    expect(outcome.kind).toBe("saved");
    expect(server.api.savePage).toHaveBeenCalledWith(
      page.id,
      expect.objectContaining({ title: "New title", body_markdown: "Hello" }),
      page.updated_at,
      draft,
    );
    expect(server.held.draft).toBeNull();
    expect(session.getSnapshot()).toMatchObject({
      changed: false,
      saving: "idle",
      published: { title: "New title" },
    });
  });

  it("keeps the draft saving when publishing is refused", async () => {
    const server = fakeServer();
    server.api.savePage.mockRejectedValueOnce(
      new ApiFailure(422, [{ field: "title", message: "Enter a title" }]),
    );
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "");
    expect(await session.publish()).toEqual({
      kind: "invalid",
      errors: [{ field: "title", message: "Enter a title" }],
    });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.held.draft?.title).toBe("");
  });

  it("follows a newer published version while nothing here differs", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);
    const newer = server.publishElsewhere({ title: "Newer", body_markdown: "From elsewhere" });

    // Following waits its turn behind any write that is out.
    session.follow(newer);
    await vi.advanceTimersByTimeAsync(0);

    expect(session.getSnapshot()).toMatchObject({
      published: newer,
      newer: undefined,
      changed: false,
      details: { title: "Newer" },
    });
    expect(session.store.getSnapshot().committed).toBe("From elsewhere\n");
  });

  it("holds work published elsewhere while the author has changes, until they keep theirs", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "Mine");
    const newer = server.publishElsewhere({ title: "Theirs" });
    session.follow(newer);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(session.getSnapshot().newer).toEqual({ page: newer, draft: null });
    expect(server.api.saveDraft).not.toHaveBeenCalled();
    expect(session.unsaved()).toBe(true);

    session.keepMine();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(session.getSnapshot()).toMatchObject({ published: newer, newer: undefined });
    expect(server.held.draft).toMatchObject({ title: "Mine", base_updated_at: newer.updated_at });
  });

  it("holds a draft saved over this one rather than replacing it, until the author takes it", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const theirs = server.draftElsewhere({ title: "Theirs" });
    retitled(session, "Mine again");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(session.getSnapshot().newer).toEqual({ page, draft: theirs });
    expect(server.held.draft).toBe(theirs);

    await session.loadNewer();
    retitled(session, "Theirs, edited");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.api.saveDraft).toHaveBeenLastCalledWith(
      page.id,
      expect.objectContaining({ title: "Theirs, edited" }),
      theirs.updated_at,
    );
  });

  it("holds a publish over a draft saved elsewhere instead of discarding it", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const theirs = server.draftElsewhere({ title: "Theirs" });

    expect((await session.publish()).kind).toBe("conflict");
    expect(server.held).toMatchObject({ page, draft: theirs });
    expect(session.getSnapshot().newer).toEqual({ page, draft: theirs });
  });

  it("restores a past version's content as changes to save, keeping the page's path", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    session.restore({
      ...page,
      url: "/somewhere/else",
      title: "Old title",
      body_markdown: "Old body",
    });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.held.draft).toMatchObject({
      ...detailsOf(page),
      title: "Old title",
      body_markdown: "Old body\n",
    });
  });

  it("reports an autosave the server refused, until it saves", async () => {
    const server = fakeServer();
    server.api.saveDraft.mockRejectedValueOnce(new ApiFailure(0));
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "New title");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.getSnapshot().saving).toBe("failed");
    expect(session.unsaved()).toBe(true);

    await session.save();
    expect(session.getSnapshot().saving).toBe("idle");
  });

  it("discards the draft it saved and goes back to the published page", async () => {
    const server = fakeServer();
    const draft = server.draftElsewhere({ title: "Draft title" });
    const session = new PageSession(server.api, page, draft, null);

    await session.discard();

    expect(server.api.discardDraft).toHaveBeenCalledWith(page.id, draft.updated_at);
    expect(session.getSnapshot()).toMatchObject({
      changed: false,
      details: { title: page.title },
    });
  });

  it("takes the work saved elsewhere when the author discards while it is held", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "Mine");
    const newer = server.publishElsewhere({ title: "Theirs" });
    session.follow(newer);
    await vi.advanceTimersByTimeAsync(0);
    await session.discard();

    expect(server.api.discardDraft).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      published: newer,
      newer: undefined,
      changed: false,
      details: { title: "Theirs" },
    });
  });

  it("never has two writes out at once", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);
    let answer = () => {};

    const save = server.api.saveDraft.getMockImplementation();

    server.api.saveDraft.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => (answer = resolve));

      return save!(...args);
    });

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const discarded = session.discard();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.api.discardDraft).not.toHaveBeenCalled();

    answer();
    await discarded;

    expect(server.api.discardDraft).toHaveBeenCalledWith(page.id, expect.any(String));
    expect(server.held.draft).toBeNull();
  });
});

describe("one person editing a page at a time", () => {
  it("claims the page at the first edit, and lets others edit once the author leaves", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.api.claim).toHaveBeenCalledWith(page.id);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await session.leave();

    expect(server.api.stopEditing).toHaveBeenCalledWith(page.id);
    expect(server.held.holder).toBeNull();
  });

  it("claims the page for unapplied Markdown too, and keeps the claim while it goes on", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    session.attach();
    session.store.edit("Rewriting in Markdown\n");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.api.claim).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CLAIM_REFRESH_MS);
    session.store.edit("Still rewriting\n");
    await vi.advanceTimersByTimeAsync(0);

    expect(server.api.claim).toHaveBeenCalledTimes(2);
    expect(server.api.saveDraft).not.toHaveBeenCalled();
  });

  it("is read-only while someone else edits, saving nothing", async () => {
    const server = fakeServer();
    server.claimElsewhere();
    const session = new PageSession(server.api, page, null, lockOf(OTHER));

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(session.getSnapshot()).toMatchObject({ lockedBy: OTHER, takenOver: false });
    expect(server.api.claim).not.toHaveBeenCalled();
    expect(server.api.saveDraft).not.toHaveBeenCalled();
    expect(session.unsaved()).toBe(false);
  });

  it("goes read-only when someone takes the page over, saying so, with nothing left saving", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(0);
    server.claimElsewhere();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(session.getSnapshot()).toMatchObject({
      lockedBy: OTHER,
      takenOver: true,
      saving: "idle",
    });
  });

  it("takes the page over, carrying on from their latest draft", async () => {
    const server = fakeServer();
    const theirs = server.draftElsewhere({ title: "Theirs" });
    server.claimElsewhere();
    const session = new PageSession(server.api, page, null, lockOf(OTHER));

    await session.takeOver();

    expect(server.api.claim).toHaveBeenCalledWith(page.id, true);
    expect(session.getSnapshot()).toMatchObject({
      lockedBy: undefined,
      details: { title: "Theirs" },
    });
    retitled(session, "Theirs, mine now");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(server.held.draft).toMatchObject({ title: "Theirs, mine now" });
    expect(server.api.saveDraft).toHaveBeenLastCalledWith(
      page.id,
      expect.anything(),
      theirs.updated_at,
    );
  });

  it("becomes editable again once whoever was editing has left, from what they saved", async () => {
    const server = fakeServer();
    server.draftElsewhere({ title: "Theirs" });
    server.claimElsewhere();
    const session = new PageSession(server.api, page, null, lockOf(OTHER));

    await session.lockIs(null);

    expect(session.getSnapshot()).toMatchObject({
      lockedBy: undefined,
      details: { title: "Theirs" },
    });
  });

  it("keeps its claim when it leaves with changes it could not save", async () => {
    const server = fakeServer();
    server.api.saveDraft.mockRejectedValue(new ApiFailure(0));
    const session = new PageSession(server.api, page, null, null);

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(0);
    await session.leave();

    expect(session.getSnapshot().saving).toBe("failed");
    expect(server.api.stopEditing).not.toHaveBeenCalled();
  });
});
