import {
  isValidSlug,
  isContentPath,
  isExternalHref,
  parseStartLink,
  applyStartLink,
  placeStartLinkAt,
  insertCategoryEntry,
  isKnownCategory,
  startPageContentPath,
  startPageUrl,
  LANDING_CATEGORIES,
  type StartPageInput,
} from "./-lib";
import { renderStartPageMarkdown, parseContentMarkdown } from "./-render";

const base: StartPageInput = {
  formId: "get-birth-certificate",
  slug: "get-birth-certificate",
  title: "Get a copy of a birth certificate",
  description: "Apply online for a certified copy.",
  category: "family-birth-relationships",
  body: "## What you will need\n\nA debit or credit card.",
  buttonLabel: "Start now",
  visibility: "preview",
  publishDate: "2026-06-10",
};

describe("isValidSlug", () => {
  it("accepts kebab-case", () => {
    expect(isValidSlug("get-birth-certificate")).toBe(true);
  });

  it("rejects slashes, spaces and uppercase", () => {
    expect(isValidSlug("a/b")).toBe(false);
    expect(isValidSlug("a b")).toBe(false);
    expect(isValidSlug("Foo")).toBe(false);
    expect(isValidSlug("../escape")).toBe(false);
  });
});

describe("isContentPath", () => {
  it("accepts a content markdown path", () => {
    expect(isContentPath("apps/landing/src/content/foo.md")).toBe(true);
    expect(isContentPath("apps/landing/src/content/svc/start.md")).toBe(true);
  });

  it("rejects paths outside content, non-md, or traversal", () => {
    expect(isContentPath("apps/api/secrets.md")).toBe(false);
    expect(isContentPath("apps/landing/src/content/foo.ts")).toBe(false);
    expect(isContentPath("apps/landing/src/content/../../x.md")).toBe(false);
  });
});

describe("startPageContentPath", () => {
  it("builds the landing content path", () => {
    expect(startPageContentPath("get-birth-certificate")).toBe(
      "apps/landing/src/content/get-birth-certificate.md",
    );
  });

  it("throws on a path-traversal slug rather than interpolating it", () => {
    expect(() => startPageContentPath("../../etc/passwd")).toThrow();
  });
});

describe("startPageUrl", () => {
  it("joins category and slug", () => {
    expect(
      startPageUrl("family-birth-relationships", "get-birth-certificate"),
    ).toBe("/family-birth-relationships/get-birth-certificate");
  });

  it("drops the category segment when uncategorised", () => {
    expect(startPageUrl("", "get-birth-certificate")).toBe(
      "/get-birth-certificate",
    );
  });
});

