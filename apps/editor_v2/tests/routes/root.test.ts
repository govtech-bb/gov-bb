import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { Route } from "../../src/routes/__root";

type Head = {
  meta: { name?: string; content?: string }[];
  links: { rel?: string; type?: string; sizes?: string; href?: string }[];
};

// SAFETY: The root's head reads nothing from the match it's given, and returns its tags at once.
const head = Route.options.head as () => Head;

test("the browser's bar takes the header's navy, the design system's blue-80", () => {
  const tokens = readFileSync(
    createRequire(import.meta.url).resolve("@govtech-bb/frontend/tokens.css"),
    "utf8",
  );

  const navy = /--govbb-blue-80:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];

  expect(navy).toBeDefined();
  expect(head().meta).toContainEqual({ name: "theme-color", content: navy });
});

test("the tab shows GovBB's icon from the design system, the SVG where a browser takes one", () => {
  expect(head().links.filter((link) => link.rel === "icon")).toEqual([
    { rel: "icon", href: expect.stringMatching(/favicon\.ico/), sizes: "16x16 32x32 48x48" },
    {
      rel: "icon",
      type: "image/svg+xml",
      sizes: "any",
      href: expect.stringMatching(/favicon\.svg|^data:image\/svg\+xml/),
    },
  ]);
});
