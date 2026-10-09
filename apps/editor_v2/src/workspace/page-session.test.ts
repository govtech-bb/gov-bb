import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiFailure,
  type ApiPage,
  type DraftFields,
  type PageDraft,
  type SaveFields,
} from "../api/client";
import { detailsOf, type PageDetails } from "./page-details";
import { AUTOSAVE_DELAY_MS, PageSession } from "./page-session";

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
function fakeServer(draft: PageDraft | null = null) {
  const held = { page, draft };
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
    saveDraft: vi.fn(async (_id: string, write: DraftFields, ifUpdatedAt?: string) => {
      if (write.base_updated_at !== held.page.updated_at || held.draft?.updated_at !== ifUpdatedAt)
        throw refused();
      held.draft = { ...write, updated_by: "me", updated_at: stamp() };

      return held.draft;
    }),
    discardDraft: vi.fn(async (_id: string, ifUpdatedAt?: string) => {
      if (held.draft && held.draft.updated_at !== ifUpdatedAt) throw refused();
      held.draft = null;
    }),
    savePage: vi.fn(
      async (_id: string, fields: SaveFields, ifUpdatedAt: string, ifDraftUpdatedAt?: string) => {
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
    const session = new PageSession(server.api, page, draft);

    expect(session.getSnapshot()).toMatchObject({
      changed: true,
      details: { title: "Draft title" },
    });
    expect(session.store.getSnapshot().committed).toBe("Draft body\n");
  });

  it("keeps a published page's path when a draft holds another", () => {
    const server = fakeServer();
    const draft = server.draftOf(page, { url: "/somewhere/else" });

    expect(new PageSession(server.api, page, draft).getSnapshot().details.url).toBe(page.url);
  });

  it("autosaves the working copy as the draft once editing pauses, and not before", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, draft);

    session.setDetails(detailsOf(page));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.api.discardDraft).toHaveBeenCalledWith(page.id, draft.updated_at);
    expect(server.held.draft).toBeNull();
    expect(session.getSnapshot().changed).toBe(false);
  });

  it("publishes the working copy and its draft, sending an untouched body back exactly as it came", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, null);

    retitled(session, "");
    expect(await session.publish()).toEqual({
      kind: "invalid",
      errors: [{ field: "title", message: "Enter a title" }],
    });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(server.held.draft?.title).toBe("");
  });

  it("follows a newer published version while nothing here differs", () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null);
    const newer = server.publishElsewhere({ title: "Newer", body_markdown: "From elsewhere" });

    session.follow(newer);

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
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, null);

    retitled(session, "Mine");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const theirs = server.draftElsewhere({ title: "Theirs" });

    expect((await session.publish()).kind).toBe("conflict");
    expect(server.held).toMatchObject({ page, draft: theirs });
    expect(session.getSnapshot().newer).toEqual({ page, draft: theirs });
  });

  it("restores a past version's content as changes to save, keeping the page's path", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, draft);

    await session.discard();

    expect(server.api.discardDraft).toHaveBeenCalledWith(page.id, draft.updated_at);
    expect(session.getSnapshot()).toMatchObject({
      changed: false,
      details: { title: page.title },
    });
  });

  it("takes the work saved elsewhere when the author discards while it is held", async () => {
    const server = fakeServer();
    const session = new PageSession(server.api, page, null);

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
    const session = new PageSession(server.api, page, null);
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
