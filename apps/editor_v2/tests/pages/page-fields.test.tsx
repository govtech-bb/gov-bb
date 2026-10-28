/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import { $getSelection, $isRangeSelection, SKIP_DOM_SELECTION_TAG } from "lexical";
import { PageSettings, PageTitleField } from "../../src/pages";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

const field = (label: string) =>
  document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!;

const type = (input: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

test("typing in the title leaves the page's selection where it is, and Cmd+Z there is the editor's undo", async () => {
  const editor = await renderPageEditor(
    "---\ntitle: Old title\n---\n\nBody text\n",
    <PageTitleField />,
  );

  // As after a click in the page: its selection is put back by any update that doesn't skip it
  await selectPageText("Body text");

  const tags: string[][] = [];

  editor.registerUpdateListener(({ tags: updateTags, dirtyElements, dirtyLeaves }) => {
    if (dirtyElements.size || dirtyLeaves.size) tags.push([...updateTags]);
  });

  const title = field("Page title");

  await act(async () => title.focus());
  await type(title, "Old title, edited");
  await type(title, "Old title, edited again");
  expect(title.value).toBe("Old title, edited again");
  expect(tags).toHaveLength(2);
  expect(tags.every((update) => update.includes(SKIP_DOM_SELECTION_TAG))).toBe(true);

  // Typed together, the two changes are one step, undone by the editor rather than the browser's own field undo
  await act(async () => {
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
  });
  expect(title.value).toBe("Old title");
});

const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });

test("the title, introduction and body are one piece of writing: Enter and ArrowDown go on, ArrowUp goes back", async () => {
  // jsdom lays nothing out: the caret's box is its line's
  Range.prototype.getClientRects = () => document.body.getClientRects();

  const editor = await renderPageEditor(
    "---\ntitle: Licences\nlede: What you need\n---\n\nFirst line\n\nSecond line\n",
    <PageTitleField />,
  );

  const title = field("Page title");
  const introduction = field("Introduction");

  await act(async () => title.focus());
  await press(title, "Enter");
  expect(document.activeElement).toBe(introduction);
  expect(introduction.selectionStart).toBe(introduction.value.length);

  // ArrowDown at the end of the introduction starts the body
  await press(introduction, "ArrowDown");
  expect(
    editor.getEditorState().read(() => {
      const selection = $getSelection();

      return $isRangeSelection(selection) && selection.isCollapsed()
        ? [selection.anchor.getNode().getTextContent(), selection.anchor.offset]
        : null;
    }),
  ).toEqual(["First line", 0]);

  // ArrowUp on the body's first line goes back to the introduction, and from its start to the title
  await press(pageControl(".page-editable"), "ArrowUp");
  expect(document.activeElement).toBe(introduction);
  introduction.setSelectionRange(0, 0);
  await press(introduction, "ArrowUp");
  expect(document.activeElement).toBe(title);

  // Shift+Enter in the introduction is still a new line there
  await act(async () => introduction.focus());
  await press(introduction, "Enter", { shiftKey: true });
  expect(document.activeElement).toBe(introduction);
});

test.each(["", "public", "preview"])(
  "page visibility %j offers only Public and Preview without rewriting its source",
  async (value) => {
    const source = `---\ntitle: Original\n${value ? `visibility: ${value}\n` : ""}---\n\nBody\n`;

    const editor = await renderPageEditor(
      source,
      <>
        <PageTitleField />
        <PageSettings />
      </>,
    );

    const visibility = pageControl<HTMLSelectElement>("select");

    expect([...visibility.options].map((option) => [option.value, option.textContent])).toEqual([
      ["", "Public"],
      ["preview", "Preview link only"],
    ]);
    expect(visibility.value).toBe(value === "public" ? "" : value);
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
    await type(field("Page title"), "Changed");
    const changed = govbbPageCodec.encode(editor.getEditorState().toJSON());

    if (value) expect(changed).toContain(`visibility: ${value}`);
    else expect(changed).not.toMatch(/^visibility:/m);
  },
);

