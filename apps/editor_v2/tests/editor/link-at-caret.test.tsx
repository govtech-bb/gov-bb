/** @vitest-environment jsdom */
import { beforeEach, expect, test } from "vitest";
import { act } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, type LexicalEditor } from "lexical";
import { EditorComposer } from "../../src/editor/react/composer";
import { PageEditor } from "../../src/pages/editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { pageControl, renderInPage, renderPageEditor } from "../helpers/page-editor";

// jsdom lays nothing out, where the editor keeps the caret in view
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 600, 40);
});

const page = (editor: LexicalEditor) => govbbPageCodec.encode(editor.getEditorState().toJSON());

const popover = () => document.querySelector<HTMLElement>('[role="dialog"]');

const button = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

/** Puts the caret in some text, with the focus in the page, as a click does. */
async function caretIn(editor: LexicalEditor, text: string, offset = 1) {
  await act(async () => {
    pageControl<HTMLElement>(".page-editable").focus();
    editor.update(
      () =>
        $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === text)!
          .select(offset, offset),
      { discrete: true },
    );
  });
}

async function apply(value: string) {
  const field = document.querySelector<HTMLInputElement>('input[aria-label="Link"]')!;

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    field.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

const pressLink = () =>
  act(async () => {
    pageControl(".page-editable").dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
    );
  });

test("with the caret in a link, it shows where the link goes, and Edit and Remove change it", async () => {
  const editor = await renderPageEditor("Check the [fees](/fees) first\n");
  expect(popover()).toBeNull();

  await caretIn(editor, "fees");
  expect(popover()?.getAttribute("aria-label")).toBe("Link");
  expect(popover()?.textContent).toContain("/fees");

  await act(async () => button("Edit link")!.click());
  await apply("www.gov.bb/fees");
  expect(page(editor)).toBe("Check the [fees](https://www.gov.bb/fees) first\n");

  await caretIn(editor, "fees");
  await act(async () => button("Remove link")!.click());
  expect(page(editor)).toBe("Check the fees first\n");
});

test("⌘K away from a link makes one at the caret with its address as its words", async () => {
  const editor = await renderPageEditor("See  for more\n");
  await caretIn(editor, "See  for more", 4);
  await pressLink();
  await apply("/fees");
  expect(page(editor)).toBe("See [/fees](/fees) for more\n");
});

test("a Start button shows its destination, ⌘K changes it, and it can go back to the linked form", async () => {
  const editor = await renderPageEditor('<a data-start-link href="/apply">Start now</a>\n');
  await caretIn(editor, "Start now");
  expect(popover()?.getAttribute("aria-label")).toBe("Button destination");
  expect(popover()?.textContent).toContain("/apply");

  await pressLink();
  await apply("/apply-online");
  expect(page(editor)).toBe('<a data-start-link href="/apply-online">Start now</a>\n');

  await caretIn(editor, "Start now");
  await act(async () => button("Use linked form")!.click());
  expect(page(editor)).toBe("<a data-start-link>Start now</a>\n");
  await caretIn(editor, "Start now");
  expect(popover()?.textContent).toContain("Linked form");
});

test("the host's pages are found by title, and one picked links with its title", async () => {
  const prepared = govbbPageCodec.prepare("Read this\n");

  if (prepared.mode !== "visual") throw new Error("Expected an editable page");
  let editor: LexicalEditor | undefined;

  function Capture() {
    [editor] = useLexicalComposerContext();

    return null;
  }

  await renderInPage(
    <EditorComposer
      definition={govbbPageEditor}
      initialState={prepared.state}
      linkPages={[{ title: "Passport fees", url: "/travel/passport-fees" }]}
    >
      <Capture />
      <PageEditor />
    </EditorComposer>,
  );
  await caretIn(editor!, "Read this", 9);
  await pressLink();

  const field = document.querySelector<HTMLInputElement>('input[aria-label="Link"]')!;
  expect(field.getAttribute("role")).toBe("combobox");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "fees");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector<HTMLElement>('[role="option"]')!.click());
  expect(page(editor!)).toBe("Read this[Passport fees](/travel/passport-fees)\n");
});
