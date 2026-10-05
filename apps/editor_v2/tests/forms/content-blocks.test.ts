import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $getRoot,
  $getSelection,
  $getState,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import { $enter } from "../../src/forms/editor/structure/editing";
import { shortcuts } from "../../src/forms/editor/structure/keyboard";
import { $registryBlocks as $govbbField } from "../../src/forms/editor/registry-module";
import { $insertBlocks } from "../../src/forms/editor/insertion";
import { $insertionGroups } from "../helpers/insertion";
import { $executeAction } from "../../src/editor/core/actions";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { compileForm, preflight, type FormSchema } from "../helpers/default-form";
import { $describe } from "../../src/forms/react/gutter";
import { MentionNode } from "../../src/forms/features/mentions/node";
import { $normalizeDepths } from "../../src/forms/editor/nesting";
import { $migrateLegacyConditions } from "../../src/forms/features/logic/migration";
import { logicIssues } from "../../src/forms/editor/capabilities";
import {
  $blockId,
  $depth,
  $setDepth,
  $setSettings,
  $settings,
} from "../../src/editor/core/document-state";
import {
  $blockKind,
  $canBeConfirmationPage,
  $createFormTitleNode,
  $createQuestionNode,
  $deepCopy,
  $ensureBlockIds,
  $ensureQuestionFields,
  $isFoldedAway,
  $normalizePages,
  $questionKey,
  $shareQuestionSettings,
  $toText,
  $turnInto,
} from "../../src/forms/editor/nodes";
import {
  $createBulletNode,
  $createListLine,
  $createNumberNode,
  $isListLine,
  listIndexState,
} from "../../src/editor/modules/lists/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
  $isOptionNode,
} from "../../src/forms/editor/answer-nodes";
import { $createInsetNode, $createWarningNode } from "../../src/editor/modules/callouts/nodes";
import { $createShowHideNode, $toggleShowHide } from "../../src/editor/modules/disclosure/nodes";
import { formNodes } from "../helpers/default-form";
import { $ssbIds } from "../../src/forms/editor/ssb";
import { $pagePreview } from "../../src/forms/features/pages/queries";
import { $native } from "../../src/forms/editor/native-state";

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

const migrate = (editor: ReturnType<typeof newEditor>) =>
  editor.update($migrateLegacyConditions, { discrete: true });

const blocks = (schema: FormSchema) => schema.pages.flatMap((page) => page.blocks);

const questions = (schema: FormSchema) =>
  blocks(schema).filter((block) => block.type === "question");

const $text = <T extends ElementNode>(node: T, text: string) => node.append($createTextNode(text));

const $top = <T extends LexicalNode>(node: T) => $setDepth(node, 0);

test("list shortcuts make bullets and numbers, keeping the insertion depth", () => {
  const editor = newEditor();
  run(editor, () => {
    const section = $createShowHideNode();
    const line = $setDepth($createParagraphNode(), 1);
    $getRoot().append($createFormTitleNode(), section, line);
    expect(shortcuts["- "]!()[0]!.getType()).toBe("bullet");
    expect(shortcuts["* "]!()[0]!.getType()).toBe("bullet");
    expect(shortcuts["1. "]!()[0]!.getType()).toBe("number");
    $insertBlocks(shortcuts["1. "]!(), line);
    expect($depth($getRoot().getLastChild()!)).toBe(1);
  });
});

test("insertion completes an existing title and hint without introducing another question", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $text($createQuestionNode(), "Contact email");
    const hint = $text($createParagraphNode(), "Use an address you check regularly");
    const line = $createParagraphNode();
    $getRoot().append($createFormTitleNode(), title, hint, line);
    const contextual = $insertionGroups(line);
    expect(contextual[0]![0]).toBe("Answer inputs");
    expect(
      $executeAction(
        editor,
        govbbFormEditor,
        contextual[0]![1].find((entry) => entry.id === "INPUT_EMAIL")!.id,
        { targetKey: line.getKey() },
      ).executed,
    ).toBe(true);
    expect($insertionGroups(title)[0]![0]).toBe("Questions");
    expect($insertionGroups(hint)[0]![0]).toBe("Questions");
  });
  const compiled = questions(compileForm(editor.getEditorState()));
  expect(compiled).toHaveLength(1);
  expect(compiled[0]!.title).toBe("Contact email");
  expect(compiled[0]!.description).toMatchObject([
    { type: "text", markdown: "Use an address you check regularly" },
  ]);
  expect(compiled[0]!.kind).toBe("email");
});

