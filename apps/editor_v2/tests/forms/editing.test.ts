import { settingsObject, settingsArray } from "../helpers/serialized-test-data";
import { createEditor } from "../helpers/default-form";
import { $createLinkNode, LinkNode } from "@lexical/link";
import { $createHeadingNode, $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import { expect, test, vi } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalNode,
} from "lexical";
import {
  $blockZone,
  $dropBlocks,
  $dropCheck,
  $duplicateQuestion,
  $removeBlocks,
} from "../../src/forms/editor/structure/blocks";
import { $enter } from "../../src/forms/editor/structure/editing";
import { pushStep, registerEditorHistory, type Step } from "../../src/editor/core/history";
import { touchFirst } from "../../src/forms/editor/structure/rubber-band";
import { $toMarkdown } from "../helpers/default-form";
import { $createMentionNode, MentionNode } from "../../src/forms/features/mentions/node";
import {
  $mentionTargets,
  $remapCopies,
  $updateMentions,
} from "../../src/forms/features/mentions/editor";
import { $blockId, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $createFormTitleNode,
  $createQuestionNode,
  $deepCopy,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { formNodes } from "../helpers/default-form";

const newEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (e) => {
      throw e;
    },
  });

const run = (editor: ReturnType<typeof newEditor>, fn: () => void) =>
  editor.update(fn, { discrete: true });

test("links travel as Markdown links; text colors drop", () => {
  const editor = newEditor();
  let markdown = "";
  editor.update(
    () => {
      const line = $createParagraphNode().append(
        $createTextNode("See "),
        $createLinkNode("https://example.gov.bb/help (faq)").append(
          $createTextNode("the help").toggleFormat("bold"),
        ),
        $createTextNode(" now").setStyle("color: #FF4444"),
      );

      $getRoot().append(line);
      markdown = $toMarkdown(line);
    },
    { discrete: true },
  );
  expect(markdown).toBe("See [**the help**](https://example.gov.bb/help%20%28faq%29) now");
});

test("undo coalesces typing without losing its baseline, truncates redo branches and caps history at 50", () => {
  const states = (steps: Step<string>[]) => steps.map((step) => step.state);
  const steps: Step<string>[] = [];
  let index = pushStep(steps, 0, "A", "B", 0);
  expect(states(steps)).toEqual(["A", "B"]); // the first push keeps the state before it, and two never merge
  index = pushStep(steps, index, "B", "C", 1000);
  index = pushStep(steps, index, "C", "D", 1500); // C was 500ms before: gone
  index = pushStep(steps, index, "D", "E", 2200); // rolling: D was 700ms before
  expect(states(steps)).toEqual(["A", "B", "E"]);
  index = pushStep(steps, index - 1, "B", "F", 5000); // after an undo, a new step drops the redo branch
  expect(states(steps)).toEqual(["A", "B", "F"]);
  expect(index).toBe(2);

  // The initial state remains reachable even when the first edits are rapid.
  const quick: Step<string>[] = [];
  expect(pushStep(quick, pushStep(quick, 0, "start", "a", 0), "a", "ab", 100)).toBe(1);
  expect(states(quick)).toEqual(["start", "ab"]);

  const long: Step<string>[] = [];
  let at = 0;

  for (let i = 0; i < 60; i++) at = pushStep(long, at, String(i), String(i + 1), i * 1000);
  expect(long.length).toBe(50);
  expect(at).toBe(49);
  expect(long[0]!.state).toBe("11");
});

