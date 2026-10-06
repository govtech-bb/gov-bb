import { createEditor } from "../helpers/default-form";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createParagraphNode, $getRoot, type LexicalNode } from "lexical";
import {
  $blockGroup,
  $createFormTitleNode,
  $createQuestionNode,
  $deepCopy,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
  $settingsHolder,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { $blockId, $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";

test("a question keeps the text between its title and its inputs, not after them", () => {
  const editor = createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (e) => {
      throw e;
    },
  });

  editor.update(
    () => {
      const title = $createQuestionNode();
      const note = $createParagraphNode();
      const [a, b] = [$createOptionNode(), $createOptionNode()];
      const after = $createParagraphNode();
      const bare = $createInputNode();
      const logic = $createWidgetNode("conditional-logic");
      $getRoot().append($createFormTitleNode(), title, note, a, b, after, bare, logic);
      const group = (node: LexicalNode) => $blockGroup(node).map((n) => n.getKey());
      const question = [title, note, a, b].map((n) => n.getKey());
      expect(group(title)).toEqual(question);
      expect(group(b)).toEqual(question);
      expect(group(note)).toEqual([note.getKey()]); // text keeps its own actions
      expect(group(bare)).toEqual([bare.getKey()]); // an untitled input doesn't reach back over free text
      expect(group(logic)).toEqual([logic.getKey()]);
    },
    { discrete: true },
  );
});

test("an input without a title is its own question, even right after another question's answers", () => {
  const editor = createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (e) => {
      throw e;
    },
  });

  editor.update(
    () => {
      const title = $createQuestionNode();
      const [a, b] = [$createOptionNode("checkboxes"), $createOptionNode("checkboxes")];
      const other = $createOptionNode("dropdown");
      const [first, second] = [$createInputNode(), $createInputNode()];
      const title2 = $createQuestionNode();
      $getRoot().append(
        $createFormTitleNode(),
        title,
        a,
        b,
        other,
        first,
        title2,
        second,
        $createInputNode(),
      );
      const group = (node: LexicalNode) => $blockGroup(node).map((n) => n.getKey());
      expect(group(b)).toEqual([title, a, b].map((n) => n.getKey()));
      expect(group(other)).toEqual([other.getKey()]); // options of another kind start another question
      expect(group(first)).toEqual([first.getKey()]);
      expect(group(title2)).toEqual([title2, second].map((n) => n.getKey())); // one input per title
    },
    { discrete: true },
  );
});

test("options that join a question take its settings, and keep their own", () => {
  const editor = createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (e) => {
      throw e;
    },
  });

  editor.update(
    () => {
      const first = $setSettings($createOptionNode(), { required: true, other: true });
      const joined = $setSettings($createOptionNode(), { hidden: true });
      $getRoot().append($createQuestionNode(), first, joined);
      $shareQuestionSettings($getRoot());
      expect($settings(joined)).toEqual({ hidden: true, required: true });
      first.remove(); // the question keeps Required with its first option gone
      expect($settings($settingsHolder(joined)).required).toBe(true);
    },
    { discrete: true },
  );
});

test("a question's field id stays put when its first option goes, and copies get their own", () => {
  const editor = createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (e) => {
      throw e;
    },
  });

  editor.update(
    () => {
      const [a, b] = [$createOptionNode(), $createOptionNode()];
      $getRoot().append($createFormTitleNode(), $createQuestionNode(), a, b);

      const settle = () => {
        $ensureBlockIds($getRoot());
        $shareQuestionSettings($getRoot());
        $ensureQuestionFields($getRoot());
      };

      settle();
      const key = $questionKey(a);
      expect(key).toBe($blockId(a)); // new questions keep the key logic already uses
      expect($questionKey(b)).toBe(key);
      a.remove();
      settle();
      expect($questionKey(b)).toBe(key); // deleting the first option doesn't move it
      // A duplicate (it lands below): the original keeps its key, the copy gets another
      const copy = $deepCopy(b);
      $getRoot().append($createQuestionNode(), copy);
      settle();
      expect($questionKey(b)).toBe(key);
      expect($questionKey(copy)).not.toBe(key);
      // A copy pasted above a question that still has its first option: the owner keeps its key
      const c = $createOptionNode();
      $getRoot().append($createQuestionNode(), c);
      settle();
      const own = $questionKey(c);
      $getRoot().getFirstChild()!.insertAfter($deepCopy(c));
      settle();
      expect($questionKey(c)).toBe(own);
      expect(
        $getRoot()
          .getChildren()
          .filter((n) => $questionKey(n) === own).length,
      ).toBe(1);
    },
    { discrete: true },
  );
});
