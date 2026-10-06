import { createEditor } from "../helpers/default-form";
import { $createLinkNode, LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { $describe } from "../../src/forms/react/gutter";
import { $createMentionNode, MentionNode } from "../../src/forms/features/mentions/node";
import {
  $blockGroup,
  $createFormTitleNode,
  $createQuestionNode,
  $editHint,
  $ensureBlockIds,
  $ensureQuestionFields,
  $hintBlocks,
} from "../../src/forms/editor/nodes";
import { $createInputNode, $createOptionNode } from "../../src/forms/editor/answer-nodes";
import { $depth, $setDepth, $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";

const makeEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

test("editing a rich hint focuses its existing paragraph without flattening text or other hints", () => {
  const editor = makeEditor();
  let answer: ReturnType<typeof $createInputNode>, hint: ReturnType<typeof $createParagraphNode>;
  editor.update(
    () => {
      answer = $createInputNode();
      hint = $createParagraphNode().append(
        $createTextNode("Read ").toggleFormat("bold"),
        $createLinkNode("https://example.com/help").append($createTextNode("the guidance")),
        $createTextNode(" for "),
        $createMentionNode("other-question", "Your application"),
      );
      $getRoot().append(
        $createFormTitleNode(),
        $createQuestionNode().append($createTextNode("Name")),
        hint,
        $createParagraphNode().append($createTextNode("A second hint paragraph")),
        answer,
      );
    },
    { discrete: true },
  );
  const before = editor.getEditorState().toJSON();
  editor.update(
    () => {
      expect($editHint(answer!)?.is(hint!)).toBe(true);
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);

      if ($isRangeSelection(selection))
        expect(selection.anchor.getNode().getTopLevelElement()?.is(hint!)).toBe(true);
      expect($hintBlocks(answer!)).toHaveLength(2);
    },
    { discrete: true },
  );
  expect(editor.getEditorState().toJSON()).toEqual(before);
});

test("adding a hint to a nested question keeps its depth and reuses the paragraph on subsequent edits", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const title = $setDepth($createQuestionNode().append($createTextNode("Details")), 1);
      const answer = $setDepth($createInputNode(), 1);
      $getRoot().append(
        $createFormTitleNode(),
        $createQuestionNode(),
        $createOptionNode("multiple-choice").append($createTextNode("Yes")),
        title,
        answer,
      );
      const hint = $editHint(answer)!;
      expect($depth(hint)).toBe(1);
      expect($hintBlocks(answer)?.map((node) => node.getKey())).toEqual([hint.getKey()]);
      expect($blockGroup(answer).map((node) => node.getKey())).toEqual([
        title.getKey(),
        hint.getKey(),
        answer.getKey(),
      ]);
      expect($editHint(answer)?.is(hint)).toBe(true);
      expect($hintBlocks(answer)).toHaveLength(1);
      const untitled = $createInputNode();
      $getRoot().append(untitled);
      expect($editHint(untitled)).toBeNull();
    },
    { discrete: true },
  );
});

test("the menu header follows the visible question label while preserving a saved internal alias", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const title = $createQuestionNode().append($createTextNode("Name on your passport"));
      const answer = $setSettings($createInputNode(), { name: "Applicant legal name" });
      $getRoot().append($createFormTitleNode(), title, answer);
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      expect($describe(answer.getKey())?.menu.header?.name).toBe("Name on your passport");
      title.clear().append($createTextNode("Your full name"));
      expect($describe(answer.getKey())?.menu.header?.name).toBe("Your full name");
      expect($settings(answer).name).toBe("Applicant legal name");
      title.clear();
      expect($describe(answer.getKey())?.menu.header?.name).toBe("Unlabelled text input");
      expect($settings(answer).name).toBe("Applicant legal name");
    },
    { discrete: true },
  );
});
