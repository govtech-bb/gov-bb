import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { $getRoot, HISTORY_PUSH_TAG, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { $setPageMetadata } from "../../src/pages/metadata";
import { PagePreview } from "../../src/pages/preview";

function visual(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode === "source") throw new Error(prepared.diagnostics[0]?.message);

  return prepared.state;
}

test.each([
  { body: "**Outer __inner__ outer**", format: "bold" as const },
  { body: "*Outer _inner_ outer*", format: "italic" as const },
])("nested $format remains inherited after an unrelated edit", ({ body, format }) => {
  const source = `---\ntitle: Original\n---\n\n${body}\n`;
  const editor = createHeadlessEditor(govbbPageEditor, visual(source));

  try {
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
    editor.update(
      () => {
        expect(
          $getRoot()
            .getAllTextNodes()
            .every((node) => node.hasFormat(format)),
        ).toBe(true);
        expect(
          $getRoot()
            .getAllTextNodes()
            .map((node) => node.getTextContent())
            .join(""),
        ).toBe("Outer inner outer");
        $setPageMetadata({ title: "Edited" });
      },
      { discrete: true },
    );
    const saved = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(visual(saved).root.children.slice(1)).toEqual(
      editor.getEditorState().toJSON().root.children.slice(1),
    );
  } finally {
    editor.dispose();
  }
});

test("Start label formatting saves, reloads and undoes without changing literal text or its destination", async () => {
  const source =
    '<a data-start-link href="/apply?first=1&amp;second=2">A &amp;quot; &#42;literal&#42; &lt;x&gt;</a>\n';

  const editor = createHeadlessEditor(govbbPageEditor, visual(source));

  try {
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
    editor.update(
      () => {
        expect(
          $getRoot()
            .getAllTextNodes()
            .map((node) => node.getTextContent())
            .join(""),
        ).toBe("A &quot; *literal* <x>");

        for (const node of $getRoot().getAllTextNodes())
          node.toggleFormat("bold").toggleFormat("italic");
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    const saved = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(saved).toContain("<strong>");
    expect(saved).toContain("<em>");
    expect(saved).toContain("&amp;quot;");
    expect(saved).toContain("&#42;literal&#42;");
    expect(visual(saved).root.children.slice(1)).toEqual(
      editor.getEditorState().toJSON().root.children.slice(1),
    );

    const preview = renderToStaticMarkup(
      <PagePreview source={saved} definition={govbbPageEditor} />,
    );

    expect(preview).toContain('href="/apply?first=1&amp;second=2"');
    expect(preview).toContain("<strong>A &amp;quot; *literal* &lt;x&gt;</strong>");
    expect(preview).toContain("<em>");
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(saved);
  } finally {
    editor.dispose();
  }
});

test.each([
  "<a data-start-link><strong>Start <em>now</em></strong><br><del>old</del> <code>&lt;x&gt; &#42;literal&#42;</code></a>\n",
  "<a data-start-link>\n<strong>Start <em>now</em></strong><br><del>old</del> <code>&lt;x&gt; &#42;literal&#42;</code>\n</a>\n",
  "<a data-start-link>**Start** _now_ ~~old~~ `code`</a>\n",
])("supported inline Start labels survive unrelated edits: %s", (source) => {
  const initial = visual(source);
  expect(govbbPageCodec.encode(initial)).toBe(source);
  const editor = createHeadlessEditor(govbbPageEditor, initial);

  try {
    editor.update(() => $setPageMetadata({ title: "Edited" }), { discrete: true });
    const saved = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(visual(saved).root.children.slice(1)).toEqual(initial.root.children.slice(1));
    expect(saved).toContain("<strong>");
    expect(saved).toContain("<em>");
    expect(saved).toContain("<del>");
    expect(saved).toContain("<code>");
  } finally {
    editor.dispose();
  }
});

test.each([
  '<a data-start-link><strong onclick="alert(1)">Start</strong></a>',
  '<a data-start-link><a href="/elsewhere">Start</a></a>',
  "<a data-start-link><strong>Start</em></a>",
  "<a data-start-link><span>Start</span></a>",
  '<a data-start-link><img src=x onerror="alert(1)"></a>',
  "<a data-start-link><script>alert(1)</script></a>",
  "<a data-start-link><code><strong>Start</strong></code></a>",
])("unsupported Start markup stays exact source-only content: %s", (source) => {
  const prepared = govbbPageCodec.prepare(source);
  expect(prepared.mode).toBe("source");
  expect(prepared.source).toBe(source);
  expect(prepared.state).toBeUndefined();

  const preview = renderToStaticMarkup(
    <PagePreview source={source} definition={govbbPageEditor} />,
  );

  expect(preview).toContain("Preview is unavailable");
  expect(preview).not.toContain("<script");
  expect(preview).not.toContain("<img");
});

test.each([
  "> Before\n>\n> ---\n>\n> After",
  "> | Heading |\n> | --- |\n> | Value |",
  "> :::notice\n> Keep this notice\n> :::",
  "> > Before\n> >\n> > ---\n> >\n> > After",
])("unsupported quotation compositions use exact source-only fallback: %s", (body) => {
  const source = `---\ntitle: Quoted content\n---\n\n${body}\n`;
  const prepared = govbbPageCodec.prepare(source);
  expect(prepared.mode).toBe("source");
  expect(prepared.source).toBe(source);
  expect(prepared.state).toBeUndefined();
  expect(prepared.diagnostics[0]?.severity).toBe("warning");
  expect(prepared.diagnostics[0]?.message).toContain("quotation");
});