test("undo skips selection moves and changes that change nothing; history-merge updates join the step", async () => {
  const editor = newEditor();
  registerEditorHistory(editor);
  const canUndo: boolean[] = [];
  editor.registerCommand(
    CAN_UNDO_COMMAND,
    (can) => (canUndo.push(can), false),
    COMMAND_PRIORITY_EDITOR,
  );

  const text = () =>
    editor.getEditorState().read(() => $getRoot().getTextContent(), { editor: editor });

  const $line = () => {
    const node = $getRoot().getFirstDescendant();

    if (!$isTextNode(node)) throw Error("Expected editable text");

    return node;
  };

  let now = 0;

  // Updates and commands commit on the next microtask, as in the app; each one a second after the last
  const step = async (fn: () => void, tag?: string) => (
    vi.setSystemTime(new Date((now += 1000))),
    editor.update(fn, { tag }),
    await Promise.resolve()
  );

  const command = async (type: typeof UNDO_COMMAND) => (
    editor.dispatchCommand(type, undefined),
    await Promise.resolve()
  );

  try {
    await step(
      () => $getRoot().append($createParagraphNode().append($createTextNode("a"))),
      HISTORY_MERGE_TAG,
    );
    await step(() => $line().setTextContent("ab"));
    await step(() => $line().setTextContent("ab")); // nothing changes
    await step(() => $line().select(0, 0)); // the caret alone
    await step(() => $line().setTextContent("abc"));
    await step(() => $line().setTextContent("abc!"), HISTORY_MERGE_TAG); // a widget tidying up
    expect(canUndo).toEqual([true, true]);
    await command(UNDO_COMMAND);
    expect(text()).toBe("ab");
    await command(UNDO_COMMAND);
    expect(text()).toBe("a");
    await command(UNDO_COMMAND); // nothing before the first step
    expect(text()).toBe("a");
    await command(REDO_COMMAND);
    await command(REDO_COMMAND);
    expect(text()).toBe("abc!");
  } finally {
    vi.useRealTimers();
  }
});

test("rapid first edits keep a nonempty baseline through normalization, selection and redo branching", async () => {
  const editor = newEditor();
  run(editor, () => $getRoot().append($createParagraphNode().append($createTextNode("original"))));
  registerEditorHistory(editor);
  const canUndo: boolean[] = [];
  editor.registerCommand(
    CAN_UNDO_COMMAND,
    (value) => (canUndo.push(value), false),
    COMMAND_PRIORITY_EDITOR,
  );

  const text = () =>
    editor.getEditorState().read(() => $getRoot().getTextContent(), { editor: editor });

  const line = () => {
    const node = $getRoot().getFirstDescendant();

    if (!$isTextNode(node)) throw Error("Expected editable text");

    return node;
  };

  let now = 0;

  const edit = async (value: string, tag?: string) => {
    vi.setSystemTime(new Date((now += 20)));
    editor.update(() => line().setTextContent(value), { tag });
    await Promise.resolve();
  };

  const command = async (type: typeof UNDO_COMMAND) => {
    editor.dispatchCommand(type, undefined);
    await Promise.resolve();
  };

  try {
    await edit("a");
    await edit("ab");
    editor.update(() => line().select(0, 0));
    await Promise.resolve();
    await edit("ab!", HISTORY_MERGE_TAG);
    await command(UNDO_COMMAND);
    expect(text()).toBe("original");
    expect(canUndo.at(-1)).toBe(false);
    await command(REDO_COMMAND);
    expect(text()).toBe("ab!");
    await edit("structural", HISTORY_PUSH_TAG);
    await edit("typing after insertion");
    await command(UNDO_COMMAND);
    expect(text()).toBe("structural");
    await command(UNDO_COMMAND);
    expect(text()).toBe("ab!");
    await edit("new branch");
    await command(REDO_COMMAND);
    expect(text()).toBe("new branch");
    await command(UNDO_COMMAND);
    expect(text()).toBe("ab!");
    await command(UNDO_COMMAND);
    expect(text()).toBe("original");
  } finally {
    vi.useRealTimers();
  }
});

test("rapid duplicate and delete remain separate undoable structural actions", async () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append(
      $createFormTitleNode(),
      $createQuestionNode().append($createTextNode("Name")),
      $createInputNode("text"),
    );
    $ensureBlockIds($getRoot());
    $ensureQuestionFields($getRoot());
  });
  registerEditorHistory(editor);

  const count = () =>
    editor.getEditorState().read(() => $getRoot().getChildrenSize(), { editor: editor });

  const command = async (type: typeof UNDO_COMMAND) => {
    editor.dispatchCommand(type, undefined);
    await Promise.resolve();
  };

  run(editor, () => $duplicateQuestion($getRoot().getChildren()[1]!));
  expect(count()).toBe(5);
  run(editor, () => $removeBlocks([$getRoot().getChildren()[3]!]));
  expect(count()).toBe(3);
  await command(UNDO_COMMAND);
  expect(count()).toBe(5);
  await command(UNDO_COMMAND);
  expect(count()).toBe(3);
  await command(REDO_COMMAND);
  expect(count()).toBe(5);
  await command(REDO_COMMAND);
  expect(count()).toBe(3);
});

