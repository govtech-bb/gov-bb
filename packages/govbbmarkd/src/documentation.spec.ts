import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileContentMarkdown, parseContentMarkdown } from "./index.ts";

const guide = readFileSync(
  new URL("../../../docs/content-markdown.md", import.meta.url),
  "utf8",
);
const examples = parseContentMarkdown(guide)
  .root.children.filter((node) => node.type === "code")
  .filter((node) => node.lang === "md")
  .map((node) => node.value);

describe("the authoring guide", () => {
  it("contains Markdown examples to verify", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples)("compiles its copyable example: %s", (source) => {
    const result = compileContentMarkdown(source);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
