import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CategoryFields,
  CategoryId,
  parseCategoryFields,
  RESERVED_CATEGORY_PATHS,
  type CategoryValues,
  type CategoryRejected,
} from "./category";
import type { PageId } from "./page";
import type { Result } from "./result";
import { expectOk } from "../test-db";

describe("category rules", () => {
  it("keeps category ids distinct from page ids", () => {
    expectTypeOf<CategoryId>().not.toExtend<PageId>();
    expectTypeOf<CategoryId>().not.toEqualTypeOf<string>();
  });

  it("preserves the complete parser contracts without widening their error channels", () => {
    expectTypeOf(parseCategoryFields).toEqualTypeOf<
      (fields: CategoryFields) => Result<CategoryValues, CategoryRejected>
    >();
  });

  it("normalizes editable text without rewriting slugs", () => {
    const result = expectOk(
      parseCategoryFields(
        CategoryFields.parse({
          title: "  Renamed  ",
          slug: "original",
          parent_id: null,
          description: "  ",
        }),
      ),
    );
    expect(result).toEqual({
      title: "Renamed",
      slug: "original",
      parent_id: null,
      description: null,
    });
    expect(parseCategoryFields({ ...result, slug: "Not-normalized" }).ok).toBe(
      false,
    );
  });

  it("accounts for every landing file route and top-level asset directory", () => {
    const source = readFileSync(
      join(__dirname, "../../../landing/src/routeTree.gen.ts"),
      "utf8",
    );
    const paths = new Set(
      [...source.matchAll(/^ {2}'(\/[^']*)':/gm)].map((match) => match[1]),
    );
    expect(paths.has("/services")).toBe(true);
    expect(paths.size).toBeGreaterThan(20);
    for (const path of paths) {
      if (!path || path === "/" || path === "/$") continue;
      const segments = path.split("/").filter(Boolean);
      if (segments.some((segment) => segment.includes("."))) {
        expect(
          parseCategoryFields({
            title: "Route",
            slug: segments[0] ?? "",
            parent_id: null,
            description: null,
          }).ok,
        ).toBe(false);
        continue;
      }
      const prefix = "/" + segments.slice(0, 2).join("/");
      expect(RESERVED_CATEGORY_PATHS, path).toContain(prefix);
    }
    for (const entry of readdirSync(
      join(__dirname, "../../../landing/public"),
      { withFileTypes: true },
    ))
      if (entry.isDirectory())
        expect(RESERVED_CATEGORY_PATHS).toContain("/" + entry.name);
  });
});
