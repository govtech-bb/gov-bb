/** @vitest-environment jsdom */
import { beforeEach, expect, test } from "vitest";
import { act } from "react";
import { $getRoot, $isTextNode, INSERT_PARAGRAPH_COMMAND, type LexicalEditor } from "lexical";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { $pageInsertionTarget } from "../../src/pages/insertion";
import { PageMutedNode } from "../../src/pages/modules/muted";
import {
  pageControl,
  renderPageEditor,
  selectPageText,
  selectPageWords,
} from "../helpers/page-editor";

// jsdom lays nothing out, where the selection toolbar anchors to the selected words
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 600, 40);
});

const body = (editor: LexicalEditor) => govbbPageCodec.encode(editor.getEditorState().toJSON());

const colourMenu = () =>
  document.querySelector<HTMLButtonElement>('[role="toolbar"] [aria-label="Text colour"]');

const colour = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (item) => item.textContent === label,
  )!;

/** Selects a block's words from the keyboard, which shows the selection toolbar. */
async function selectWords(words: string) {
  await selectPageWords(words);
  await act(async () =>
    pageControl(".page-editable").dispatchEvent(
      new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }),
    ),
  );
}

/** The page's blocks, muted text by whether it's a caption. */
const blocks = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .slice(1)
      .map((node) =>
        node instanceof PageMutedNode
          ? `muted${node.isCaption() ? " caption" : ""}: ${node.getTextContent()}`
          : `${node.getType()}: ${node.getTextContent()}`,
      ),
  );

test("muting is a colour in the selection toolbar, which takes it off again", async () => {
  const editor = await renderPageEditor(
    "Fees for a licence\n\n<muted caption>Small print</muted>\n",
  );

  await selectWords("Fees for a licence");
  await act(async () => colourMenu()!.click());
  expect(colour("Default").getAttribute("aria-checked")).toBe("true");
  await act(async () => colour("Muted").click());
  expect(body(editor)).toBe(
    "<muted>Fees for a licence</muted>\n\n<muted caption>Small print</muted>\n",
  );

  await selectWords("Small print");
  await act(async () => colourMenu()!.click());
  expect(colour("Muted").getAttribute("aria-checked")).toBe("true");
  await act(async () => colour("Default").click());
  expect(body(editor)).toBe("<muted>Fees for a licence</muted>\n\nSmall print\n");
});

test("only a page's own paragraphs take a colour, as only they are muted on landing", async () => {
  await renderPageEditor("## Fees\n\n:::notice\nApply by Friday\n:::\n");

  for (const words of ["Fees", "Apply by Friday"]) {
    await selectWords(words);
    expect(document.querySelector('[role="toolbar"][aria-label="Text formatting"]')).not.toBeNull();
    expect(colourMenu()).toBeNull();
  }
});

test("muted text in a list item or Notice can be taken off, but not put back", async () => {
  const editor = await renderPageEditor(
    "- <muted>Small print</muted>\n- Plain\n\n:::notice\n<muted>Apply by Friday</muted>\n:::\n",
  );

  for (const words of ["Small print", "Apply by Friday"]) {
    await selectWords(words);
    await act(async () => colourMenu()!.click());
    expect(colour("Muted").getAttribute("aria-checked")).toBe("true");
    await act(async () => colour("Default").click());
    await selectWords(words);
    expect(colourMenu()).toBeNull();
  }

  expect(body(editor)).toBe("- Small print\n- Plain\n\n:::notice\nApply by Friday\n:::\n");
});

test("nothing inserts muted text: neither the insert menu nor “/” offers it", () => {
  expect(
    govbbPageEditor.actions.filter((action) =>
      [action.title, ...(action.aliases ?? [])].some((name) => /mute/i.test(name)),
    ),
  ).toEqual([]);
});

test("Enter within muted text keeps both halves muted; at its end, writing goes on in ordinary text", async () => {
  const editor = await renderPageEditor("<muted caption>Small print</muted>\n");

  const enter = () =>
    act(async () => {
      editor.update(() => editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined), {
        discrete: true,
      });
    });

  await act(async () => {
    editor.update(
      () => {
        const text = $getRoot().getAllTextNodes()[0];

        if ($isTextNode(text)) text.select(5, 5);
      },
      { discrete: true },
    );
  });
  await enter();
  expect(blocks(editor)).toEqual(["muted caption: Small", "muted caption:  print"]);

  await selectPageText(" print");
  await enter();
  expect(blocks(editor)).toEqual(["muted caption: Small", "muted caption:  print", "paragraph: "]);
});

test("“/” opens on muted text's line, as on any paragraph's", async () => {
  const editor = await renderPageEditor("<muted>Keep trying.</muted>\n");
  await selectPageText("Keep trying.");
  expect(editor.getEditorState().read(() => $pageInsertionTarget()?.getType())).toBe("page-muted");
});