test("Enter in the middle of a heading leaves the rest as a text line", () => {
  const editor = newEditor();
  run(editor, () => {
    const text = $createTextNode("Hello world");
    $getRoot().append($createFormTitleNode(), $createHeadingNode("h2").append(text));
    text.select(5, 5);
    expect($enter()).toBe(true);
    const [, heading, rest] = $getRoot().getChildren();
    expect($isHeadingNode(heading) && heading.getTextContent()).toBe("Hello");
    expect($isParagraphNode(rest) && rest.getTextContent()).toBe(" world");
  });
});

test("drops preserve folded questions and pages and keep options in their question", () => {
  const editor = newEditor();
  run(editor, () => {
    const folded = $setSettings($createQuestionNode(), { folded: true });
    const [a, b] = [$createOptionNode(), $createOptionNode()];
    const text = $createParagraphNode();
    const question = $createQuestionNode();
    const [c, d] = [$createOptionNode("dropdown"), $createOptionNode("dropdown")];
    const calc = $createWidgetNode("calculated-fields");
    const page = $setSettings($createWidgetNode("page-break"), { folded: true });
    const [p1, p2] = [$createParagraphNode(), $createParagraphNode()];
    const page3 = $createWidgetNode("page-break");
    const [p3, p4] = [$createParagraphNode(), $createParagraphNode()];
    $getRoot().append(
      $createFormTitleNode(),
      folded,
      a,
      b,
      text,
      question,
      c,
      d,
      calc,
      page,
      p1,
      p2,
      page3,
      p3,
      p4,
    );

    const order = (...nodes: LexicalNode[]) =>
      expect(
        $getRoot()
          .getChildren()
          .slice(1)
          .map((n) => n.getKey()),
      ).toEqual(nodes.map((n) => n.getKey()));

    const $canDrop = (node: LexicalNode, target: LexicalNode) =>
      $dropCheck(node, $blockZone(target)).drop;

    $dropBlocks(text, $blockZone(folded)); // after the folded question, not inside it
    order(folded, a, b, text, question, c, d, calc, page, p1, p2, page3, p3, p4);
    expect($canDrop(calc, folded)).toBe(false); // only titles and text go after a folded question
    expect($canDrop(calc, c)).toBe(false); // nor into the middle of another question
    expect($canDrop(calc, d)).toBe(true);
    expect($canDrop(text, c)).toBe(true); // text goes anywhere
    expect($canDrop(c, d)).toBe(true); // an option moves among its own options
    expect($canDrop(c, question)).toBe(true);
    expect($canDrop(c, text)).toBe(false);
    expect($canDrop(text, page)).toBe(false); // a folded page takes only page breaks
    expect($dropCheck(page, $blockZone(p3)).lit).toBe(false); // a folded page lights only where a page ends
    $dropBlocks(page, $blockZone(p3)); // but lands at the end of the page it's dropped in
    order(folded, a, b, text, question, c, d, calc, page3, p3, p4, page, p1, p2);
    $dropBlocks(page3, $blockZone(page)); // an unfolded page break may
    order(folded, a, b, text, question, c, d, calc, p3, p4, page, page3, p1, p2);
  });
});

test("mentions retain missing targets; a calculated field that loses its name stays", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $createQuestionNode().append($createTextNode("Age"));
    const input = $createInputNode("number");

    const calc = $setSettings($createWidgetNode("calculated-fields"), {
      name: "score",
      fieldType: "NUMBER",
    });

    const line = $createParagraphNode();
    $getRoot().append($createFormTitleNode(), title, input, calc, line);
    $ensureBlockIds($getRoot());
    $ensureQuestionFields($getRoot());
    line.append(
      $createMentionNode($questionKey(input), "Age"),
      $createMentionNode(`${$blockId(calc)}:0`, "score"),
      $createMentionNode("elsewhere", "Pasted"),
    );
    const known = new Set($mentionTargets().keys());
    title.remove();
    input.remove();
    $setSettings(calc, { name: "" });
    $updateMentions($getRoot(), known);
    // Missing targets remain recoverable; the calculated field follows its empty name.
    expect(line.getChildren().map((node) => node.getTextContent())).toEqual([
      "@Age",
      "@",
      "@Pasted",
    ]);
  });
});

