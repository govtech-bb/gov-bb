import { describe, expect, it } from "vitest";
import { featureRoutePage } from "./feature-route-pages";

describe("featureRoutePage", () => {
  it("keeps a preview page's visibility and files it under its subcategory", () => {
    expect(
      featureRoutePage({
        url: "some-category/some-tool",
        title: "Some tool",
        description: "Does something.",
        category: "some-category",
        subcategory: "some-subcategory",
        visibility: "preview",
      }),
    ).toStrictEqual({
      url: "/some-category/some-tool",
      category: "some-subcategory",
      parent: null,
      title: "Some tool",
      description: "Does something.",
      visibility: "preview",
      form_id: null,
      content_slug: "some-category/some-tool",
      published_at: null,
      body_markdown: "",
      frontmatter: {},
    });
  });
});
