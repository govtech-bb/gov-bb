import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { $nodesOfType } from "lexical";
import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { $setPageMetadata } from "../../src/pages/metadata";
import { PageComponentNode } from "../../src/pages/nodes";
import { PagePreview } from "../../src/pages/preview";

const formAction = ':::action{form="birth-certificate"}\nStart **now**\n:::';

const components = [
  formAction,
  ':::action{href="/apply"}\nApply\\\nnow\n:::',
  ':::details{summary="Contact help@example.gov.bb"}\nInformation\n:::',
  ':::action{target="form"}\nApply\n:::',
  '::::actions\n:::action{href="/next"}\nContinue\n:::\n:::action{href="/help" variant="secondary"}\nGet help\n:::\n::::',
  ":::details[Before you apply]\nBring identification.\n:::",
  ':::table[Fees]{row-headers="first" numeric-columns="2"}\n| Service | Fee |\n| --- | ---: |\n| Certificate | 50 |\n:::',
  "::::summary-list\n:::summary-item[Documents]\n- Passport\n- Proof of address\n:::\n:::summary-item[Fee]\nBBD **50**\n:::\n::::",
];

describe("GovBB Markdown editor integration", () => {
  it.each(components)("preserves bytes until an edit, then preserves the component: %s", (body) => {
    const source = `---\ntitle: Original\n---\n\n${body}\n`;
    const prepared = govbbPageCodec.prepare(source);
    expect(prepared.mode).toBe("visual");

    if (prepared.mode !== "visual") throw new Error(prepared.diagnostics[0]?.message);
    expect(govbbPageCodec.encode(prepared.state)).toBe(source);
    const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

    try {
      editor.update(() => $setPageMetadata({ title: "Updated" }), { discrete: true });
      const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
      expect(parseContentMarkdown(encoded).errors).toEqual([]);
      const reopened = govbbPageCodec.prepare(encoded);
      expect(reopened.mode).toBe("visual");

      if (reopened.mode !== "visual") throw new Error(reopened.diagnostics[0]?.message);
      expect(reopened.state.root.children.slice(1)).toEqual(prepared.state.root.children.slice(1));
    } finally {
      editor.dispose();
    }
  });

  it("writes legacy leaf actions and details attributes in the fenced dialect after a visual edit", () => {
    const source =
      ':::actions\n::action[Continue]{href="/next"}\n:::\n\n:::details{summary="Help"}\nInformation.\n:::';

    const prepared = govbbPageCodec.prepare(source);

    if (prepared.mode !== "visual") throw new Error(prepared.diagnostics[0]?.message);
    const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

    try {
      editor.update(() => $setPageMetadata({ title: "Updated" }), { discrete: true });
      const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
      expect(encoded).toContain(':::action{href="/next"}\nContinue\n:::');
      expect(encoded).toContain(":::details[Help]");
      expect(encoded).not.toContain("::action[");
    } finally {
      editor.dispose();
    }
  });

  it.each([
    ["details", "summary", ":::details[Help]\nInformation\n:::"],
    ["table", "caption", ":::table[Fees]\n| Name | Cost |\n| --- | --- |\n| Copy | 50 |\n:::"],
    ["summary-item", "summaryKey", "::::summary-list\n:::summary-item[Key]\nValue\n:::\n::::"],
  ])("keeps a literal email in the %s label after editing", (kind, field, source) => {
    const prepared = govbbPageCodec.prepare(source);

    if (prepared.mode !== "visual") throw new Error("Expected visual source");
    const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

    try {
      editor.update(
        () => {
          const node = $nodesOfType(PageComponentNode).find((node) => node.getKind() === kind);

          if (!node) throw new Error("Expected page component");
          node.setAttributes({ ...node.getAttributes(), [field]: "help@example.gov.bb" });
        },
        { discrete: true },
      );
      const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
      expect(parseContentMarkdown(encoded).errors).toEqual([]);
      expect(govbbPageCodec.prepare(encoded).mode).toBe("visual");
    } finally {
      editor.dispose();
    }
  });

  it("renders the retained components with the design system", () => {
    const html = renderToStaticMarkup(
      <PagePreview source={components.join("\n\n")} definition={govbbPageEditor} />,
    );

    expect(html).not.toContain("Preview is unavailable");
    expect(html).toContain('<div class="govbb-button-group">');
    expect(html).toContain('<details class="govbb-show-hide">');
    expect(html).toContain('<dl class="govbb-summary-list">');
    expect(html).toContain(">Fees</caption>");
    expect(html).toContain('scope="row"');
  });

  it("keeps registered form references distinct from URL actions in editor state", () => {
    const prepared = govbbPageCodec.prepare(formAction);

    if (prepared.mode !== "visual") throw new Error(prepared.diagnostics[0]?.message);
    const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

    try {
      const actions = editor.getEditorState().read(
        () =>
          $nodesOfType(PageComponentNode).map((node) => ({
            kind: node.getKind(),
            attributes: node.getAttributes(),
          })),
        { editor },
      );

      expect(actions).toEqual([{ kind: "action", attributes: { form: "birth-certificate" } }]);
    } finally {
      editor.dispose();
    }
  });

  it.each([
    ':::action{href="javascript:run()"}\nRun\n:::',
    ":::summary-item[Fee]\n50\n:::",
    ":::accordion\n:::",
    ":::service-list\n:::",
    ":::details[Help]\nUnclosed",
    '<div class="unsupported">Retain this HTML.</div>',
  ])("keeps invalid or unsupported source intact: %s", (source) => {
    const prepared = govbbPageCodec.prepare(source);
    expect(prepared.mode).toBe("source");
    expect(prepared.source).toBe(source);
    expect(prepared.diagnostics[0]).toMatchObject({ severity: "warning", line: 1, column: 1 });
  });
});
