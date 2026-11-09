import { describe, expect, it } from "vitest";
import { PageId, PageUrl, revisionOf, type PageDocument } from "./page";

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

describe("PageUrl", () => {
  it.each([
    "/x",
    "/services/apply",
    "/a.b_c~d-e",
    "/café",
    "/%2F%2Fexample.test",
    `/${"a".repeat(200)}`,
    `/${"a".repeat(200)}/${"b".repeat(200)}/${"c".repeat(109)}`,
  ])("accepts the page path %j without rewriting it", (url) => {
    expect(PageUrl.parse(url)).toBe(url);
  });

  it.each([
    "",
    "/",
    "services/apply",
    "//outside.test/page",
    "/\\outside.test/page",
    "\\outside.test/page",
    "/a\\b",
    "/\t/outside.test/page",
    "/a b",
    "/a\u00a0b",
    "/a\u0000b",
    "/a\u001fb",
    "/a\u007fb",
    "/page\n",
    "/services//apply",
    "/services/apply/",
    "/services/apply?draft=1",
    "/services/apply#fees",
    "https://outside.test/page",
    `/${"a".repeat(201)}`,
    `/${"a".repeat(200)}/${"b".repeat(200)}/${"c".repeat(110)}`,
  ])("rejects the invalid page path %j", (url) => {
    expect(PageUrl.safeParse(url).success).toBe(false);
  });
});

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
