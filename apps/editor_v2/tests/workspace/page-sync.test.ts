import { describe, expect, it } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
  REDO_COMMAND,
} from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $setPageMetadata } from "../../src/pages/metadata";
import { ApiFailure, type ApiPage, type SavePageInput } from "../../src/api/client";
import type { Category } from "../../src/api/categories";
import { pageToMarkdown } from "../../src/api/page-markdown";
import { pageHasUnsavedChanges } from "../../src/workspace/page-session";
import {
  landedSubmission,
  preparePageSave,
  retryPageSave,
  savePageDraft,
} from "../../src/workspace/page-sync";
import { DraftStore } from "../../src/persistence/draft-store";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

const page: ApiPage = {
  version: 1,
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
  last_edited_by: null,
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

  it.each([
    ["title", "public", { title: "Renamed" }],
    ["details", "preview", { description: "New description" }],
    ["publishing", "preview", { visibility: "public" }],
    ["hiding", "public", { visibility: "preview" }],
  ] as const)(
    "preserves the exact body when only %s changes",
    async (_name, visibility, details) => {
      for (const body of [
        "\n\nFirst line  \nSecond line\n\n",
        "\r\nFirst line  \r\nSecond line\r\n",
        "  \n\t ",
        "",
        "---\n\nInstructions\n\n---",
      ]) {
        const original = { ...page, visibility, body_markdown: body };
        const markdown = pageToMarkdown(original, []);
        const prepared = govbbPageCodec.prepare(markdown);

        if (prepared.mode === "source") throw new Error("Expected a visual page");
        const editor = createHeadlessEditor(govbbPageEditor, prepared.state);
        const sent: SavePageInput[] = [];

        try {
          editor.update(() => $setPageMetadata(details), { discrete: true });

          const outcome = await savePageDraft(
            {
              savePage: async (_id, fields) => {
                sent.push(fields);

                return { ...original, ...fields };
              },
            },
            { page: original, markdown },
            govbbPageCodec.encode(editor.getEditorState().toJSON()),
            [],
          );

          expect(outcome.kind, JSON.stringify(body)).toBe("saved");
          expect(sent, JSON.stringify(body)).toEqual([
            expect.objectContaining({ ...details, body_markdown: body }),
          ]);
        } finally {
          editor.dispose();
        }
      }
    },
  );

  it("saves real body edits, shares undo with details, and keeps that body on later detail saves", async () => {
    const original = { ...page, body_markdown: "\nFirst line  \nSecond line\n\n" };
    let base = { page: original, markdown: pageToMarkdown(original, []) };
    const prepared = govbbPageCodec.prepare(base.markdown);

    if (prepared.mode === "source") throw new Error("Expected a visual page");
    const editor = createHeadlessEditor(govbbPageEditor, prepared.state);
    const sent: SavePageInput[] = [];

    const save = async () => {
      const outcome = await savePageDraft(
        {
          savePage: async (_id, fields) => {
            sent.push(fields);

            return { ...base.page, ...fields, updated_at: newer.updated_at };
          },
        },
        base,
        govbbPageCodec.encode(editor.getEditorState().toJSON()),
        [],
      );

      if (outcome.kind !== "saved") throw new Error("Expected the page to save");
      base = outcome.base;

      return base.page;
    };

    try {
      editor.update(() => $setPageMetadata({ title: "Renamed" }), {
        discrete: true,
        tag: HISTORY_PUSH_TAG,
      });
      editor.update(
        () => $getRoot().append($createParagraphNode().append($createTextNode("New instructions"))),
        {
          discrete: true,
          tag: HISTORY_PUSH_TAG,
        },
      );
      editor.dispatchCommand(UNDO_COMMAND, undefined);
      await Promise.resolve();
      expect(await save()).toMatchObject({
        title: "Renamed",
        body_markdown: original.body_markdown,
      });

      editor.dispatchCommand(UNDO_COMMAND, undefined);
      await Promise.resolve();
      expect(await save()).toMatchObject({
        title: original.title,
        body_markdown: original.body_markdown,
      });

      editor.dispatchCommand(REDO_COMMAND, undefined);
      await Promise.resolve();
      editor.dispatchCommand(REDO_COMMAND, undefined);
      await Promise.resolve();
      const body = "First line  \nSecond line\n\nNew instructions";
      expect(await save()).toMatchObject({ title: "Renamed", body_markdown: body });

      editor.update(() => $setPageMetadata({ description: "Changed later" }), { discrete: true });
      expect(await save()).toMatchObject({ description: "Changed later", body_markdown: body });

      editor.update(() => $getRoot().clear(), { discrete: true });
      expect(await save()).toMatchObject({ title: "Renamed", body_markdown: "" });
      expect(sent).toHaveLength(5);
    } finally {
      editor.dispose();
    }
  });

  it("saves the draft over the version it was edited from", async () => {
    const sent: { fields: SavePageInput; expectedVersion: number }[] = [];
    const edited = markdown.replace("Hello", "Hello again");

    const outcome = await savePageDraft(
      {
        savePage: async (_id, fields, expectedVersion) => {
          sent.push({ fields, expectedVersion });

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
        expectedVersion: page.version,
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
      version: 1,
      reserved_route: false,
      last_edited_by: null,
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
    [new ApiFailure(409, [], undefined, "version_conflict"), { kind: "conflict" }],
    [new ApiFailure(404), { kind: "missing" }],
    [new ApiFailure(401), { kind: "signed-out" }],
    [
      new ApiFailure(403, [], "Only approvers can change who can see a page."),
      { kind: "forbidden", message: "Only approvers can change who can see a page." },
    ],
    [
      new ApiFailure(403),
      { kind: "forbidden", message: "You don’t have permission to save this change." },
    ],
    [new ApiFailure(503), { kind: "unknown" }],
    [new ApiFailure(0), { kind: "unknown" }],
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

describe("retrying a save whose answer was lost", () => {
  const edited = markdown.replace("Hello", "Hello again");
  const prepared = preparePageSave({ page, markdown }, edited, []);

  if (!prepared.ok) throw new Error("The edit should be ready to save");
  const sent = prepared.attempt;

  // The save landed: a public page's edit waits for an approver as a draft change
  const landed: ApiPage = {
    ...page,
    body_markdown: "Hello again",
    version: 2,
    pending_revision: { status: "draft", comment: null },
  };

  const contentApi = (read: () => Promise<ApiPage>) => {
    const writes: number[] = [];

    return {
      writes,
      page: read,
      savePage: async (_id: string, _fields: SavePageInput, expectedVersion: number) => {
        writes.push(expectedVersion);

        return landed;
      },
    };
  };

  it("confirms a save that landed, without sending it again", async () => {
    const remote = contentApi(async () => landed);

    expect(await retryPageSave(remote, sent)).toEqual({
      kind: "saved",
      base: { page: landed, markdown: edited },
    });
    expect(remote.writes).toEqual([]);
  });

  it.each([
    ["the page hasn't moved", page],
    ["the page holds other text", { ...landed, body_markdown: "Someone else's" }],
    [
      "the change was submitted for review meanwhile",
      { ...landed, pending_revision: { status: "submitted" as const, comment: null } },
    ],
  ])("sends the same request again when %s", async (_case, read) => {
    const remote = contentApi(async () => read);

    await retryPageSave(remote, sent);
    expect(remote.writes).toEqual([page.version]);
  });

  it("sends the same request again when the page can't be read", async () => {
    const remote = contentApi(async () => {
      throw new ApiFailure(0);
    });

    await retryPageSave(remote, sent);
    expect(remote.writes).toEqual([page.version]);
  });
});

describe("retrying a submission whose answer was lost", () => {
  const drafted: ApiPage = { ...page, pending_revision: { status: "draft", comment: null } };
  const sent = { page: drafted, markdown: pageToMarkdown(drafted, []) };

  const submitted: ApiPage = {
    ...drafted,
    version: 2,
    pending_revision: { status: "submitted", comment: null },
  };

  it("finds a submission that landed", async () => {
    expect(await landedSubmission({ page: async () => submitted }, sent, [])).toBe(submitted);
  });

  it.each([
    ["the page hasn't moved", drafted],
    [
      "nothing is waiting for an approver",
      { ...submitted, pending_revision: { status: "draft" as const, comment: null } },
    ],
    ["the text waiting isn't the text submitted", { ...submitted, title: "Changed meanwhile" }],
  ])("finds none when %s", async (_case, read) => {
    expect(await landedSubmission({ page: async () => read }, sent, [])).toBeUndefined();
  });

  it("finds none when the page can't be read", async () => {
    const unreachable = async (): Promise<ApiPage> => {
      throw new ApiFailure(0);
    };

    expect(await landedSubmission({ page: unreachable }, sent, [])).toBeUndefined();
  });
});
