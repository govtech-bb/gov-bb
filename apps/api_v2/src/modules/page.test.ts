import { describe, expect, it } from "vitest";
import { PageId, revisionOf, type PageDocument } from "./page";

const saved: PageDocument = {
  id: PageId.parse("11111111-1111-4111-8111-111111111111"),
  url: "/money-financial-support/calculate-severance-pay",
  slug: "calculate-severance-pay",
  category_id: null,
  parent_id: null,
  title: "Calculate severance pay",
  description: null,
  visibility: "draft",
  form_id: null,
  body_markdown: "",
  frontmatter: {},
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
};

describe("revisionOf", () => {
  it.each([
    ["in the same millisecond", "2026-10-07T12:00:00.000Z"],
    ["by a clock that has gone back", "2026-10-07T11:59:59.000Z"],
  ])(
    "moves updated_at forward when saved %s, so a stale read still conflicts",
    (_when, now) => {
      expect(
        revisionOf(saved, saved, new Date(now)).updatedAt.toISOString(),
      ).toBe("2026-10-07T12:00:00.001Z");
    },
  );
});