describe("renderStartPageMarkdown", () => {
  it("emits the managed frontmatter fields", () => {
    const md = renderStartPageMarkdown(base);
    const { frontmatter } = parseContentMarkdown(md);
    expect(frontmatter.form_id).toBe("get-birth-certificate");
    expect(frontmatter.category).toBe("family-birth-relationships");
    expect(frontmatter.stage).toBe("alpha");
    expect(frontmatter.visibility).toBe("preview");
    expect(frontmatter.title).toBe("Get a copy of a birth certificate");
    expect(frontmatter.description).toBe("Apply online for a certified copy.");
    expect(md).toContain("2026-06-10");
  });

  it("emits the draft view level", () => {
    const { frontmatter } = parseContentMarkdown(
      renderStartPageMarkdown({ ...base, visibility: "draft" }),
    );
    expect(frontmatter.visibility).toBe("draft");
  });

  it("writes subcategory when provided and drops it when blank", () => {
    const withSub = parseContentMarkdown(
      renderStartPageMarkdown({
        ...base,
        category: "youth-and-community",
        subcategory: "arts-culture",
      }),
    ).frontmatter;
    expect(withSub.subcategory).toBe("arts-culture");

    const cleared = parseContentMarkdown(
      renderStartPageMarkdown(
        { ...base, category: "youth-and-community", subcategory: "" },
        { baseFrontmatter: { subcategory: "arts-culture" } },
      ),
    ).frontmatter;
    expect(cleared.subcategory).toBeUndefined();
  });

  it("appends a Start now marker with the chosen label when a form is linked", () => {
    const md = renderStartPageMarkdown({
      ...base,
      buttonLabel: "Apply online",
    });
    expect(md).toContain("<a data-start-link>Apply online</a>");
  });

  it("does NOT append a start marker when there is no linked form", () => {
    const md = renderStartPageMarkdown({ ...base, formId: "", category: "" });
    expect(md).not.toContain("data-start-link");
  });

  it("does not double up when the body already carries a marker", () => {
    const md = renderStartPageMarkdown({
      ...base,
      body: "Intro\n\n<a data-start-link>Start</a>",
    });
    expect(md.match(/data-start-link/g)).toHaveLength(1);
  });

  it("omits the description when blank", () => {
    const { frontmatter } = parseContentMarkdown(
      renderStartPageMarkdown({ ...base, description: "  " }),
    );
    expect(frontmatter.description).toBeUndefined();
  });

  it("escapes special characters in the title via YAML", () => {
    const { frontmatter } = parseContentMarkdown(
      renderStartPageMarkdown({ ...base, title: 'The "big" form' }),
    );
    expect(frontmatter.title).toBe('The "big" form');
  });

  it("preserves unmanaged base frontmatter keys when editing", () => {
    const md = renderStartPageMarkdown(
      { ...base, category: "" },
      {
        baseFrontmatter: {
          subcategory: "youth-development-leadership",
          featured: true,
          category: "education",
        },
      },
    );
    const { frontmatter } = parseContentMarkdown(md);
    expect(frontmatter.subcategory).toBe("youth-development-leadership");
    expect(frontmatter.featured).toBe(true);
    // managed field left blank → the base value is preserved, not wiped
    expect(frontmatter.category).toBe("education");
  });

  it("rejects an unknown category", () => {
    expect(() =>
      renderStartPageMarkdown({ ...base, category: "not-a-category" }),
    ).toThrow(/category/);
  });

  it("only lists known landing categories", () => {
    expect(LANDING_CATEGORIES.length).toBeGreaterThan(0);
    expect(LANDING_CATEGORIES.every((c) => c.slug && c.title)).toBe(true);
  });

  it("recognises the categories that the old hard-coded copy had drifted from", () => {
    // These three existed only in landing before the taxonomy was shared (#1393).
    expect(isKnownCategory("social-empowerment")).toBe(true);
    expect(isKnownCategory("ministry-of-youth")).toBe(true);
    expect(isKnownCategory("housing")).toBe(true);
  });

  it("writes an internal-slug start link with an href and no form_id", () => {
    const { frontmatter, body } = parseContentMarkdown(
      renderStartPageMarkdown({
        ...base,
        linkType: "slug",
        linkHref: "/family-birth-relationships/get-birth-certificate",
        buttonLabel: "Start",
      }),
    );
    expect(frontmatter.form_id).toBeUndefined();
    expect(body).toContain(
      '<a data-start-link href="/family-birth-relationships/get-birth-certificate">Start</a>',
    );
  });

  it("writes an external start link", () => {
    const { frontmatter, body } = parseContentMarkdown(
      renderStartPageMarkdown({
        ...base,
        linkType: "external",
        linkHref: "https://ezpayplus.gov.bb",
      }),
    );
    expect(frontmatter.form_id).toBeUndefined();
    expect(body).toContain(
      '<a data-start-link href="https://ezpayplus.gov.bb">Start now</a>',
    );
  });

  it("removes the marker and form_id when linkType is none", () => {
    const { frontmatter, body } = parseContentMarkdown(
      renderStartPageMarkdown({
        ...base,
        body: "Intro\n\n<a data-start-link>Start</a>\n\nMore text",
        linkType: "none",
      }),
    );
    expect(frontmatter.form_id).toBeUndefined();
    expect(body).not.toContain("data-start-link");
    expect(body).toContain("Intro");
    expect(body).toContain("More text");
  });

  it("rewrites an existing marker in place rather than appending", () => {
    const { body } = parseContentMarkdown(
      renderStartPageMarkdown({
        ...base,
        body: "Intro\n\n<a data-start-link>Old</a>\n\nMore text",
        linkType: "external",
        linkHref: "https://x.test",
        buttonLabel: "Go",
      }),
    );
    expect(body.match(/data-start-link/g)).toHaveLength(1);
    // preserved position: still before "More text", not appended at the end
    expect(body.indexOf("data-start-link")).toBeLessThan(
      body.indexOf("More text"),
    );
    expect(body).toContain('<a data-start-link href="https://x.test">Go</a>');
  });
});