test("contextual inputs do not cross a page, existing answer or nesting boundary", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $createQuestionNode();
    const line = $createParagraphNode();
    $getRoot().append($createFormTitleNode(), title, line);

    const menu = (target: typeof line | null) =>
      $insertionGroups(target).map(([name, entries]) => [name, entries.map((entry) => entry.id)]);

    const wholeQuestions = menu(null);
    expect($insertionGroups(line)[0]![0]).toBe("Answer inputs");
    $setDepth(line, 1);
    expect(menu(line)).toEqual(wholeQuestions);
    $setDepth(line, 0);
    const answer = title.insertAfter($createInputNode());
    expect(menu(line)).toEqual(wholeQuestions);
    answer.remove();
    expect($insertionGroups(line)[0]![0]).toBe("Answer inputs");
    line.insertBefore($createWidgetNode("page-break"));
    expect(menu(line)).toEqual(wholeQuestions);
  });
});

test("Enter carries on a list, leaves an empty item, and opens an item above its start", () => {
  for (const kind of ["bullet", "number"] as const) {
    const editor = newEditor();
    run(editor, () => {
      const line = $text($setDepth($createListLine(kind), 1), "An item");
      $getRoot().append($createFormTitleNode(), $createShowHideNode(), line);
      const next = line.insertNewAfter(line.selectEnd());
      expect(next.getType()).toBe(kind);
      expect($depth(next)).toBe(1);
      next.selectStart();
      expect($enter()).toBe(true);
      expect($isParagraphNode(line.getNextSibling())).toBe(true);
      expect($depth(line.getNextSibling()!)).toBe(1);
      line.selectStart();
      expect($enter()).toBe(true);
      expect(line.getPreviousSibling()!.getType()).toBe(kind);
      expect($depth(line.getPreviousSibling()!)).toBe(1);
    });
  }
});

test("numbered items count their run and restart after text", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $createNumberNode(),
      $createNumberNode(),
      $createNumberNode(),
      $createParagraphNode(),
      $createNumberNode(),
    ),
  );
  editor.getEditorState().read(
    () => {
      expect(
        $getRoot()
          .getChildren()
          .filter($isListLine)
          .map((line) => $getState(line, listIndexState) + 1),
      ).toEqual([1, 2, 3, 1]);
    },
    { editor: editor },
  );
});

test("back to text keeps content, depth and Hide but drops block settings", () => {
  for (const $make of [$createBulletNode, $createInsetNode, $createShowHideNode]) {
    const editor = newEditor();
    run(editor, () => {
      const block = $setSettings($text($setDepth($make(), 1), "Keep this text"), {
        hidden: true,
        fieldId: "drop-this-pin",
        folded: true,
      });

      $getRoot().append($createFormTitleNode(), $createShowHideNode(), block);
      const line = $toText(block);
      expect($isParagraphNode(line)).toBe(true);
      expect(line.getTextContent()).toBe("Keep this text");
      expect($depth(line)).toBe(1);
      expect($settings(line)).toEqual({ hidden: true });
      const selection = $getSelection();
      expect($isRangeSelection(selection) && selection.anchor.offset).toBe(0);
    });
  }
});

test("Confirmation pages accept lists, but neither warnings nor numeric inputs", () => {
  for (const [$make, allowed] of [
    [$createNumberNode, true],
    [$createWarningNode, false],
    [() => $createInputNode("number"), false],
  ] as const) {
    const editor = newEditor();
    run(editor, () => {
      const page = $setSettings($createWidgetNode("page-break"), { confirmation: true });
      $getRoot().append($createFormTitleNode(), page, $make());
      expect($canBeConfirmationPage(page)).toBe(allowed);
    });
  }
});