test("mentions travel as {{key}} tokens, with their default value", () => {
  const editor = newEditor();
  run(editor, () => {
    const mention = $createMentionNode("age-key", "Age");

    const line = $createParagraphNode().append(
      $createTextNode("You are "),
      mention,
      $createTextNode(" years old"),
    );

    $getRoot().append(line);
    expect($toMarkdown(line)).toBe("You are {{age-key}} years old");
  });
});

test("copies' formulas refer to the copied fields, and to the originals past them", () => {
  const editor = newEditor();
  run(editor, () => {
    const [title, input, calc, logic] = [
      $createQuestionNode(),
      $createInputNode("number"),
      $createWidgetNode("calculated-fields"),
      $createWidgetNode("conditional-logic"),
    ];

    const outside = $createInputNode("number");
    $getRoot().append($createFormTitleNode(), outside, title, input, calc, logic);
    $ensureBlockIds($getRoot());
    $ensureQuestionFields($getRoot());
    const formula = (a: string, c: string, o: string) => `{{${a}}} * 2 + {{${c}:f1}} - {{${o}}}`;
    const field = `${$blockId(calc)}:f1`;
    $setSettings(calc, { calculatedFields: [{ id: "f1", name: "total", type: "NUMBER" }] });
    $setSettings(logic, {
      actions: [
        {
          id: "0",
          type: "CALCULATE",
          calculate: {
            field,
            operator: "FORMULA",
            expression: formula($questionKey(input), $blockId(calc), $questionKey(outside)),
          },
        },
      ],
    });
    let last: LexicalNode = logic;

    const pairs = [title, input, calc, logic].map((original): [LexicalNode, LexicalNode] => [
      original,
      (last = last.insertAfter($deepCopy(original))),
    ]);

    $remapCopies(pairs);
    $ensureQuestionFields($getRoot());
    const [, inputCopy, calcCopy, logicCopy] = pairs.map(([, copy]) => copy);

    const action = settingsObject(settingsArray($settings(logicCopy!).actions)[0]);
    const calculate = settingsObject(action.calculate);

    expect(calculate.field).toBe(`${$blockId(calcCopy!)}:f1`);
    expect(calculate.expression).toBe(
      formula($questionKey(inputCopy!), $blockId(calcCopy!), $questionKey(outside)),
    );
  });
});

test("selection rectangles are disabled on touch-first devices except Windows hybrids", () => {
  const device = (
    media: string[],
    maxTouchPoints: number,
    userAgent: string,
    more: {
      ontouchstart?: null;
      TouchEvent?: new () => object;
      DocumentTouch?: new () => object;
    } = {},
    screen = { width: 390, height: 844 },
  ) => ({
    matchMedia: (query: string) => ({ matches: media.includes(query) }),
    navigator: { maxTouchPoints, userAgent },
    screen,
    ...more,
  });

  const touch = { ontouchstart: null, TouchEvent: class {} };
  const mouse = ["(pointer: fine)", "(any-pointer: fine)", "(any-hover: hover)"];
  expect(touchFirst(device(mouse, 0, "Macintosh"))).toBe(false);
  expect(
    touchFirst(device(["(pointer: coarse)", "(any-pointer: coarse)"], 5, "iPhone", touch)),
  ).toBe(true);
  // A touchscreen laptop, and a Windows tablet with its pen: hybrids on Windows keep it
  expect(
    touchFirst(device([...mouse, "(any-pointer: coarse)"], 10, "Windows NT 10.0", touch)),
  ).toBe(false);
  expect(
    touchFirst(
      device(
        ["(pointer: coarse)", "(any-pointer: coarse)", "(any-pointer: fine)"],
        10,
        "Windows NT 10.0",
        touch,
      ),
    ),
  ).toBe(false);

  // An iPad with a trackpad (it says Macintosh) takes touch first
  const ipad = device(
    ["(pointer: coarse)", "(any-pointer: coarse)", "(any-pointer: fine)", "(any-hover: hover)"],
    5,
    "Macintosh",
    touch,
    { width: 1024, height: 1366 },
  );

  expect(touchFirst(ipad)).toBe(true);
});
