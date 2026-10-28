import { describe, expect, it } from "vitest";
import { ApiFailure, type ApiPage, type SavePageInput } from "../../src/api/client";
import type { Category } from "../../src/api/categories";
import { pageToMarkdown } from "../../src/api/page-markdown";
import { savePageDraft, pageHasUnsavedChanges } from "../../src/workspace/page-sync";
import { DraftStore } from "../../src/persistence/draft-store";
import { govbbPageCodec } from "../../src/presets/govbb-page";

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
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
  pending_revision: null,
};

const newer: ApiPage = {
  ...page,
  title: "How severance pay is worked out",
  updated_at: "2026-10-07T13:00:00.000Z",
};

const markdown = pageToMarkdown(page, []);

it("counts both applied changes and unapplied source against an in-memory server baseline", () => {
  const store = new DraftStore(markdown, govbbPageCodec);
  const session = { store, getBaseline: () => ({ page, markdown }), isSaving: () => false };
  expect(pageHasUnsavedChanges(session)).toBe(false);
  store.edit("invalid source");
  expect(pageHasUnsavedChanges(session)).toBe(true);
  store.discard();
  expect(pageHasUnsavedChanges(session)).toBe(false);
  store.edit(markdown + "\n\nEdited");
  expect(store.apply()).toBe(true);
  expect(pageHasUnsavedChanges(session)).toBe(true);
});

describe("saving a page", () => {
  const base = { page, markdown };

  it("saves the draft over the version it was edited from", async () => {
    const sent: { fields: SavePageInput; ifUpdatedAt: string }[] = [];
    const edited = markdown.replace("Hello", "Hello again");

    const outcome = await savePageDraft(
      {
        savePage: async (_id, fields, ifUpdatedAt) => {
          sent.push({ fields, ifUpdatedAt });

          return { ...newer, body_markdown: fields.body_markdown };
        },
      },
      base,
      edited,
      [],
    );

    expect(sent).toEqual([
      {
        fields: expect.objectContaining({ body_markdown: "Hello again" }),
        ifUpdatedAt: page.updated_at,
      },
    ]);
    expect(outcome).toEqual({
      kind: "saved",
      base: { page: { ...newer, body_markdown: "Hello again" }, markdown: edited },
    });
  });

  it("refuses to take a public page out of view along with other edits, which api_v2 would ignore", async () => {
    let called = false;

    const outcome = await savePageDraft(
      {
        savePage: async () => {
          called = true;

          return page;
        },
      },
      { page, markdown },
      pageToMarkdown({ ...page, visibility: "preview", title: "Renamed" }, []),
      [],
    );

    expect(called).toBe(false);
    expect(outcome).toEqual({
      kind: "invalid",
      errors: [
        {
          field: "visibility",
          message: "Save your other changes before you change who can see the page",
        },
      ],
    });
  });

  it("refuses other edits with a visibility change even when the saved version wouldn't parse", async () => {
    const business: Category = {
      id: "00000000-0000-4000-8000-000000000099",
      parent_id: null,
      slug: "business-trade",
      title: "Business and trade",
      description: null,
      url: "/business-trade",
      position: 0,
      services: 30,
      reserved_route: false,
      updated_at: "2026-10-28T12:00:00.000Z",
    };

    // A public root page with no category: its saved version fails "Choose a category"
    const unfiled: ApiPage = { ...page, parent_id: null, category_id: null };
    let called = false;

    const outcome = await savePageDraft(
      {
        savePage: async () => {
          called = true;

          return unfiled;
        },
      },
      { page: unfiled, markdown: pageToMarkdown(unfiled, [business]) },
      pageToMarkdown(
        { ...unfiled, category_id: business.id, visibility: "preview", title: "Renamed" },
        [business],
      ),
      [business],
    );

    expect(called).toBe(false);
    expect(outcome).toMatchObject({ kind: "invalid", errors: [{ field: "visibility" }] });
  });

  it("takes what api_v2 stored as saved when a page goes out of view, not what was sent", async () => {
    const hidden: ApiPage = { ...page, visibility: "preview", updated_at: newer.updated_at };
    const sent = pageToMarkdown({ ...page, visibility: "preview" }, []);

    const outcome = await savePageDraft(
      { savePage: async () => ({ ...hidden, title: "As stored" }) },
      { page, markdown },
      sent,
      [],
    );

    expect(outcome).toEqual({
      kind: "saved",
      base: {
        page: { ...hidden, title: "As stored" },
        markdown: pageToMarkdown({ ...hidden, title: "As stored" }, []),
      },
    });
  });

  it("takes the live content as saved when taking a page out of view discards its waiting change", async () => {
    const waiting: ApiPage = {
      ...page,
      title: "Waiting for review",
      pending_revision: { status: "draft", comment: null },
    };

    const hidden: ApiPage = { ...page, visibility: "preview", updated_at: newer.updated_at };

    const outcome = await savePageDraft(
      { savePage: async () => hidden },
      { page: waiting, markdown: pageToMarkdown(waiting, []) },
      pageToMarkdown({ ...waiting, visibility: "preview" }, []),
      [],
    );

    expect(outcome).toEqual({
      kind: "saved",
      base: { page: hidden, markdown: pageToMarkdown(hidden, []) },
      discarded: true,
    });
  });

  it("sends nothing when the draft cannot be saved", async () => {
    let called = false;

    const outcome = await savePageDraft(
      {
        savePage: async () => {
          called = true;

          return page;
        },
      },
      base,
      markdown.replace(/^title: .*$/m, 'title: ""'),
      [],
    );

    expect(called).toBe(false);
    expect(outcome).toEqual({
      kind: "invalid",
      errors: [{ field: "title", message: "Enter a title" }],
    });
  });

  it.each([
    [
      new ApiFailure(422, [{ field: "url", message: "Taken" }]),
      { kind: "invalid", errors: [{ field: "url", message: "Taken" }] },
    ],
    [new ApiFailure(409), { kind: "conflict" }],
    [
      new ApiFailure(409, [], "This change is waiting for review.", "under_review"),
      { kind: "under-review", message: "This change is waiting for review." },
    ],
    [new ApiFailure(404), { kind: "missing" }],
    [new ApiFailure(401), { kind: "signed-out" }],
    [
      new ApiFailure(403, [], "Only approvers can change who can see a page."),
      { kind: "forbidden", message: "Only approvers can change who can see a page." },
    ],
    [
      new ApiFailure(403),
      { kind: "forbidden", message: "You don't have permission to save this change." },
    ],
    [new ApiFailure(503), { kind: "failed" }],
    [new ApiFailure(0), { kind: "failed" }],
  ])("turns a %s refusal into what the editor does about it", async (failure, expected) => {
    const outcome = await savePageDraft(
      {
        savePage: async () => {
          throw failure;
        },
      },
      base,
      markdown,
      [],
    );

    expect(outcome).toEqual(expected);
  });
});
