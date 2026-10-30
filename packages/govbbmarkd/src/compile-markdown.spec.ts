import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  analyzeContentMarkdown,
  compileContentMarkdown,
} from "./compile-markdown.ts";

describe("compileContentMarkdown", () => {
  it("preserves leading rules in bodies whose metadata is stored separately", () => {
    const body = "---\n\nYou must submit before Friday.\n\n---\n\nApply below.";
    const result = compileContentMarkdown(body, { frontmatter: false });
    expect(result.ok && result.value.text).toBe(
      "You must submit before Friday. Apply below.",
    );
    expect(analyzeContentMarkdown(body, { frontmatter: false }).text).toBe(
      "You must submit before Friday. Apply below.",
    );
  });
  it("returns located diagnostics instead of a partial render tree", () => {
    const result = compileContentMarkdown(
      ':::action{href="javascript:alert(1)"}\nRun\n:::',
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected invalid Markdown");
    expect(result.errors[0]).toMatchObject({
      code: "unsafe-url",
      line: 1,
      column: 1,
    });
    expect(result).not.toHaveProperty("value");
  });

  it("escapes raw HTML by default and requires an explicit legacy opt-in", () => {
    const source = "<script>alert(1)</script>\n\n<notice>Keep this</notice>";
    const escaped = compileContentMarkdown(source);
    const legacy = compileContentMarkdown(source, { html: "legacy" });
    expect(escaped.ok && escaped.value.hast.children[0]).toMatchObject({
      type: "text",
      value: "<script>alert(1)</script>",
    });
    expect(legacy.ok && legacy.value.hast.children[0]).toMatchObject({
      type: "element",
      tagName: "script",
    });
  });

  it("uses the same heading ids for the outline and rendered links", () => {
    const result = compileContentMarkdown(
      "## Fees **and** costs\n\nFirst.\n\n## Fees and costs\n\nSecond.",
    );
    if (!result.ok) throw result.errors[0];
    expect(result.value.outline).toEqual([
      { id: "fees-and-costs", depth: 2, text: "Fees and costs" },
      { id: "fees-and-costs-1", depth: 2, text: "Fees and costs" },
    ]);
    const headings = result.value.hast.children.filter(
      (node) => node.type === "element" && node.tagName === "h2",
    );
    expect(
      headings.map((node) => node.type === "element" && node.properties.id),
    ).toEqual(result.value.outline.map((heading) => heading.id));
    expect(result.value.text).toBe(
      "Fees and costs First. Fees and costs Second.",
    );
  });
});

describe("analyzeContentMarkdown", () => {
  it.each(['href="/apply"', 'form="birth"', 'target="form"'])(
    "separates action labels without separating ordinary inline links: %s",
    (destination) => {
      const source = `::::actions\n:::action{${destination}}\nApply now\n:::\n:::action{href="/guide" variant="secondary"}\nRead guidance\n:::\n::::\n\npre[fix](/guide)ed`;
      const result = analyzeContentMarkdown(source);
      expect(result.errors).toEqual([]);
      expect(result.text).toBe("Apply now Read guidance prefixed");
    },
  );
  it("indexes visible component labels and bodies, not directives or attributes", () => {
    const result = analyzeContentMarkdown(
      [
        ':::action{form="birth-certificate"}',
        "Apply **now**",
        ":::",
        "",
        ':::details{summary="What you need"}',
        "Bring ID.",
        ":::",
        "",
        "::::summary-list",
        ":::summary-item[Fee]",
        "BBD 50",
        ":::",
        "::::",
        "",
        ':::table[Charges]{numeric-columns="2"}',
        "| Service | Cost |",
        "| --- | --- |",
        "| Copy | 10 |",
        ":::",
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.text).toBe(
      "Apply now What you need Bring ID. Fee BBD 50 Charges Service Cost Copy 10",
    );
  });

  it("understands setext headings, references, entities and footnotes without indexing code examples", () => {
    const result = analyzeContentMarkdown(
      [
        "---",
        "title: Not body text",
        "---",
        "",
        "Intro [help][guide] &amp; advice.",
        "",
        "Fees",
        "----",
        "",
        "A fact[^source].",
        "",
        "~~~md",
        "## Not a heading",
        ':::action{form="example"}',
        "~~~",
        "",
        "[guide]: /guidance",
        "[^source]: Supporting evidence.",
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.outline).toEqual([{ id: "fees", depth: 2, text: "Fees" }]);
    expect(result.text).toBe(
      "Intro help & advice. Fees A fact. Supporting evidence.",
    );
    expect(result.sections).toEqual([
      { heading: null, text: "Intro help & advice." },
      {
        heading: { id: "fees", depth: 2, text: "Fees" },
        text: "A fact. Supporting evidence.",
      },
    ]);
  });

  it("reads legacy HTML headings and visible text, but not scripts, styles or attributes", () => {
    const result = analyzeContentMarkdown(
      '<h2 id="authored">Fees</h2>\n<p>A &amp; B</p>\n<script>hidden()</script>\n<style>.hidden{}</style>',
    );
    expect(result.outline).toEqual([
      { id: "authored", depth: 2, text: "Fees" },
    ]);
    expect(result.text).toBe("Fees A & B");
  });

  it("retains errors while extracting an incomplete draft's text", () => {
    const result = analyzeContentMarkdown(":::details[More]\nUnfinished copy.");
    expect(result.errors.some((error) => error.code === "missing-fence")).toBe(
      true,
    );
    expect(result.text).toBe("More Unfinished copy.");
    expect(result).not.toHaveProperty("hast");
  });

  it("rejoins sections to the document text for generated prose and headings", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            heading: fc.boolean(),
            text: fc.stringMatching(/^[a-zA-Z0-9 ]{1,60}$/),
          }),
          { maxLength: 20 },
        ),
        (parts) => {
          const source = parts
            .map((part) => (part.heading ? "## " : "") + part.text)
            .join("\n\n");
          const result = analyzeContentMarkdown(source);
          expect(
            result.sections
              .flatMap((section) => [section.heading?.text ?? "", section.text])
              .filter(Boolean)
              .join(" "),
          ).toBe(result.text);
          expect(
            new Set(result.outline.map((heading) => heading.id)).size,
          ).toBe(result.outline.length);
        },
      ),
      { numRuns: 150 },
    );
  });
});
