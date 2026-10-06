import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  type LexicalNode,
} from "lexical";
import {
  $blockZone,
  $dropBlocks,
  $duplicateQuestion,
  $foldableTitle,
  $foldQuestion,
  $moveBlocks,
  $removeBlocks,
} from "../../src/forms/editor/structure/blocks";
import { $enter } from "../../src/forms/editor/structure/editing";
import { compileForm, preflight } from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { $blockTree } from "../../src/forms/features/logic/queries";
import { MentionNode } from "../../src/forms/features/mentions/node";
import { $addFollowUp, $moveOut, $normalizeDepths } from "../../src/forms/editor/nesting";
import {
  $blockGroup,
  $blockKind,
  $createFormTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $isFoldedAway,
  $nested,
  $normalizePages,
  $questionKey,
  $shareQuestionSettings,
  $turnInto,
} from "../../src/forms/editor/nodes";
import { $blockId, $depth, $setDepth, $setSettings } from "../../src/editor/core/document-state";
import { $createBulletNode } from "../../src/editor/modules/lists/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
  $isOptionNode,
} from "../../src/forms/editor/answer-nodes";
import { $createShowHideNode, $toggleShowHide } from "../../src/editor/modules/disclosure/nodes";
import { formNodes } from "../helpers/default-form";

const newEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (e) => {
      throw e;
    },
  });

const $settle = () => {
  $normalizeDepths($getRoot());
  $shareQuestionSettings($getRoot());
  $ensureBlockIds($getRoot());
  $ensureQuestionFields($getRoot());
  $normalizePages($getRoot());
};

const run = (editor: ReturnType<typeof newEditor>, fn: () => void) =>
  editor.update(
    () => {
      fn();
      $settle();
    },
    { discrete: true },
  );

const $keys = (nodes: LexicalNode[]) => nodes.map((node) => node.getKey());

const $order = (...nodes: LexicalNode[]) =>
  expect($keys($getRoot().getChildren().slice(1))).toEqual($keys(nodes));

const $followUp = () => {
  const title = $setDepth($createQuestionNode().append($createTextNode("Permission")), 0);
  const yes = $setDepth($createOptionNode("multiple-choice").append($createTextNode("Yes")), 0);
  const followTitle = $setDepth($createQuestionNode().append($createTextNode("How long?")), 1);
  const followInput = $setDepth($createInputNode(), 1);
  const no = $setDepth($createOptionNode("multiple-choice").append($createTextNode("No")), 0);
  $getRoot().append($createFormTitleNode(), title, yes, followTitle, followInput, no);
  $settle();

  return { title, yes, followTitle, followInput, no };
};

test("follow-ups keep their question apart from the options around them", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    expect($keys($blockGroup(yes))).toEqual($keys([title, yes, no]));
    expect($keys($blockGroup(followTitle))).toEqual($keys([followTitle, followInput]));
    expect($questionKey(yes)).toBe($questionKey(no));
    expect($questionKey(followInput)).not.toBe($questionKey(yes));
    expect($keys($nested(yes))).toEqual($keys([followTitle, followInput]));
    expect($nested(no)).toEqual([]);
  });
});

test("new lines take the follow-up's depth before and after its question", () => {
  run(newEditor(), () => {
    const { yes, followInput } = $followUp();
    const before = $createParagraphNode();
    const after = $createParagraphNode();
    yes.insertAfter(before);
    followInput.insertAfter(after);
    $settle();
    expect($depth(before)).toBe(1);
    expect($depth(after)).toBe(1);
  });
});

test("depths clamp at titles that cannot host and at page breaks", () => {
  run(newEditor(), () => {
    const title = $createQuestionNode();
    const tooDeep = $setDepth($createQuestionNode(), 2);
    const option = $createOptionNode();
    const page = $setDepth($createWidgetNode("page-break"), 1);
    const after = $setDepth($createParagraphNode(), 1);
    $getRoot().append($createFormTitleNode(), title, tooDeep, option, page, after);
    $settle();
    expect($depth(tooDeep)).toBe(0);
    expect($depth(page)).toBe(0);
    expect($depth(after)).toBe(0);
  });
});

test("Enter after an option adds the next option after its follow-ups", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    const next = yes.insertNewAfter(yes.selectEnd());
    $settle();
    $order(title, yes, followTitle, followInput, next, no);
    expect($depth(next)).toBe(0);
    expect($keys($blockGroup(next))).toEqual($keys([title, yes, next, no]));
    expect($questionKey(next)).toBe($questionKey(yes));
  });
});