test("lists compile once with rich text and each item's hidden state", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $createBulletNode().append($createTextNode("one").toggleFormat("bold")),
      $setSettings($text($createBulletNode(), "two"), { hidden: true }),
      $text($createBulletNode(), "three"),
    ),
  );
  const list = blocks(compileForm(editor.getEditorState()))[0]!;
  expect(list.type).toBe("list");

  if (list.type !== "list") throw new Error("Expected a list");
  expect(list.ordered).toBe(false);
  expect(list.id).toBe(list.items[0]!.id);
  expect(list.items.map(({ markdown, hidden }) => ({ markdown, hidden }))).toEqual([
    { markdown: "**one**", hidden: undefined },
    { markdown: "two", hidden: true },
    { markdown: "three", hidden: undefined },
  ]);
  expect(blocks(compileForm(editor.getEditorState()))).toHaveLength(1);
});

test("a list inside a content disclosure compiles with its section and depth", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $text($createShowHideNode(), "Documents"),
      $text($setDepth($createNumberNode(), 1), "Bring your ID."),
    ),
  );
  const [section, list] = blocks(compileForm(editor.getEditorState()));
  expect(section).toMatchObject({ type: "section", ssb: "details", summary: "Documents" });
  expect(list).toMatchObject({ type: "list", ordered: true, depth: 1, under: section!.id });
  expect(list!.shownWhen).toBeUndefined();
});

test("show/hide and callout IDs use summaries, four words and shared field uniqueness", () => {
  const editor = newEditor();
  run(editor, () => {
    const passport = $text($createShowHideNode(), "Use passport number instead");
    const warning = $text($createWarningNode(), "Apply at least 14 days before the event");
    const note = $text($createInsetNode(), "Keep your documents safe for later");
    const question = $text($createQuestionNode(), "What is a parish?");
    const answer = $createInputNode();
    const matching = $text($createShowHideNode(), "What is a parish?");

    const pinned = $setSettings($text($createInsetNode(), "My note"), {
      fieldId: "my-pinned-note",
    });

    $getRoot().append(
      $createFormTitleNode(),
      passport,
      warning,
      note,
      question,
      answer,
      matching,
      pinned,
    );
    $settle();
    const ids = $ssbIds();
    expect(ids.fields.get($blockId(passport))!.id).toBe("use-passport-number-instead");
    expect(ids.fields.get($blockId(warning))!.id).toBe("apply-at-least-14-warning");
    expect(ids.fields.get($blockId(note))!.id).toBe("keep-your-documents-safe-note");
    expect(ids.fields.get($blockId(matching))!.id).toBe("what-is-a-parish-2");
    expect(ids.fields.get($blockId(pinned))).toMatchObject({ id: "my-pinned-note", pinned: true });
    expect($settings($deepCopy(pinned)).fieldId).toBeUndefined();
  });
});

test("a disclosure's contents decide whether it is content details or a show-hide field", () => {
  for (const [$make, ssb] of [
    [$createParagraphNode, "details"],
    [$createBulletNode, "details"],
    [$createQuestionNode, "show-hide"],
    [$createInsetNode, "show-hide"],
    [() => $createInputNode("number"), "show-hide"],
  ] as const) {
    const editor = newEditor();
    run(editor, () =>
      $getRoot().append(
        $createFormTitleNode(),
        $text($createShowHideNode(), "More help"),
        $setDepth($make(), 1),
      ),
    );
    expect(blocks(compileForm(editor.getEditorState()))[0]).toMatchObject({ type: "section", ssb });
  }
});

test("dropdown and checkbox follow-ups use the right condition and lone-checkbox rail", () => {
  for (const [kind, count, operator, value, indent] of [
    ["dropdown", 2, "equal", "yes", undefined],
    ["checkboxes", 2, "in", ["yes"], undefined],
    ["checkboxes", 1, "in", ["yes"], true],
  ] as const) {
    const editor = newEditor();
    run(editor, () =>
      $getRoot().append(
        $createFormTitleNode(),
        $text($createQuestionNode(), "Permission"),
        $text($createOptionNode(kind), "Yes"),
        $text($setDepth($createParagraphNode(), 1), "Follow-up"),
        ...(count === 2 ? [$text($top($createOptionNode(kind)), "No")] : []),
      ),
    );
    migrate(editor);
    const [question, followUp] = blocks(compileForm(editor.getEditorState()));
    expect(question!.type).toBe("question");

    if (question!.type !== "question") throw new Error("Expected a question");
    expect(followUp!.under).toBe(question!.options[0]!.id);
    expect(followUp!.shownWhen).toEqual([
      {
        type: "fieldConditionalOn",
        targetFieldId: "permission",
        operator,
        value: value === "yes" ? value : [...value],
      },
    ]);
    expect(followUp!.indent).toBe(indent);
  }
});

