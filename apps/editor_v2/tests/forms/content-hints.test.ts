import { expect, test } from "vitest";
import { createFormSourceDialect } from "../../src/forms/source/dialect";
import { paragraphContent, headingContents } from "../../src/forms/editor/content-adapters";
import { shortAnswerField } from "../../src/forms/features/short-answer/definition";

test("question hints use installed paragraph and heading codecs independently of their kind names", () => {
  const heading = { ...headingContents[1]!.source, kind: "section-heading" };
  let emitted = 0;

  const dialect = createFormSourceDialect(
    [shortAnswerField.source],
    [
      paragraphContent.source,
      {
        ...heading,
        toNode: (_content, node) => {
          emitted++;

          return node;
        },
      },
    ],
  );

  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Service\n---\n\n# Details\n\n::text[Name]{#name}\n::hint[Read **this**]{kind="section-heading"}\n';

  const parsed = dialect.readMarkdown(source);
  expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
  const state = dialect.toEditor(parsed.document!);
  expect(state.root.children.find((node) => node.type === "heading")).toMatchObject({ tag: "h2" });
  expect(emitted).toBeGreaterThan(0);
  const canonical = dialect.writeMarkdown(dialect.fromEditor(state));
  expect(canonical).toContain('::hint[Read **this**]{kind="section-heading"}');
  const restored = dialect.readMarkdown(canonical);
  expect(restored.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
  expect(dialect.writeMarkdown(restored.document!)).toBe(canonical);
});