test("Enter on an empty option after follow-ups leaves a top-level text line", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    const follow = $setDepth($createParagraphNode().append($createTextNode("No follow-up")), 1);
    no.insertAfter(follow);
    const empty = no.insertNewAfter(no.selectEnd());
    empty.selectStart();
    expect($enter()).toBe(true);
    const line = $getRoot().getLastChild()!;
    expect($isParagraphNode(line)).toBe(true);
    expect($depth(line)).toBe(0);
    $order(title, yes, followTitle, followInput, no, follow, line);
  });
});

test("Enter on an empty last follow-up line moves it after the whole question", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    const line = $setDepth($createParagraphNode(), 1);
    followInput.insertAfter(line);
    line.selectStart();
    expect($enter()).toBe(true);
    $order(title, yes, followTitle, followInput, no, line);
    expect($depth(line)).toBe(0);
    const selection = $getSelection();
    expect($isRangeSelection(selection) && selection.anchor.getNode().is(line)).toBe(true);
  });
});

test("Add follow-up appends an empty line under the option", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    const line = $addFollowUp(yes);
    $order(title, yes, followTitle, followInput, line, no);
    expect(line.isEmpty()).toBe(true);
    expect($depth(line)).toBe(1);
  });
});

test("Move out takes a follow-up question after its host question", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    $moveOut(followTitle);
    $order(title, yes, no, followTitle, followInput);
    expect([$depth(followTitle), $depth(followInput)]).toEqual([0, 0]);
    expect($keys($blockGroup(followTitle))).toEqual($keys([followTitle, followInput]));
  });
});

test("deleting a question removes its options and their follow-ups", () => {
  run(newEditor(), () => {
    const { title } = $followUp();
    $removeBlocks([title]);
    expect($getRoot().getChildren().map($blockKind)).toEqual(["form-title"]);
  });
});

test("duplicating a question copies its follow-up under the copied option", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    $duplicateQuestion(title);
    $settle();
    const copies = $getRoot().getChildren().slice(6);
    expect(copies.map($blockKind)).toEqual([
      "question",
      "multiple-choice",
      "question",
      "text",
      "multiple-choice",
    ]);
    expect(copies.map($depth)).toEqual([0, 0, 1, 1, 0]);
    expect(copies.map((node) => node.getTextContent())).toEqual(
      [title, yes, followTitle, followInput, no].map((node) => node.getTextContent()),
    );
    expect($keys($nested(copies[1]!))).toEqual($keys(copies.slice(2, 4)));
    expect($questionKey(copies[1]!)).toBe($questionKey(copies[4]!));
    expect($questionKey(copies[1]!)).not.toBe($questionKey(yes));
    expect($questionKey(copies[3]!)).not.toBe($questionKey(followInput));
  });
});

test("dragging an option takes its follow-up with it", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    $dropBlocks(yes, $blockZone(no));
    $order(title, no, yes, followTitle, followInput);
    expect([$depth(yes), $depth(followTitle), $depth(followInput)]).toEqual([0, 1, 1]);
  });
});

test("dropping a top-level text line into a follow-up gives it that depth", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    const line = $setDepth($createParagraphNode().append($createTextNode("More help")), 0);
    $getRoot().append(line);
    $dropBlocks(line, $blockZone(followInput));
    $order(title, yes, followTitle, followInput, line, no);
    expect($depth(line)).toBe(1);
  });
});

test("moving follow-ups up keeps them among their siblings", () => {
  run(newEditor(), () => {
    const title = $createQuestionNode();
    const yes = $createOptionNode().append($createTextNode("Yes"));
    const first = $setDepth($createParagraphNode().append($createTextNode("First")), 1);
    const second = $setDepth($createParagraphNode().append($createTextNode("Second")), 1);
    const no = $setDepth($createOptionNode().append($createTextNode("No")), 0);
    $getRoot().append($createFormTitleNode(), title, yes, first, second, no);
    $settle();
    $moveBlocks([second], false);
    $order(title, yes, second, first, no);
    $moveBlocks([second], false);
    $order(title, yes, second, first, no);
    expect($depth(second)).toBe(1);
  });
});