test("an option inside a show-hide carries the option then section condition and an indent", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $text($createShowHideNode(), "Extra questions"),
      $text($setDepth($createQuestionNode(), 1), "Permission"),
      $text($setDepth($createOptionNode("multiple-choice"), 1), "Yes"),
      $text($setDepth($createParagraphNode(), 2), "Follow-up"),
      $text($setDepth($createOptionNode("multiple-choice"), 1), "No"),
    ),
  );
  migrate(editor);
  const [, question, followUp] = blocks(compileForm(editor.getEditorState()));
  expect(question!.shownWhen).toEqual([
    {
      type: "fieldConditionalOn",
      targetFieldId: "extra-questions",
      operator: "equal",
      value: true,
    },
  ]);
  expect(followUp!.shownWhen).toEqual([
    { type: "fieldConditionalOn", targetFieldId: "permission", operator: "equal", value: "yes" },
    {
      type: "fieldConditionalOn",
      targetFieldId: "extra-questions",
      operator: "equal",
      value: true,
    },
  ]);
  expect(followUp!.indent).toBe(true);
});

test("a migrated deeper reveal carries every ancestor answer condition", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $text($createQuestionNode(), "First"),
      $text($createOptionNode("multiple-choice"), "Yes"),
      $text($setDepth($createQuestionNode(), 1), "Second"),
      $text($setDepth($createOptionNode("multiple-choice"), 1), "Yes"),
      $text($setDepth($createQuestionNode(), 2), "Third"),
      $text($setDepth($createOptionNode("multiple-choice"), 2), "Yes"),
      $text($setDepth($createParagraphNode(), 3), "Deepest"),
    ),
  );
  migrate(editor);

  const last = blocks(compileForm(editor.getEditorState())).find(
    (block) => block.type === "text" && block.markdown === "Deepest",
  )!;

  expect(last.depth).toBe(3);
  expect(last.shownWhen).toEqual(
    ["first", "second", "third"].map((targetFieldId) => ({
      type: "fieldConditionalOn",
      targetFieldId,
      operator: "equal",
      value: "yes",
    })),
  );
  expect(last.indent).toBeUndefined();
});

test("a declaration's list joins its checkbox statement and its preview accepts it", () => {
  for (const kind of ["bullet", "number"] as const) {
    const editor = newEditor();
    run(editor, () => {
      const page = $setSettings($createWidgetNode("page-break"), { pageType: "declaration" });
      $getRoot().append(
        $createFormTitleNode(),
        page,
        $text($createQuestionNode(), "Declaration"),
        $setSettings($text($createOptionNode(), "I confirm that:"), { required: true }),
        $text($createListLine(kind), "one"),
        $text($createListLine(kind), "two"),
      );
      $settle();
      expect($pagePreview(page).warnings).toEqual([]);
    });
    const schema = compileForm(editor.getEditorState());
    expect(questions(schema)[0]!.options[0]!.label).toBe(
      kind === "bullet" ? "I confirm that:\n\n- one\n- two" : "I confirm that:\n\n1. one\n2. two",
    );
    expect(preflight(schema).some(({ code }) => code === "declaration-content")).toBe(false);
  }
});

test("preflight reports empty summaries, disclosures and callouts", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $createShowHideNode(),
      $text($createShowHideNode(), "No content"),
      $createWarningNode(),
      $createInsetNode(),
    ),
  );
  const issues = preflight(compileForm(editor.getEditorState()));
  expect(
    issues.filter(({ code }) => code === "section-summary").map(({ message }) => message),
  ).toEqual(["Write the show/hide’s summary: name what it reveals, like ‘What is a parish?’"]);
  expect(issues.filter(({ code }) => code === "section-empty")).toHaveLength(2);
  expect(
    issues.filter(({ code }) => code === "callout-empty").map(({ message }) => message),
  ).toEqual(["Write the warning, or delete it", "Write the inset text, or delete it"]);
});

