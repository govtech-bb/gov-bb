import { describe, expect, it } from "vitest";
import type { ApiPage, ServiceDetail } from "../../src/api/client";
import { servicePageDocuments } from "../../src/workspace/service-pages";

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

    expect(servicePageDocuments(detail).map((document) => [document.id, document.role])).toEqual([
      ["entry-1", "entry"],
      ["start-1", "start"],
      ["page-1", "supporting"],
    ]);
  });
});