test("folding a question hides its follow-ups and their title resolves to the host", () => {
  run(newEditor(), () => {
    const { title, followTitle, followInput } = $followUp();
    expect($foldableTitle(followInput)?.is(title)).toBe(true);
    $foldQuestion(title, true);
    expect($isFoldedAway(followTitle)).toBe(true);
    expect($isFoldedAway(followInput)).toBe(true);
    $foldQuestion(title, false);
    expect($isFoldedAway(followInput)).toBe(false);
  });
});

test("folding a show/hide hides its content and brings its caret to the summary", () => {
  run(newEditor(), () => {
    const summary = $createShowHideNode().append($createTextNode("What is a parish?"));
    const line = $setDepth($createParagraphNode().append($createTextNode("One of 11 areas.")), 1);
    $getRoot().append($createFormTitleNode(), summary, line);
    $settle();
    line.selectEnd();
    $toggleShowHide(summary);
    expect($isFoldedAway(line)).toBe(true);
    const selection = $getSelection();
    expect(
      $isRangeSelection(selection) && selection.anchor.getNode().getTopLevelElement()?.is(summary),
    ).toBe(true);
    $setSettings(summary, { folded: false });
    expect($isFoldedAway(line)).toBe(false);
  });
});

test("turning nested text into a heading keeps its depth", () => {
  run(newEditor(), () => {
    const { followInput } = $followUp();
    const line = $setDepth($createParagraphNode().append($createTextNode("More help")), 1);
    followInput.insertAfter(line);
    $turnInto(line, "h2");
    const heading = followInput.getNextSibling()!;
    expect($blockKind(heading)).toBe("h2");
    expect($depth(heading)).toBe(1);
    expect(heading.getTextContent()).toBe("More help");
  });
});

test("turning a bullet into a number changes its whole list run", () => {
  run(newEditor(), () => {
    const lines = ["one", "two", "three"].map((text) =>
      $createBulletNode().append($createTextNode(text)),
    );

    $getRoot().append($createFormTitleNode(), ...lines);
    $settle();
    $turnInto(lines[1]!, "number");
    expect($getRoot().getChildren().slice(1).map($blockKind)).toEqual([
      "number",
      "number",
      "number",
    ]);
    expect(
      $getRoot()
        .getChildren()
        .slice(1)
        .map((node) => node.getTextContent()),
    ).toEqual(["one", "two", "three"]);
  });
});

test("logic's block picker exposes follow-ups as separate question targets", () => {
  run(newEditor(), () => {
    const { title, yes, followTitle, followInput, no } = $followUp();
    const tree = $blockTree();
    const ids = tree.flatMap((node) => [node.id, ...node.blocks]);
    expect(ids).toContain($blockId(title));
    expect(ids).toContain($questionKey(yes));
    expect(ids).toContain($blockId(no));
    expect(ids).toContain($blockId(followTitle));
    expect(ids).toContain($questionKey(followInput));
    expect(tree.filter((node) => node.kind === "question")).toHaveLength(2);
    expect(
      tree.find((node) => node.kind === "question" && node.id === $questionKey(yes))?.blocks,
    ).not.toContain($blockId(followTitle));
    expect($blockGroup(yes).filter($isOptionNode)).toHaveLength(2);
  });
});

test("the demo compiles follow-ups and its passport disclosure without preflight issues", () => {
  const editor = newEditor();
  run(editor, $demo);
  const schema = compileForm(editor.getEditorState());
  const blocks = schema.pages.flatMap((page) => page.blocks);
  const questions = blocks.filter((block) => block.type === "question");
  const road = questions.find((question) => question.fieldId === "do-you-need-to-close-a-road")!;
  expect(
    questions.find((question) => question.title === "How long will the road be closed?"),
  ).toMatchObject({
    depth: 1,
    under: road.options.find((option) => option.label === "Yes")!.id,
    shownWhen: [
      {
        type: "fieldConditionalOn",
        targetFieldId: "do-you-need-to-close-a-road",
        operator: "equal",
        value: "yes",
      },
    ],
  });
  expect(questions.find((question) => question.title === "Passport number")).toMatchObject({
    shownWhen: [
      {
        type: "fieldConditionalOn",
        targetFieldId: "use-passport-number-instead",
        operator: "equal",
        value: true,
      },
    ],
  });
  expect(blocks.find((block) => block.type === "section")).toMatchObject({ ssb: "show-hide" });
  expect(preflight(schema)).toEqual([]);
});