test.each(["", "preview"])(
  "a legacy draft stays hidden until visibility is changed to %j, and undo restores it",
  async (value) => {
    const source = "---\ntitle: Hidden page\nvisibility: draft\n---\n\nBody\n";

    const editor = await renderPageEditor(
      source,
      <>
        <PageTitleField />
        <PageSettings />
      </>,
    );

    const visibility = pageControl<HTMLSelectElement>("select");
    const markdown = () => govbbPageCodec.encode(editor.getEditorState().toJSON());

    expect(visibility.value).toBe("draft");
    expect(visibility.selectedOptions[0]?.textContent).toBe("Draft (hidden)");
    expect(visibility.selectedOptions[0]?.disabled).toBe(true);
    expect(
      [...visibility.options].flatMap((option) => (option.disabled ? [] : [option.value])),
    ).toEqual(["", "preview"]);
    expect(document.getElementById(visibility.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Draft pages are hidden, even from preview links. Visibility changes take effect only when you save.",
    );
    expect(markdown()).toBe(source);
    await type(field("Page title"), "Changed hidden page");
    const hidden = markdown();
    expect(hidden).toContain("visibility: draft");

    await act(async () => {
      visibility.value = value;
      visibility.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const changed = markdown();

    expect(visibility.value).toBe(value);
    expect([...visibility.options].map((option) => option.value)).toEqual(["", "preview"]);
    expect(visibility.hasAttribute("aria-describedby")).toBe(false);

    if (value) expect(changed).toContain("visibility: preview");
    else expect(changed).not.toMatch(/^visibility:/m);

    await press(visibility, "z", { metaKey: true });
    expect(markdown()).toBe(hidden);
    expect(visibility.value).toBe("draft");
    expect(visibility.selectedOptions[0]?.disabled).toBe(true);
    await press(visibility, "z", { metaKey: true, shiftKey: true });
    expect(markdown()).toBe(changed);
    expect(visibility.value).toBe(value);
  },
);

test.each(["", "preview"])(
  "a saved draft can return from %j without undoing later edits",
  async (value) => {
    const editor = await renderPageEditor(
      "---\ntitle: Hidden page\nvisibility: draft\n---\n\nBody\n",
      <>
        <PageTitleField />
        <PageSettings savedVisibility="draft" />
      </>,
    );

    const visibility = pageControl<HTMLSelectElement>("select");
    const markdown = () => govbbPageCodec.encode(editor.getEditorState().toJSON());

    const choose = (next: string) =>
      act(async () => {
        visibility.value = next;
        visibility.dispatchEvent(new Event("change", { bubbles: true }));
      });

    await choose(value);
    expect(visibility.querySelector<HTMLOptionElement>('option[value="draft"]')?.disabled).toBe(
      false,
    );
    await type(field("Page title"), "Later title edit");
    const beforeReturn = markdown();

    await choose("draft");
    const returned = markdown();
    expect(returned).toContain("visibility: draft");
    expect(field("Page title").value).toBe("Later title edit");
    expect(visibility.selectedOptions[0]?.disabled).toBe(true);

    await press(visibility, "z", { ctrlKey: true });
    expect(markdown()).toBe(beforeReturn);
    expect(field("Page title").value).toBe("Later title edit");
    await press(visibility, "y", { ctrlKey: true });
    expect(markdown()).toBe(returned);
  },
);

test.each(["secret", "{ custom: true }"])(
  "unfamiliar visibility %s is preserved when another field changes",
  async (value) => {
    const source = `---\ntitle: Original\nvisibility: ${value}\n---\n\nBody\n`;

    const editor = await renderPageEditor(
      source,
      <>
        <PageTitleField />
        <PageSettings />
      </>,
    );

    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);

    if (value === "secret") expect(pageControl<HTMLSelectElement>("select").value).toBe(value);
    else expect(document.querySelector("select")).toBeNull();
    await type(field("Page title"), "Changed");
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toContain(
      `visibility: ${value}`,
    );
  },
);