describe("placeStartLinkAt", () => {
  const TAG = "<a data-start-link>Start</a>";

  it("inserts at the cursor on its own paragraph", () => {
    const body = "Intro\n\nMore text";
    const { body: next, cursor } = placeStartLinkAt(body, 5, TAG);
    expect(next).toBe(`Intro\n\n${TAG}\n\nMore text`);
    expect(next.slice(cursor - TAG.length, cursor)).toBe(TAG);
  });

  it("moves an existing marker instead of duplicating it", () => {
    const body = `Intro\n\n${TAG}\n\nMore text`;
    const end = body.length;
    const { body: next } = placeStartLinkAt(body, end, TAG);
    expect(next.match(/data-start-link/g)).toHaveLength(1);
    expect(next.trim().endsWith(TAG)).toBe(true);
  });

  it("snaps a cursor inside the existing marker to its start", () => {
    const body = `A\n\n${TAG}\n\nB`;
    const inside = body.indexOf("data-start-link");
    const { body: next } = placeStartLinkAt(body, inside, TAG);
    expect(next.match(/data-start-link/g)).toHaveLength(1);
  });

  it("handles an empty body", () => {
    const { body: next } = placeStartLinkAt("", 0, TAG);
    expect(next.trim()).toBe(TAG);
  });
});

describe("parseStartLink / applyStartLink", () => {
  it("parses href and label", () => {
    expect(parseStartLink('x <a data-start-link href="/p">Go</a> y')).toEqual({
      href: "/p",
      label: "Go",
    });
    expect(parseStartLink("<a data-start-link>Start</a>")).toEqual({
      href: "",
      label: "Start",
    });
    expect(parseStartLink("no marker here")).toBeNull();
  });

  it("classifies external vs internal hrefs", () => {
    expect(isExternalHref("https://x.test")).toBe(true);
    expect(isExternalHref("mailto:a@b.bb")).toBe(true);
    expect(isExternalHref("/internal/path")).toBe(false);
  });

  it("appends only when there is a target", () => {
    expect(
      applyStartLink("body", { href: "", label: "S", hasTarget: false }),
    ).toBe("body");
    expect(
      applyStartLink("body", { href: "/p", label: "S", hasTarget: true }),
    ).toContain('<a data-start-link href="/p">S</a>');
  });
});

describe("insertCategoryEntry", () => {
  // Mirrors the canonical packages/content/src/categories.ts shape: a
  // CATEGORY_TAXONOMY array of double-quoted entries closed with `];`.
  const SOURCE = `export const CATEGORY_TAXONOMY: Array<Category> = [
  {
    slug: "education",
    title: "Education",
  },
];

export const CATEGORY_BY_SLUG: Record<string, Category> = Object.fromEntries(
  CATEGORY_TAXONOMY.map((c) => [c.slug, c]),
);
`;

  it("inserts a new entry before the array close", () => {
    const next = insertCategoryEntry(SOURCE, {
      slug: "housing-and-land",
      title: "Housing and land",
      description: "Find housing support",
    });
    expect(next).toContain('slug: "housing-and-land",');
    expect(next).toContain('title: "Housing and land",');
    expect(next).toContain('description: "Find housing support",');
    // still inside the array, before the export below
    expect(next!.indexOf("housing-and-land")).toBeLessThan(
      next!.indexOf("CATEGORY_BY_SLUG"),
    );
  });

  it("is a no-op when the slug already exists", () => {
    const next = insertCategoryEntry(SOURCE, {
      slug: "education",
      title: "Education",
    });
    expect(next).toBe(SOURCE);
  });

  it("returns null when the anchor is missing", () => {
    expect(
      insertCategoryEntry("const x = 1", { slug: "a", title: "A" }),
    ).toBeNull();
  });

  it("escapes quotes in titles", () => {
    const next = insertCategoryEntry(SOURCE, {
      slug: "x",
      title: 'The "new" one',
    });
    expect(next).toContain('title: "The \\"new\\" one",');
  });
});

describe("renderStartPageMarkdown with a new category", () => {
  it("allows a category being created in the same deploy", () => {
    const md = renderStartPageMarkdown(
      { ...base, category: "housing-and-land" },
      { allowCategories: ["housing-and-land"] },
    );
    expect(parseContentMarkdown(md).frontmatter.category).toBe(
      "housing-and-land",
    );
  });

  it("still rejects unknown categories not being created", () => {
    expect(() =>
      renderStartPageMarkdown(
        { ...base, category: "housing-and-land" },
        { allowCategories: ["something-else"] },
      ),
    ).toThrow(/category/);
  });
});

describe("parseContentMarkdown", () => {
  it("round-trips rendered output back to frontmatter + body", () => {
    const { frontmatter, body } = parseContentMarkdown(
      renderStartPageMarkdown(base),
    );
    expect(frontmatter.title).toBe(base.title);
    expect(body).toContain("What you will need");
    expect(body).toContain("<a data-start-link>Start now</a>");
  });
});
