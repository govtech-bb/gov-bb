import { HorizontalRuleNode } from "@lexical/extension";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import {
  LandingComponentNode,
  RawBreakNode,
  StartLinkNode,
} from "./-body-editor-nodes";
import {
  $exportMarkdown,
  $loadMarkdown,
  parseActionDirective,
} from "./-body-editor-markdown";

function roundTrip(markdown: string): string {
  const editor = createEditor({
    namespace: "body-editor-test",
    nodes: [
      CodeNode,
      HeadingNode,
      HorizontalRuleNode,
      LandingComponentNode,
      LinkNode,
      ListItemNode,
      ListNode,
      QuoteNode,
      RawBreakNode,
      StartLinkNode,
      TableCellNode,
      TableNode,
      TableRowNode,
    ],
    onError(error) {
      throw error;
    },
  });
  editor.update(() => $loadMarkdown(markdown), { discrete: true });
  return editor.getEditorState().read(() => $exportMarkdown());
}

describe("body editor Markdown conversion", () => {
  it("round-trips landing components in their readable directive format", () => {
    const markdown = [
      ":::notice",
      "Bring **photo identification**.",
      ":::",
      "",
      ':::details{summary="What you need"}',
      "Your reference number.",
      ":::",
      "",
      ":::actions",
      '::action[Apply now]{href="/apply"}',
      '::action[Get help]{href="mailto:help@example.gov.bb" variant="secondary"}',
      ":::",
    ].join("\n");

    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("round-trips tables, raw breaks, and the start-link marker", () => {
    const markdown = [
      "| Service | Telephone |",
      "| --- | --- |",
      "| Registry | (246) 535-9700 |",
      "",
      "First line<br />Second line",
      "",
      '<a data-start-link href="/apply">Apply now</a>',
    ].join("\n");

    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps an indented start marker inside an ordered application list", () => {
    const markdown = [
      "1. Apply online:",
      '   <a data-start-link href="/apply">Apply now</a>',
      "",
      "2. Apply in person.",
    ].join("\n");

    expect(roundTrip(markdown)).toBe(markdown.replace("\n\n2.", "\n2."));
  });

  it("parses action attributes without allowing an absent href", () => {
    expect(
      parseActionDirective(
        '::action[Get help]{href="/help" variant="secondary"}',
      ),
    ).toEqual({ label: "Get help", href: "/help", variant: "secondary" });
    expect(parseActionDirective("::action[Broken]{}")).toBeNull();
  });
});
