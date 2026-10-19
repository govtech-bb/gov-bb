/** @vitest-environment jsdom */
import { beforeEach, expect, test } from "vitest";
import { act } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  PASTE_TAG,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";
import { EditorComposer } from "../../src/editor/react/composer";
import { Editor } from "../../src/editor/react/editor";
import { FormEditor } from "../../src/forms/react/form-editor";
import { contentEditor } from "../../src/presets/content";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { renderInPage, renderPageEditor } from "../helpers/page-editor";

// jsdom lays nothing out, where the editor keeps the caret in view
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 600, 40);
});

const page = (editor: LexicalEditor) => govbbPageCodec.encode(editor.getEditorState().toJSON());

/** Types a character at a time, as a keyboard does. */
async function type(editor: LexicalEditor, text: string) {
  for (const character of text)
    await act(async () => {
      editor.update(() => $getSelection()!.insertText(character), { discrete: true });
    });
}

/** A new empty line at the end, with the caret on it. */
async function newLine(editor: LexicalEditor) {
  await act(async () => {
    editor.update(
      () => {
        const line = $createParagraphNode();
        $getRoot().append(line);
        line.select();
      },
      { discrete: true },
    );
  });
}

async function caretAtStart(editor: LexicalEditor, index = 0) {
  await act(async () => {
    editor.update(
      () => {
        const line = $getRoot()
          .getChildren()
          .filter((node) => $isElementNode(node) && node.getType() !== "page-metadata")[index];

        if (!$isElementNode(line)) throw new Error("Expected a line");
        line.selectStart();
      },
      { discrete: true },
    );
  });
}

test.each([
  ["## ", "## Who can apply\n"],
  ["### ", "### Who can apply\n"],
  ["#### ", "#### Who can apply\n"],
  ["- ", "- Who can apply\n"],
  ["* ", "- Who can apply\n"],
  ["1. ", "1. Who can apply\n"],
  ["3. ", "1. Who can apply\n"],
  ["> ", "> Who can apply\n"],
])(
  "“%s” typed at the start of a page's line turns it, keeping its text",
  async (marker, expected) => {
    const editor = await renderPageEditor("Who can apply\n");
    await caretAtStart(editor);
    await type(editor, marker);
    expect(page(editor)).toBe(expected);
  },
);

test("on an empty line a list's Markdown starts one", async () => {
  const editor = await renderPageEditor("Intro\n");
  await newLine(editor);
  await type(editor, "- First");
  expect(page(editor)).toBe("Intro\n\n- First\n");
});

test("a separator's Markdown needs no space, as no text follows it", async () => {
  const editor = await renderPageEditor("Intro\n");
  await newLine(editor);
  await type(editor, "---");
  expect(page(editor)).toBe("Intro\n\n***\n");
});

test("Undo straight after a conversion gives back the Markdown", async () => {
  const editor = await renderPageEditor("Fees\n");
  await caretAtStart(editor);
  await type(editor, "## ");
  expect(page(editor)).toBe("## Fees\n");
  await act(async () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  });
  expect(editor.getEditorState().read(() => $getRoot().getLastChild()?.getTextContent())).toBe(
    "## Fees",
  );
});

test("Markdown inserted all at once, as a paste is, stays as it is", async () => {
  const editor = await renderPageEditor("Fees\n");
  await caretAtStart(editor);
  await act(async () => {
    editor.update(() => $getSelection()!.insertText("## "), { discrete: true });
  });
  expect(editor.getEditorState().read(() => $getRoot().getLastChild()?.getTextContent())).toBe(
    "## Fees",
  );
});

test("[text](address) becomes a link as it's typed, where the link policy allows its address", async () => {
  const editor = await renderPageEditor("Fees\n");
  await act(async () => {
    editor.update(() => $getRoot().getLastChild()!.selectEnd(), { discrete: true });
  });
  await type(editor, " [fees](/fees) apply [bad](javascript:void)");
  expect(page(editor)).toMatch(/^Fees \[fees\]\(\/fees\) apply \\\[bad/);
  expect(editor.getEditorState().read(() => $getRoot().getLastChild()?.getTextContent())).toBe(
    "Fees fees apply [bad](javascript:void)",
  );
});

test("pasted [text](address) becomes a link, and one undo takes the paste away", async () => {
  const editor = await renderPageEditor("Read\n");
  await act(async () => {
    editor.update(() => $getRoot().getLastChild()!.selectEnd(), { discrete: true });
  });
  await act(async () => {
    editor.update(
      () => $getSelection()!.insertText(" [the guide](www.gov.bb/guide) and [fees](/fees) first"),
      { tag: PASTE_TAG, discrete: true },
    );
  });
  expect(page(editor)).toBe("Read [the guide](https://www.gov.bb/guide) and [fees](/fees) first\n");
  await act(async () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  });
  expect(page(editor)).toBe("Read\n");
});

test("a form's line turns through the same Markdown", async () => {
  const { state } = govbbFormCodec.prepare(
    "---\nformat: govbb-form\nformatVersion: 2\ntitle: Shortcuts\n---\n\n# Your details\n\n::page{#details}\n\nBring evidence\n",
  );

  let form: LexicalEditor | undefined;

  function CaptureForm() {
    [form] = useLexicalComposerContext();

    return null;
  }

  await renderInPage(
    <EditorComposer definition={govbbFormEditor} initialState={state}>
      <CaptureForm />
      <FormEditor />
    </EditorComposer>,
  );
  await act(async () => {
    form!.update(
      () =>
        $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "Bring evidence")!
          .select(0, 0),
      { discrete: true },
    );
  });
  await type(form!, "## ");
  expect(
    form!.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .find((node) => node.getTextContent() === "Bring evidence")
        ?.getType(),
    ),
  ).toBe("heading");
});

test("in an editor without Turn into, a block's Markdown on an empty line starts the block", async () => {
  let content: LexicalEditor | undefined;

  function CaptureContent() {
    [content] = useLexicalComposerContext();

    return null;
  }

  await renderInPage(
    <Editor definition={contentEditor} label="Content">
      <CaptureContent />
    </Editor>,
  );
  await act(async () => {
    content!.update(() => $getRoot().selectStart(), { discrete: true });
  });
  await type(content!, "- ");
  expect(content!.getEditorState().read(() => $getRoot().getFirstChild()?.getType())).toBe(
    "bullet",
  );
});
