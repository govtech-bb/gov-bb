import { expect, test } from "vitest";
import { $getRoot, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $turnLineInto } from "../../src/editor/core/turn-into";
import { turnIntoOptions } from "../../src/editor/react/turn-into";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

function page(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode !== "visual") throw new Error("Expected an editable page");

  return createHeadlessEditor(govbbPageEditor, prepared.state);
}

const body = (editor: LexicalEditor) => govbbPageCodec.encode(editor.getEditorState().toJSON());

/** Selects from the start of one piece of text to the end of another, and turns their lines into a type. */
function turn(editor: LexicalEditor, from: string, to: string, type: string) {
  editor.update(
    () => {
      const texts = $getRoot().getAllTextNodes();
      const start = texts.find((node) => node.getTextContent() === from)!;
      const end = texts.find((node) => node.getTextContent() === to)!;
      const selection = start.select(0, 0);
      selection.focus.set(end.getKey(), end.getTextContentSize(), "text");
      govbbPageEditor.turnInto!.$turnInto(type);
    },
    { discrete: true },
  );

  return body(editor);
}

function choices(editor: LexicalEditor, text: string) {
  const offers: ReturnType<NonNullable<typeof govbbPageEditor.turnInto>["$choices"]>[] = [];

  editor.update(
    () => {
      $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === text)!
        .select(0, 0);
      offers.push(govbbPageEditor.turnInto!.$choices());
    },
    { discrete: true },
  );

  return offers[0] ?? null;
}

test("a line of text turns into a heading, keeping its text", () => {
  expect(turn(page("Who can apply\n"), "Who can apply", "Who can apply", "page-h2")).toBe(
    "## Who can apply\n",
  );
});

test("a list's item turns into text out of the list, which splits around it, and the steps after keep their numbers", () => {
  expect(turn(page("1. One\n2. Two\n3. Three\n"), "Two", "Two", "page-paragraph")).toBe(
    "1. One\n\nTwo\n\n2. Three\n",
  );
});

test("lines turned into a list together make one list, joined to one of its type beside them", () => {
  expect(turn(page("- First\n\nSecond\n\nThird\n"), "Second", "Third", "page-bullet-list")).toBe(
    "- First\n- Second\n- Third\n",
  );
});

test("a line in a list turns the whole list into the other type", () => {
  expect(turn(page("- One\n- Two\n"), "Two", "Two", "page-number-list")).toBe("1. One\n2. Two\n");
});

test("lines turned into a quote together share one, and a quote's line turns back into text outside it", () => {
  expect(turn(page("One\n\nTwo\n"), "One", "Two", "page-quote")).toBe("> One\n>\n> Two\n");
  expect(turn(page("> Quoted\n"), "Quoted", "Quoted", "page-paragraph")).toBe("Quoted\n");
});

test("a line in a Notice turns where it is, inside the Notice", () => {
  expect(
    turn(
      page(":::notice\nApply by Friday\n:::\n"),
      "Apply by Friday",
      "Apply by Friday",
      "page-h3",
    ),
  ).toBe(":::notice\n### Apply by Friday\n:::\n");
});

test("the menus list the page's text blocks, with Heading 4 and older headings only where a line is one", () => {
  const editor = page("Text\n\n#### Four\n\n# One\n");

  const listed = (text: string) =>
    turnIntoOptions(choices(editor, text)!).map(({ label }) => label);

  expect(choices(editor, "Text")?.value).toBe("page-paragraph");
  expect(listed("Text")).toEqual([
    "Text",
    "Heading 2",
    "Heading 3",
    "Quote",
    "Bulleted list",
    "Numbered list",
  ]);
  expect(listed("Four")).toContain("Heading 4");
  expect(choices(editor, "One")?.value).toBe("page-h1");
  expect(listed("One")).toContain("Heading 1");
  // A line still turns into Heading 4 from the "/" menu, Markdown or its shortcut
  expect(turn(page("Fees\n"), "Fees", "Fees", "page-h4")).toBe("#### Fees\n");
});

test("text in a table cell or a button doesn't turn", () => {
  const editor = page(
    '| Fee |\n| --- |\n| $5 |\n\n<a data-start-link href="/apply">Start now</a>\n',
  );

  expect(choices(editor, "$5")).toBeNull();
  expect(choices(editor, "Start now")).toBeNull();
});

test("a text choice from the “/” menu turns a line that has text, and leaves an empty one to the insert", () => {
  const editor = page("Fees /h2\n");

  editor.update(
    () => {
      const typed = $getRoot().getAllTextNodes()[0]!.splitText(5)[1]!;
      typed.select();

      expect(
        $turnLineInto(govbbPageEditor, "page-h2", typed.getParent()!, "/h2", () => typed.remove()),
      ).toBe(true);
    },
    { discrete: true },
  );
  expect(body(editor)).toBe("## Fees\n");

  const empty = page("/h2\n");

  empty.update(
    () => {
      const typed = $getRoot().getAllTextNodes()[0]!;
      typed.select();

      expect(
        $turnLineInto(govbbPageEditor, "page-h2", typed.getParent()!, "/h2", () => typed.remove()),
      ).toBe(false);
    },
    { discrete: true },
  );
  expect(body(empty)).toBe("/h2\n");
});