test("preflight traces a nested disclosure through an option and its owning question", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $text($createShowHideNode(), "Outer"),
      $text($setDepth($createQuestionNode(), 1), "Permission"),
      $text($setDepth($createOptionNode("multiple-choice"), 1), "Yes"),
      $text($setDepth($createShowHideNode(), 2), "Inner"),
      $text($setDepth($createParagraphNode(), 3), "Contents"),
    ),
  );
  expect(
    preflight(compileForm(editor.getEditorState())).filter(
      ({ code }) => code === "nested-show-hide",
    ),
  ).toHaveLength(1);
});

test("preflight validates content field IDs against questions and other content blocks", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $text($createQuestionNode(), "Question"),
      $createInputNode(),
      $text($createInsetNode(), "A note"),
      $text($createWarningNode(), "A warning"),
    ),
  );
  const schema = compileForm(editor.getEditorState());
  const callouts = blocks(schema).filter((block) => block.type === "callout");
  callouts[0]!.fieldId = questions(schema)[0]!.fieldId;
  callouts[1]!.fieldId = "Invalid ID";
  expect(
    preflight(schema)
      .filter(({ code }) => code === "field-id")
      .map(({ message }) => message),
  ).toEqual([
    "Another block already uses this ID",
    "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)",
  ]);
});

test("logic can target nested questions, hints, options and list items without competing ownership", () => {
  const editor = newEditor();
  run(editor, () => {
    const host = $text($createOptionNode("multiple-choice"), "Yes");
    const title = $text($setDepth($createQuestionNode(), 1), "Follow-up");
    const hint = $text($setDepth($createParagraphNode(), 1), "Help");
    const answer = $text($setDepth($createOptionNode(), 1), "Confirm");
    const item = $text($setDepth($createBulletNode(), 1), "Document");
    const logic = $top($createWidgetNode("conditional-logic"));
    $getRoot().append(
      $createFormTitleNode(),
      $text($createQuestionNode(), "Permission"),
      host,
      title,
      hint,
      answer,
      item,
      logic,
    );
    $settle();
    const key = $questionKey(answer);

    const ids = [
      key,
      `${key}:${key}`,
      $blockId(title),
      $blockId(hint),
      $blockId(answer),
      $blockId(item),
    ];

    $setSettings(logic, {
      actions: ids.map((id, i) => ({
        id: String(i),
        type: i % 2 ? "HIDE_BLOCKS" : "SHOW_BLOCKS",
        ...(i % 2 ? { hideBlocks: [id] } : { showBlocks: [id] }),
      })),
    });
  });
  const schema = compileForm(editor.getEditorState());
  const logic = blocks(schema).find((block) => block.type === "logic")!;

  if (logic.type !== "logic") throw new Error("Expected logic");

  for (const action of logic.actions) {
    const one = {
      ...schema,
      pages: schema.pages.map((page) => ({
        ...page,
        blocks: page.blocks.map((block) =>
          block === logic ? { ...logic, actions: [action] } : block,
        ),
      })),
    };

    expect(preflight(one).filter(({ code }) => code === "logic-owned-block")).toEqual([]);
    expect(logicIssues(one).filter(({ code }) => code === "missing-reference")).toEqual([]);
  }
});

test("Address with country places Parish and Postcode after Barbados and owns their native visibility rule", () => {
  const editor = newEditor();
  run(editor, () => {
    const line = $createParagraphNode();
    $getRoot().append($setSettings($createFormTitleNode(), { logicVersion: 2 }), line);
    $insertBlocks($govbbField("GOVBB_ADDRESS_COUNTRY"), line);
    $settle();
    const all = $getRoot().getChildren();

    const barbados = all.find(
      (node) => $isOptionNode(node) && node.getTextContent() === "Barbados",
    )!;

    const next = all.slice(all.indexOf(barbados) + 1);
    const parish = next.find((node) => node.getTextContent() === "Parish")!;
    const postcode = next.find((node) => node.getTextContent() === "Postcode")!;
    expect(next[0]!.is(parish)).toBe(true);
    expect($depth(parish)).toBe(1);
    expect($depth(postcode)).toBe(1);
    expect($isFoldedAway(parish)).toBe(true);
    expect($isFoldedAway(postcode)).toBe(true);
  });
  editor.getEditorState().read(() => {
    const native = $getRoot().getChildren().map($native);
    const country = native.find((value) => value.question?.key === "country")!.question!;

    const barbados = native.find(
      (value) => value.question?.id === country.id && value.option?.value === "barbados",
    )!.option!;

    const targets = ["parish", "postcode"].map(
      (key) => native.find((value) => value.question?.key === key)!.question!,
    );

    expect(targets.every((question) => question.visible === false)).toBe(true);
    expect(native.filter((value) => value.logic).map((value) => value.logic!.rules)).toEqual([
      [
        expect.objectContaining({
          when: { op: "selected", question: country.id, option: barbados.id },
          actions: [
            { type: "setVisible", targets: targets.map((question) => question.id), value: true },
          ],
        }),
      ],
    ]);
  });
});

