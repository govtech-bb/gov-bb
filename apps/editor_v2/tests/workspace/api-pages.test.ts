import { describe, expect, it } from "vitest";
import {
  ApiFailure,
  type ApiPage,
  type SaveFields,
  type ServiceDetail,
} from "../../src/api/client";
import {
  detailsKey,
  parseDetails,
  parseServerBase,
  restoredDetails,
  savePage,
  seedApiPage,
  serverBaseKey,
  serviceDocuments,
} from "../../src/workspace/api-pages";
import { documentKeys } from "../../src/workspace/model";
import { detailsOf } from "../../src/workspace/page-details";

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
};

const newer: ApiPage = {
  ...page,
  title: "How severance pay is worked out",
  updated_at: "2026-10-07T13:00:00.000Z",
};

const keys = documentKeys(page.id);

// The editor writes a body with a closing newline.
const body = "Hello\n";

const details = detailsOf(page);

function browser(entries: [string, string][] = []) {
  const values = new Map(entries);

  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  };
}

const based = (base: ApiPage, committed: string, ...rest: [string, string][]) =>
  browser([
    [keys.committed, committed],
    [serverBaseKey(page.id), JSON.stringify({ page: base, body })],
    [detailsKey(page.id), JSON.stringify(detailsOf(base))],
    ...rest,
  ]);

const baseOf = (values: Map<string, string>) =>
  parseServerBase(values.get(serverBaseKey(page.id)) ?? null, page.id);

const detailsIn = (values: Map<string, string>) =>
  parseDetails(values.get(detailsKey(page.id)) ?? null);

describe("seeding a page from the content API", () => {
  it("writes the server's version when this browser has no draft", () => {
    const { values, storage } = browser();
    seedApiPage(storage, page);

    expect(values.get(keys.committed)).toBe(body);
    expect(detailsIn(values)).toEqual(details);
    expect(baseOf(values)).toEqual({ page, body });
  });

  it("follows the server when the draft has nothing unsaved", () => {
    const { values, storage } = based(page, body);
    seedApiPage(storage, newer);

    expect(values.get(keys.committed)).toBe(body);
    expect(detailsIn(values)?.title).toBe(newer.title);
    expect(baseOf(values)?.page).toEqual(newer);
  });

  it("keeps a draft with unsaved changes and the version it was edited from", () => {
    const { values, storage } = based(page, `${body}\nMore\n`);
    seedApiPage(storage, newer);

    expect(values.get(keys.committed)).toBe(`${body}\nMore\n`);
    expect(baseOf(values)?.page).toEqual(page);
  });

  it("keeps a draft whose details have unsaved changes", () => {
    const { values, storage } = based(page, body, [
      detailsKey(page.id),
      JSON.stringify({ ...details, title: "Edited here" }),
    ]);

    seedApiPage(storage, newer);

    expect(detailsIn(values)?.title).toBe("Edited here");
    expect(baseOf(values)?.page).toEqual(page);
  });

  it("keeps a draft whose Markdown has not been applied yet", () => {
    const { values, storage } = based(page, body, [keys.working, `${body}\nTyping\n`]);
    seedApiPage(storage, newer);

    expect(values.get(keys.committed)).toBe(body);
    expect(baseOf(values)?.page).toEqual(page);
  });

  it("keeps a draft this browser never matched to the server, against the server's version", () => {
    const { values, storage } = browser([[keys.committed, "Written before the API"]]);
    seedApiPage(storage, page);

    expect(values.get(keys.committed)).toBe("Written before the API");
    expect(detailsIn(values)).toEqual(details);
    expect(baseOf(values)?.page).toEqual(page);
  });

  it("replaces a draft from when page details were YAML in the body", () => {
    const markdown = `---\ntitle: ${page.title}\n---\n\nHello\n`;

    const { values, storage } = browser([
      [keys.committed, `${markdown}\nUnsaved\n`],
      [keys.working, markdown],
      [serverBaseKey(page.id), JSON.stringify({ page, markdown })],
    ]);

    seedApiPage(storage, page);

    expect(values.get(keys.committed)).toBe(body);
    expect(values.has(keys.working)).toBe(false);
    expect(baseOf(values)).toEqual({ page, body });
  });

  it("ignores a stored version it cannot read, or one for another page", () => {
    expect(parseServerBase("{", page.id)).toBeUndefined();
    expect(
      parseServerBase(JSON.stringify({ page: { ...page, id: "page-2" }, body }), page.id),
    ).toBeUndefined();
  });
});

