import { describe, expect, it } from "vitest";
import type { ApiPage, SavePageInput } from "../../src/api/client";
import type { Category } from "../../src/api/categories";
import {
  PageEditLockToken,
  pageContentVersionSchema,
  type PageApiFailure,
  type PageApiResult,
} from "../../src/api/page-schemas";
import { pageToMarkdown } from "../../src/api/page-markdown";
import { savePageChanges, pageHasUnsavedChanges } from "../../src/workspace/page-sync";
import { DraftStore } from "../../src/persistence/draft-store";
import { govbbPageCodec } from "../../src/presets/govbb-page";

const token = PageEditLockToken.parse("33333333-3333-4333-8333-333333333333");

if (!token) throw new Error("Invalid test credential");

const page: ApiPage = {
  version: pageContentVersionSchema.parse(1),
  id: "11111111-1111-4111-8111-111111111111",
  url: "/money-financial-support/severance/how-it-is-worked-out",
  slug: "how-it-is-worked-out",
  category_id: null,
  parent_id: "22222222-2222-4222-8222-222222222222",
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
  version: pageContentVersionSchema.parse(2),
  title: "How severance pay is worked out",
  updated_at: "2026-10-07T13:00:00.000Z",
};

const markdown = pageToMarkdown(page, []);

it("counts applied changes and unapplied source against the editing baseline", () => {
  const store = new DraftStore(markdown, govbbPageCodec);
  const session = { store, getBaseline: () => ({ page, markdown }) };
  expect(pageHasUnsavedChanges(session)).toBe(false);
  store.edit("invalid source");
  expect(pageHasUnsavedChanges(session)).toBe(true);
  store.discard();
  expect(pageHasUnsavedChanges(session)).toBe(false);
  store.edit(markdown + "\n\nEdited");
  expect(store.apply()).toBe(true);
  expect(pageHasUnsavedChanges(session)).toBe(true);
});

describe("explicit page saving", () => {
  const base = { page, markdown };
  it("sends the version of the submitted baseline and its exact editing credential", async () => {
    const sent: { fields: SavePageInput; token: PageEditLockToken }[] = [];
    const edited = markdown.replace("Hello", "Hello again");

    const outcome = await savePageChanges(
      {
        savePage: async (_id, fields, token) => {
          sent.push({ fields, token });

          return { ok: true, value: { ...newer, body_markdown: fields.body_markdown } };
        },
      },
      base,
      edited,
      [],
      token,
    );

    expect(sent).toEqual([
      { fields: expect.objectContaining({ body_markdown: "Hello again", version: 1 }), token },
    ]);
    expect(outcome).toEqual({
      kind: "saved",
      base: { page: { ...newer, body_markdown: "Hello again" }, markdown: edited },
    });
  });

  it("refuses to take a public page out of view along with other edits, which api_v2 would ignore", async () => {
    let called = false;

    const outcome = await savePageChanges(
      {
        savePage: async () => {
          called = true;

          return { ok: true, value: page };
        },
      },
      { page, markdown },
      pageToMarkdown({ ...page, visibility: "preview", title: "Renamed" }, []),
      [],
      token,
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

    const outcome = await savePageChanges(
      {
        savePage: async () => {
          called = true;

          return { ok: true, value: unfiled };
        },
      },
      { page: unfiled, markdown: pageToMarkdown(unfiled, [business]) },
      pageToMarkdown(
        { ...unfiled, category_id: business.id, visibility: "preview", title: "Renamed" },
        [business],
      ),
      [business],
      token,
    );

    expect(called).toBe(false);
    expect(outcome).toMatchObject({ kind: "invalid", errors: [{ field: "visibility" }] });
  });

  it("takes what api_v2 stored as saved when a page goes out of view, not what was sent", async () => {
    const hidden: ApiPage = { ...page, visibility: "preview", version: newer.version };
    const sent = pageToMarkdown({ ...page, visibility: "preview" }, []);

    const outcome = await savePageChanges(
      { savePage: async () => ({ ok: true, value: { ...hidden, title: "As stored" } }) },
      { page, markdown },
      sent,
      [],
      token,
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

    const hidden: ApiPage = { ...page, visibility: "preview", version: newer.version };

    const outcome = await savePageChanges(
      { savePage: async () => ({ ok: true, value: hidden }) },
      { page: waiting, markdown: pageToMarkdown(waiting, []) },
      pageToMarkdown({ ...waiting, visibility: "preview" }, []),
      [],
      token,
    );

    expect(outcome).toEqual({
      kind: "saved",
      base: { page: hidden, markdown: pageToMarkdown(hidden, []) },
      discarded: true,
    });
  });

  it("sends nothing when source validation fails", async () => {
    const outcome = await savePageChanges(
      {
        savePage: async () => {
          throw new Error("Invalid source reached the API");
        },
      },
      base,
      markdown.replace(/^title: .*$/m, 'title: ""'),
      [],
      token,
    );

    expect(outcome).toEqual({
      kind: "invalid",
      errors: [{ field: "title", message: "Enter a title" }],
    });
  });

  it.each<{ failure: PageApiFailure; outcome: string }>([
    { failure: { kind: "version-conflict", pageId: page.id }, outcome: "conflict" },
    { failure: { kind: "lock-lost", pageId: page.id }, outcome: "lock-lost" },
    { failure: { kind: "lock-required", pageId: page.id }, outcome: "lock-lost" },
    { failure: { kind: "missing" }, outcome: "missing" },
    { failure: { kind: "signed-out" }, outcome: "signed-out" },
    { failure: { kind: "outcome-unknown" }, outcome: "outcome-unknown" },
    { failure: { kind: "unavailable" }, outcome: "failed" },
  ])("retains the original version after $failure.kind", async ({ failure, outcome }) => {
    expect(
      await savePageChanges(
        { savePage: async () => ({ ok: false, error: failure }) },
        base,
        markdown,
        [],
        token,
      ),
    ).toEqual({ kind: outcome });
    expect(base.page.version).toBe(1);
    expect(base.markdown).toBe(markdown);
  });

  it.each<{ failure: PageApiFailure; message: string }>([
    {
      failure: { kind: "forbidden", message: "Only approvers can change who can see a page." },
      message: "Only approvers can change who can see a page.",
    },
    { failure: { kind: "forbidden" }, message: "You don’t have permission to save this change." },
  ])(
    "keeps a policy refusal's own words, apart from lost ownership",
    async ({ failure, message }) => {
      expect(
        await savePageChanges(
          { savePage: async () => ({ ok: false, error: failure }) },
          base,
          markdown,
          [],
          token,
        ),
      ).toEqual({ kind: "forbidden", message });
      expect(base.page.version).toBe(1);
    },
  );

  it("acknowledges the submitted snapshot without consuming source edits made while waiting", async () => {
    const store = new DraftStore(markdown, govbbPageCodec);
    const response = Promise.withResolvers<PageApiResult<ApiPage>>();

    const pending = savePageChanges(
      { savePage: () => response.promise },
      base,
      markdown,
      [],
      token,
    );

    store.edit("Unapplied source typed while saving");
    const edited = store.getSnapshot();
    response.resolve({ ok: true, value: newer });
    const outcome = await pending;

    if (outcome.kind !== "saved") throw new Error("Expected save acknowledgement");
    expect(outcome.base.markdown).toBe(markdown);
    expect(outcome.base.page.version).toBe(2);
    expect(store.getSnapshot()).toBe(edited);
    expect(pageHasUnsavedChanges({ store, getBaseline: () => outcome.base })).toBe(true);
  });
});
