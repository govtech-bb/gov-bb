import { createEditor, formNodes } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalNode,
} from "lexical";
import { registerEditorHistory } from "../../src/editor/core/history";
import { $setDepth, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $blockZone,
  $canMovePage,
  $dropBlocks,
  $duplicateBlocks,
  $duplicateQuestion,
  $mergeWithPreviousPage,
  $moveBlocks,
  $pageQuestionCount,
  $removeBlocks,
} from "../../src/forms/editor/structure/blocks";
import {
  $createFormTitleNode,
  $createPageDescriptionNode,
  $createPageTitleNode,
  $createQuestionNode,
  $isInput,
  $isPageBreak,
  $pageHead,
  $settingsHolder,
  $updateSettings,
  $wholePage,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { MentionNode } from "../../src/forms/features/mentions/node";
import { deletePageLabel } from "../../src/forms/react/page-menu";

const newEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

const run = (editor: ReturnType<typeof newEditor>, fn: () => void) =>
  editor.update(fn, { discrete: true });

const text = (value: string) => $createTextNode(value);

const question = (label: string, answer: LexicalNode, depth = 0) => [
  $setDepth($createQuestionNode().append(text(label)), depth),
  $setDepth($setSettings(answer, { required: true }), depth),
];

/** Page 1 asks one question; page 2 two, under a heading and description; page 3 a choice with a follow-up. */
function $form() {
  const second = $createWidgetNode("page-break");
  const third = $createWidgetNode("page-break");
  $getRoot().append(
    $createFormTitleNode().append(text("Apply for a permit")),
    $createPageTitleNode().append(text("About you")),
    ...question("Name", $createInputNode("text")),
    second,
    $createPageTitleNode().append(text("Contact")),
    $createPageDescriptionNode().append(text("How we reach you")),
    ...question("Email", $createInputNode("email")),
    ...question("Phone", $createInputNode("phone")),
    third,
    $createPageTitleNode(),
    ...question("Colour", $createOptionNode("multiple-choice").append(text("Red"))),
    ...question("Which red?", $createInputNode("text"), 1),
    $createOptionNode("multiple-choice").append(text("Blue")),
  );

  return { second, third };
}

const outline = () =>
  $getRoot()
    .getChildren()
    .map((block) => ($isPageBreak(block) ? "---" : block.getTextContent()));

test("a page's actions take the whole page, folded or not", () => {
  for (const folded of [false, true]) {
    const editor = newEditor();
    run(editor, () => {
      const { second, third } = $form();
      $setSettings(second, { folded });
      expect($pageQuestionCount(second)).toBe(2);
      expect($pageQuestionCount(third)).toBe(2); // the follow-up is a question on the page too

      // Duplicate, from the page's menu or ⌘D in its heading, copies the page with its questions
      $duplicateQuestion(second);
      const copy = $wholePage(second).at(-1)!.getNextSibling()!;
      expect($isPageBreak(copy)).toBe(true);
      expect($wholePage(copy).map((block) => block.getTextContent())).toEqual([
        "",
        "Contact",
        "How we reach you",
        "Email",
        "",
        "Phone",
        "",
      ]);

      // A selected page copies whole too
      $duplicateBlocks([copy]);
      expect(outline().filter((block) => block === "---")).toHaveLength(4);

      // Delete takes the page and its questions, and nothing from the next page
      $removeBlocks([second]);
      expect(second.isAttached()).toBe(false);
      expect(outline()).toEqual([
        "Apply for a permit",
        "About you",
        "Name",
        "",
        "---",
        "Contact",
        "How we reach you",
        "Email",
        "",
        "Phone",
        "",
        "---",
        "Contact",
        "How we reach you",
        "Email",
        "",
        "Phone",
        "",
        "---",
        "",
        "Colour",
        "Red",
        "Which red?",
        "",
        "Blue",
      ]);
    });
  }
});

test("Move up and Move down swap whole pages, and page 1 stays first", () => {
  for (const folded of [false, true]) {
    const editor = newEditor();
    run(editor, () => {
      const { second, third } = $form();
      $setSettings(second, { folded });
      const before = outline();

      expect($canMovePage(second, false)).toBe(false); // page 1 starts with the form title
      expect($canMovePage(second, true)).toBe(true);
      expect($canMovePage(third, false)).toBe(true);
      expect($canMovePage(third, true)).toBe(false);

      $moveBlocks([third], false);
      expect(outline()).toEqual([
        "Apply for a permit",
        "About you",
        "Name",
        "",
        "---",
        "",
        "Colour",
        "Red",
        "Which red?",
        "",
        "Blue",
        "---",
        "Contact",
        "How we reach you",
        "Email",
        "",
        "Phone",
        "",
      ]);
      expect($settings(second).folded ?? false).toBe(folded);

      $moveBlocks([third], true);
      expect(outline()).toEqual(before);

      // A dragged page lands whole at the next page boundary, unfolded too
      const name = $getRoot().getChildren()[3]!;
      $dropBlocks(third, $blockZone(name));
      expect(outline().indexOf("Colour")).toBeLessThan(outline().indexOf("Email"));
      expect($pageHead(third)).toHaveLength(1);
    });
  }
});

test("Merge with previous page keeps its questions and the words of its heading", () => {
  const editor = newEditor();
  run(editor, () => {
    const { second, third } = $form();
    $mergeWithPreviousPage(second);
    expect(second.isAttached()).toBe(false);

    const blocks = $getRoot().getChildren();
    const heading = blocks[4]!;
    expect($isHeadingNode(heading) && heading.getTag()).toBe("h2");
    expect(heading.getTextContent()).toBe("Contact");
    expect($isParagraphNode(blocks[5]) && blocks[5].getTextContent()).toBe("How we reach you");
    expect(outline().slice(0, 10)).toEqual([
      "Apply for a permit",
      "About you",
      "Name",
      "",
      "Contact",
      "How we reach you",
      "Email",
      "",
      "Phone",
      "",
    ]);

    // An empty heading leaves nothing behind
    $mergeWithPreviousPage(third);
    expect(outline().slice(10)).toEqual(["Colour", "Red", "Which red?", "", "Blue"]);
  });
});

test("a page's settings stay its own: question settings never reach its questions", () => {
  for (const folded of [false, true]) {
    const editor = newEditor();
    run(editor, () => {
      const { second } = $form();
      $setSettings(second, { folded });
      expect($settingsHolder(second).is(second)).toBe(true);

      $updateSettings(second, { required: false });
      const answers = $wholePage(second).filter($isInput);
      expect(answers.map((block) => $settings(block).required)).toEqual([true, true]);
    });
  }
});

test("each page action is one undo step", async () => {
  const editor = newEditor();
  const pages = { second: "", third: "" };
  run(editor, () => {
    const { second, third } = $form();
    pages.second = second.getKey();
    pages.third = third.getKey();
  });
  const unregister = registerEditorHistory(editor);
  const json = () => JSON.stringify(editor.getEditorState());

  const page = (key: string) =>
    $getRoot()
      .getChildren()
      .find((block) => block.getKey() === key)!;

  const command = async (type: typeof UNDO_COMMAND) => {
    editor.dispatchCommand(type, undefined);
    await Promise.resolve();
  };

  try {
    const states = [json()];

    for (const action of [
      // Typing, then at once a move: the move still stands alone
      () => $pageHead(page(pages.second))[0]!.append(text(" details")),
      () => $moveBlocks([page(pages.third)], false),
      () => $duplicateQuestion(page(pages.second)),
      () => $mergeWithPreviousPage(page(pages.third)),
      () => $removeBlocks([page(pages.second)]),
    ]) {
      run(editor, action);
      states.push(json());
    }

    expect(new Set(states).size).toBe(6);

    for (const state of states.slice(0, -1).reverse()) {
      await command(UNDO_COMMAND);
      expect(json()).toBe(state);
    }

    await command(REDO_COMMAND);
    expect(json()).toBe(states[1]);
  } finally {
    unregister();
  }
});

test("the delete names the questions that go with the page", () => {
  expect(deletePageLabel(0)).toBe("Delete page");
  expect(deletePageLabel(1)).toBe("Delete page and 1 question");
  expect(deletePageLabel(4)).toBe("Delete page and 4 questions");
});