describe("an opened service", () => {
  it("lists its entry page, then its start page, then the rest", () => {
    const detail: ServiceDetail = {
      service: {
        id: "entry-1",
        url: "/money-financial-support/severance",
        title: "Severance",
        category: { slug: "money-financial-support", title: "Money and financial support" },
        visibility: "public",
        form_id: null,
        has_start_page: true,
        page_count: 3,
        updated_at: "2026-10-07T12:00:00.000Z",
      },
      pages: [
        { ...page, id: "entry-1", parent_id: null, role: "entry" },
        { ...page, id: "page-1", parent_id: "entry-1", role: "supporting" },
        { ...page, id: "start-1", parent_id: "entry-1", role: "start" },
      ],
    };

    expect(serviceDocuments(detail).map((document) => [document.id, document.role])).toEqual([
      ["entry-1", "entry"],
      ["start-1", "start"],
      ["page-1", "supporting"],
    ]);
  });
});

describe("saving a page", () => {
  const base = { page, body };

  it("saves the draft over the version it was edited from", async () => {
    const sent: { fields: SaveFields; ifUpdatedAt: string }[] = [];
    const edited = "Hello again\n";

    const outcome = await savePage(
      {
        savePage: async (_id, fields, ifUpdatedAt) => {
          sent.push({ fields, ifUpdatedAt });

          return { ...newer, body_markdown: fields.body_markdown };
        },
      },
      base,
      details,
      edited,
    );

    expect(sent).toEqual([
      {
        fields: expect.objectContaining({ body_markdown: "Hello again" }),
        ifUpdatedAt: page.updated_at,
      },
    ]);
    expect(outcome).toEqual({
      kind: "saved",
      base: { page: { ...newer, body_markdown: "Hello again" }, body: edited },
    });
  });

  it("sends nothing when a service's entry page has no category", async () => {
    let called = false;

    const outcome = await savePage(
      {
        savePage: async () => {
          called = true;

          return page;
        },
      },
      { page: { ...page, parent_id: null }, body },
      { ...details, category_id: null },
      body,
    );

    expect(called).toBe(false);
    expect(outcome).toEqual({
      kind: "invalid",
      errors: [{ field: "category", message: "Choose a category" }],
    });
  });

  it.each([
    [
      new ApiFailure(422, [{ field: "url", message: "Taken" }]),
      { kind: "invalid", errors: [{ field: "url", message: "Taken" }] },
    ],
    [new ApiFailure(409), { kind: "conflict" }],
    [new ApiFailure(404), { kind: "missing" }],
    [new ApiFailure(401), { kind: "signed-out" }],
    [new ApiFailure(503), { kind: "failed" }],
    [new ApiFailure(0), { kind: "failed" }],
  ])("turns a %s refusal into what the editor does about it", async (failure, expected) => {
    const outcome = await savePage(
      {
        savePage: async () => {
          throw failure;
        },
      },
      base,
      details,
      body,
    );

    expect(outcome).toEqual(expected);
  });
});

describe("restoring a version", () => {
  it("brings back its content and keeps the page's path, category and visibility", () => {
    const current = { ...details, url: "/money/moved", visibility: "draft" as const };

    const old = {
      ...page,
      url: "/money/old",
      title: "Old title",
      body_markdown: "Old body",
      frontmatter: { lede: "Old introduction" },
    };

    expect(restoredDetails(current, old)).toEqual({
      ...current,
      title: "Old title",
      frontmatter: { lede: "Old introduction" },
    });
  });
});
