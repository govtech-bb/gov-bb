import { describe, expect, it } from "vitest";
import type { ApiPage, ServiceDetail, ServicePage } from "../../src/api/client";
import { listedServiceRows, remoteServiceRows } from "../../src/workspace/service-pages";

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
  last_edited_by: null,
};

const detail = (pages: ServicePage[], formId: string | null = null): ServiceDetail => ({
  service: {
    id: "entry-1",
    url: "/money-financial-support/severance",
    title: "Severance",
    category: { slug: "money-financial-support", title: "Money and financial support" },
    visibility: "public",
    form_id: formId,
    has_start_page: true,
    page_count: pages.length,
    updated_at: "2026-10-07T12:00:00.000Z",
  },
  pages,
});

const servicePage = (
  id: string,
  parent: string | null,
  role: ServicePage["role"],
  visibility: ServicePage["visibility"] = "public",
): ServicePage => ({ ...page, id, parent_id: parent, role, visibility });

describe("an opened service", () => {
  it("lists its entry page, then its start page, then the rest", () => {
    const rows = remoteServiceRows(
      detail([
        servicePage("entry-1", null, "entry"),
        servicePage("page-1", "entry-1", "supporting"),
        servicePage("start-1", "entry-1", "start"),
      ]),
    );

    expect(
      rows.map((row) => [row.document.id, row.document.kind === "page" && row.document.role]),
    ).toEqual([
      ["entry-1", "entry"],
      ["start-1", "start"],
      ["page-1", "supporting"],
    ]);
  });

  it("puts each page before the pages under it, a step deeper, with how far each is published", () => {
    const rows = remoteServiceRows(
      detail([
        servicePage("entry-1", null, "entry"),
        servicePage("fees", "entry-1", "supporting", "preview"),
        servicePage("refunds", "fees", "supporting", "draft"),
        servicePage("start-1", "entry-1", "start"),
        servicePage("start-help", "start-1", "supporting", "draft"),
      ]),
    );

    expect(rows.map((row) => [row.document.id, row.depth, row.visibility])).toEqual([
      ["entry-1", 0, "public"],
      ["start-1", 0, "public"],
      ["start-help", 1, "draft"],
      ["fees", 0, "preview"],
      ["refunds", 1, "draft"],
    ]);
  });

  it("keeps a page whose parent isn't listed, at the top", () => {
    const rows = remoteServiceRows(detail([servicePage("page-1", "entry-1", "supporting")]));

    expect(rows.map((row) => [row.document.id, row.depth])).toEqual([["page-1", 0]]);
  });

  it("a service's form ID does not create a browser-only form row", () => {
    expect(
      remoteServiceRows(detail([servicePage("entry-1", null, "entry")], "existing-form")).map(
        (row) => row.document.id,
      ),
    ).toEqual(["entry-1"]);
  });
});

describe("a service the services list shows, before its pages load", () => {
  it("lists its entry page, named and dotted as the list has it", () => {
    const { service } = detail([]);

    expect(listedServiceRows({ ...service, visibility: "preview" })).toEqual([
      {
        document: expect.objectContaining({ id: "entry-1", title: "Severance", role: "entry" }),
        depth: 0,
        visibility: "preview",
      },
    ]);
  });
});