test("the menu offers follow-ups and names their host, except on the declaration page", () => {
  const editor = newEditor();
  run(editor, () => {
    const yes = $text($createOptionNode("multiple-choice"), "Yes");
    const followUp = $text($setDepth($createParagraphNode(), 1), "Follow-up");

    const declaration = $top(
      $setSettings($createWidgetNode("page-break"), { pageType: "declaration" }),
    );

    const confirm = $createOptionNode();
    $getRoot().append(
      $createFormTitleNode(),
      $createQuestionNode(),
      yes,
      followUp,
      declaration,
      $createQuestionNode(),
      confirm,
    );
    $settle();
    expect($describe(yes.getKey())!.menu.followUp).toBe(true);
    expect($describe(followUp.getKey())!.menu.nested).toEqual({ host: "Yes" });
    expect($describe(confirm.getKey())!.menu.followUp).toBeFalsy();
  });
});

test("show/hide Enter opens its content and folding moves its caret back to the summary", () => {
  const editor = newEditor();
  run(editor, () => {
    const summary = $setSettings($text($createShowHideNode(), "More help"), { folded: true });
    $getRoot().append($createFormTitleNode(), summary);
    const line = summary.insertNewAfter(summary.selectEnd());
    expect($depth(line)).toBe(1);
    expect($settings(summary).folded).toBeUndefined();
    line.selectStart();
    $toggleShowHide(summary);
    const selection = $getSelection();
    expect(
      $isRangeSelection(selection) && selection.anchor.getNode().getTopLevelElement()!.is(summary),
    ).toBe(true);
    expect($isFoldedAway(line)).toBe(true);
  });
});

test("turning rich text into a show/hide clears its formats", () => {
  const editor = newEditor();
  run(editor, () => {
    const line = $createParagraphNode().append($createTextNode("Summary").toggleFormat("bold"));
    $getRoot().append($createFormTitleNode(), line);
    $turnInto(line, "show-hide");
    const summary = $getRoot().getLastChild();

    if (!$isElementNode(summary)) throw Error("Expected summary element");
    expect(summary.getAllTextNodes()[0]!.getFormat()).toBe(0);
  });
});

test("numbered lists and number inputs keep separate menu settings and icons", () => {
  const editor = newEditor();
  run(editor, () => {
    const item = $createNumberNode();
    const input = $createInputNode("number");
    $getRoot().append($createFormTitleNode(), item, $createQuestionNode(), input);
    $settle();
    expect($blockKind(item)).toBe("number");
    expect($blockKind(input)).toBe("number");
    expect($describe(item.getKey())!.menu.header).toBeUndefined();
    expect($describe(item.getKey())!.menu.fieldArray).toBeUndefined();
    expect(
      $describe(item.getKey())!.menu.turnInto!.options.map(([kind, label]) => [kind, label]),
    ).toContainEqual(["number", "Numbered list"]);
    expect($describe(input.getKey())!.menu.header).toBeDefined();
    expect($describe(input.getKey())!.menu.fieldArray).toBeDefined();
    expect($describe(input.getKey())!.menu.turnInto).toBeUndefined();
    expect(
      govbbFormEditor.actions.filter(({ id }) =>
        ["BULLETED_LIST", "NUMBERED_LIST", "SHOW_HIDE", "INSET_TEXT", "WARNING_TEXT"].includes(id),
      ),
    ).toHaveLength(5);
  });
});
