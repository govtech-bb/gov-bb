import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { $createHeadingNode, HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  type LexicalNode,
} from "lexical";
import { $insertBlocks } from "../../src/forms/editor/insertion";
import { pageEntries } from "../../src/forms/features/pages/insertion";
import { compileForm, preflight } from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { $pageButtons } from "../../src/forms/features/pages/buttons";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $canBeConfirmationPage,
  $createFormTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $isPageBreak,
  $normalizePages,
  $pageBlocks,
  $pageType,
  $questionKey,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { $ssbIds } from "../../src/forms/editor/ssb";
import { $pagePreview } from "../../src/forms/features/pages/queries";

const newEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (e) => {
      throw e;
    },
  });

const $settle = () => {
  $ensureBlockIds($getRoot());
  $shareQuestionSettings($getRoot());
  $ensureQuestionFields($getRoot());
};

const run = (editor: ReturnType<typeof newEditor>, fn: () => void) =>
  editor.update(
    () => {
      fn();
      $settle();
    },
    { discrete: true },
  );

const entry = (id: string) => pageEntries.find((entry) => entry.id === id)!;

const $declaration = () => entry("DECLARATION_PAGE").create();

const $checkAnswers = () => entry("CHECK_ANSWERS_PAGE").create()[0]!;

const $confirmation = () => $setSettings($createWidgetNode("page-break"), { confirmation: true });

const $checkbox = () =>
  $setSettings($createOptionNode("checkboxes"), { required: true }).append(
    $createTextNode("I confirm"),
  );

test("check answers goes before declaration, otherwise confirmation, otherwise at the end, without a text line", () => {
  for (const ending of ["declaration", "confirmation", "none"]) {
    const editor = newEditor();
    run(editor, () => {
      const title = $createFormTitleNode();
      const question = $createInputNode();
      $getRoot().append(title, question);

      if (ending === "declaration") $getRoot().append(...$declaration());

      if (ending !== "none") $getRoot().append($confirmation());
      const check = $checkAnswers();
      $insertBlocks([check], title);
      expect(question.getNextSibling()?.getKey()).toBe(check.getKey());
      expect($pageBlocks(check)).toEqual([]);
      expect($settings(check)).toEqual({ pageType: "check-answers", name: "Check your answers" });
      expect(check.getNextSibling() ? $pageType(check.getNextSibling()!) : null).toBe(
        ending === "declaration"
          ? "declaration"
          : ending === "confirmation"
            ? "confirmation"
            : null,
      );
      const selection = $getSelection();
      expect(
        $isNodeSelection(selection) && selection.getNodes().map((node) => node.getKey()),
      ).toEqual([check.getKey()]);
    });
  }
});

test("declaration goes after check answers and before confirmation, with the caret at the statement's end", () => {
  for (const confirmation of [true, false]) {
    const editor = newEditor();
    run(editor, () => {
      const title = $createFormTitleNode();
      const check = $checkAnswers();
      $getRoot().append(title, $createInputNode(), check);

      if (confirmation) $getRoot().append($confirmation());
      const [page, question, statement] = $declaration();
      $insertBlocks([page!, question!, statement!], title);
      expect(check.getNextSibling()?.getKey()).toBe(page!.getKey());
      expect($pageBlocks(page!).map((node) => node.getKey())).toEqual([
        question!.getKey(),
        statement!.getKey(),
      ]);
      expect(question!.getTextContent()).toBe("Declaration");
      expect(statement!.getTextContent()).toBe(
        "I confirm that the information I have given is correct",
      );
      expect($settings(statement!).required).toBe(true);
      expect(statement!.getNextSibling() ? $pageType(statement!.getNextSibling()!) : null).toBe(
        confirmation ? "confirmation" : null,
      );
      const selection = $getSelection();
      expect($isRangeSelection(selection) && selection.isCollapsed()).toBe(true);

      if ($isRangeSelection(selection)) {
        expect(selection.anchor.getNode().getTextContent()).toBe(statement!.getTextContent());
        expect(selection.anchor.offset).toBe(statement!.getTextContentSize());
      }
    });
  }
});

test("each special catalog entry is available only while its page is absent", () => {
  const editor = newEditor();
  run(editor, () => $getRoot().append($createFormTitleNode()));

  for (const id of ["CHECK_ANSWERS_PAGE", "DECLARATION_PAGE"]) {
    expect(editor.getEditorState().read(() => entry(id).available?.(), { editor: editor })).toBe(
      true,
    );
    run(editor, () => $getRoot().append(...entry(id).create()));
    expect(editor.getEditorState().read(() => entry(id).available?.(), { editor: editor })).toBe(
      false,
    );
  }

  run(editor, () => {
    for (const page of $getRoot().getChildren().filter($isPageBreak)) {
      for (const block of $pageBlocks(page)) block.remove();
      page.remove();
    }
  });

  for (const id of ["CHECK_ANSWERS_PAGE", "DECLARATION_PAGE"])
    expect(editor.getEditorState().read(() => entry(id).available?.(), { editor: editor })).toBe(
      true,
    );
});

test("reserved IDs ignore their pins, protect their names, and flow into the compiled form", () => {
  const editor = newEditor();
  run(editor, () => {
    const input = $setSettings($createInputNode(), { fieldId: "declaration-confirmed" });
    const ordinary = $setSettings($createWidgetNode("page-break"), { name: "Declaration" });
    const check = $setSettings($checkAnswers(), { pageId: "my-review" });
    const [declaration, title, checkbox] = $declaration();
    $setSettings(declaration!, { pageId: "my-declaration" });
    $setSettings(checkbox!, { fieldId: "my-confirmation" });
    const thanks = $setSettings($confirmation(), { pageId: "my-thanks" });
    $getRoot().append(
      $createFormTitleNode(),
      input,
      ordinary,
      check,
      declaration!,
      title!,
      checkbox!,
      thanks,
    );
    $settle();
    const ids = $ssbIds();

    for (const [page, id] of [
      [check, "check-your-answers"],
      [declaration!, "declaration"],
      [thanks, "submission-confirmation"],
    ] as const)
      expect(ids.pages.get(page.getKey())).toEqual({ id, pinned: false, fixed: true });
    expect(ids.pages.get(ordinary.getKey())).toEqual({ id: "declaration-2", pinned: false });
    expect(ids.fields.get($questionKey(checkbox!))).toEqual({
      id: "declaration-confirmed",
      pinned: false,
      fixed: true,
    });
    expect(ids.fields.get($questionKey(input))).toEqual({
      id: "declaration-confirmed-2",
      pinned: true,
      clash: "declaration-confirmed",
    });
  });
  const schema = compileForm(editor.getEditorState());
  expect(schema.pages.map(({ pageType }) => pageType)).toEqual([
    "questions",
    "questions",
    "check-answers",
    "declaration",
    "confirmation",
  ]);
  expect(schema.pages.slice(1).map(({ stepId }) => stepId)).toEqual([
    "declaration-2",
    "check-your-answers",
    "declaration",
    "submission-confirmation",
  ]);
  expect(schema.pages[3]!.blocks[0]).toMatchObject({
    type: "question",
    fieldId: "declaration-confirmed",
  });
});

test("only the first page of each reserved type and its first declaration input get fixed IDs", () => {
  const editor = newEditor();
  run(editor, () => {
    const [first, second] = [$declaration(), $declaration()];
    const checks = [$checkAnswers(), $checkAnswers()];
    const thanks = [$confirmation(), $confirmation()];
    const extraInput = $setSettings($createInputNode(), { fieldId: "extra-answer" });
    $getRoot().append(
      $createFormTitleNode(),
      ...checks,
      ...first,
      extraInput,
      ...second,
      ...thanks,
    );
    $settle();
    const ids = $ssbIds();

    for (const pages of [checks, [first[0]!, second[0]!], thanks]) {
      expect(ids.pages.get(pages[0]!.getKey())?.fixed).toBe(true);
      expect(ids.pages.get(pages[1]!.getKey())?.fixed).toBeUndefined();
      expect(ids.pages.get(pages[1]!.getKey())?.id).not.toBe(ids.pages.get(pages[0]!.getKey())?.id);
    }

    expect(ids.fields.get($questionKey(first[2]!))?.fixed).toBe(true);
    expect(ids.fields.get($questionKey(extraInput))).toEqual({ id: "extra-answer", pinned: true });
    expect(ids.fields.get($questionKey(second[2]!))?.fixed).toBeUndefined();
  });
});

test("special pages cannot also be confirmation pages, and the form title stays a question page", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $setSettings($createFormTitleNode(), {
      pageType: "declaration",
      confirmation: true,
    });

    const pages = ["check-answers", "declaration"].map((pageType) =>
      $setSettings($createWidgetNode("page-break"), { pageType, confirmation: true }),
    );

    $getRoot().append(title, ...pages);
    expect($pageType(title)).toBe("questions");

    for (const page of pages) expect($canBeConfirmationPage(page)).toBe(false);
    $normalizePages($getRoot());

    for (const page of pages) expect($settings(page).confirmation).toBeUndefined();
    expect(pages.map($pageType)).toEqual(["check-answers", "declaration"]);
  });
});

test("page button data includes empty check answers, Submit on declaration and Previous after page one", () => {
  const editor = newEditor();
  run(editor, $demo);
  const buttons = editor.getEditorState().read($pageButtons, { editor: editor });
  expect(buttons.map(({ pageId, label, previous }) => [pageId.id, label, previous])).toEqual([
    ["tell-us-about-the-event", "Continue", false],
    ["road-closure", "Continue", true],
    ["sound-systems", "Continue", true],
    ["check-your-answers", "Continue", true],
    ["declaration", "Submit", true],
  ]);
  expect(preflight(compileForm(editor.getEditorState()))).toEqual([]);
});

test("preflight requires a declaration and confirmation even when no special pages exist", () => {
  const editor = newEditor();
  run(editor, () => $getRoot().append($createFormTitleNode(), $createInputNode()));
  const issues = preflight(compileForm(editor.getEditorState()));
  expect(issues.map(({ code }) => code).sort()).toEqual(["no-confirmation", "no-declaration"]);
  expect(issues.find(({ code }) => code === "no-confirmation")?.message).toBe(
    "Add a confirmation page: SSB ends every form with one",
  );
  expect(issues.find(({ code }) => code === "no-declaration")?.message).toBe(
    "Add a declaration page before the confirmation page",
  );
});

test("preflight rejects any authored check-answers block", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $checkAnswers(),
      $createParagraphNode(),
      ...$declaration(),
      $confirmation(),
    ),
  );
  expect(preflight(compileForm(editor.getEditorState())).map(({ code }) => code)).toEqual([
    "check-answers-content",
  ]);
});

test("preflight accepts a required declaration checkbox with optional hint paragraphs and rejects invalid content", () => {
  const cases: [string, () => LexicalNode[], boolean][] = [
    ["title and checkbox", () => [$createQuestionNode(), $checkbox()], true],
    [
      "hint paragraphs",
      () => [
        $createQuestionNode(),
        $createParagraphNode(),
        $createParagraphNode().append($createTextNode("Read before submitting")),
        $checkbox(),
      ],
      true,
    ],
    ["no question", () => [], false],
    ["no title", () => [$checkbox()], false],
    [
      "not required",
      () => [$createQuestionNode(), $setSettings($checkbox(), { required: false })],
      false,
    ],
    [
      "radio",
      () => [
        $createQuestionNode(),
        $setSettings($createOptionNode("multiple-choice"), { required: true }),
      ],
      false,
    ],
    ["two checkboxes", () => [$createQuestionNode(), $checkbox(), $checkbox()], false],
    ["heading hint", () => [$createQuestionNode(), $createHeadingNode("h2"), $checkbox()], false],
    ["extra text", () => [$createQuestionNode(), $checkbox(), $createParagraphNode()], false],
    [
      "extra logic",
      () => [$createQuestionNode(), $checkbox(), $createWidgetNode("conditional-logic")],
      false,
    ],
    [
      "extra question",
      () => [$createQuestionNode(), $checkbox(), $createQuestionNode(), $createInputNode()],
      false,
    ],
  ];

  for (const [name, $content, valid] of cases) {
    const editor = newEditor();
    run(editor, () =>
      $getRoot().append(
        $createFormTitleNode(),
        $setSettings($createWidgetNode("page-break"), { pageType: "declaration" }),
        ...$content(),
        $confirmation(),
      ),
    );
    const issues = preflight(compileForm(editor.getEditorState()));
    expect(
      issues.some(({ code }) => code === "declaration-content"),
      name,
    ).toBe(!valid);

    if (valid) expect(issues, name).toEqual([]);
  }
});

test("preflight checks the final page order with optional check answers and flags duplicate special pages", () => {
  const cases: [string[], boolean][] = [
    [["check-answers", "declaration", "confirmation"], true],
    [["declaration", "confirmation"], true],
    [["declaration", "check-answers", "confirmation"], false],
    [["check-answers", "questions", "declaration", "confirmation"], false],
    [["declaration", "questions", "confirmation"], false],
    [["declaration", "confirmation", "questions"], false],
  ];

  for (const [types, valid] of cases) {
    const editor = newEditor();
    run(editor, () => {
      $getRoot().append($createFormTitleNode());

      for (const type of types)
        $getRoot().append(
          ...(type === "declaration"
            ? $declaration()
            : [
                type === "check-answers"
                  ? $checkAnswers()
                  : type === "confirmation"
                    ? $confirmation()
                    : $createWidgetNode("page-break"),
              ]),
        );
    });
    const issues = preflight(compileForm(editor.getEditorState()));
    expect(
      issues.some(({ code }) => code === "page-order"),
      types.join(", "),
    ).toBe(!valid);

    if (valid) expect(issues).toEqual([]);
  }

  for (const id of ["CHECK_ANSWERS_PAGE", "DECLARATION_PAGE"]) {
    const editor = newEditor();
    run(editor, () =>
      $getRoot().append(
        $createFormTitleNode(),
        ...entry(id).create(),
        $checkAnswers(),
        ...$declaration(),
        $confirmation(),
      ),
    );
    expect(
      preflight(compileForm(editor.getEditorState())).some(
        ({ code }) => code === "duplicate-page-type",
      ),
      id,
    ).toBe(true);
  }
});

test("check-answers preview uses prior question pages, title and label fallbacks, and visible questions only", () => {
  const editor = newEditor();
  run(editor, () => {
    const check = $checkAnswers();
    $getRoot().append(
      $setSettings($createFormTitleNode(), { name: "About you" }),
      $createQuestionNode().append($createTextNode("Full name")),
      $createInputNode(),
      $createParagraphNode().append($createTextNode("Guidance")),
      $createWidgetNode("conditional-logic"),
      $createWidgetNode("calculated-fields"),
      $createQuestionNode().append($createTextNode("Hidden answer")),
      $setSettings($createInputNode(), { hidden: true }),
      $createWidgetNode("page-break"),
      $createHeadingNode("h2").append($createTextNode("Contact details")),
      $setSettings($createInputNode(), { name: "Phone" }),
      $createInputNode("email"),
      $createQuestionNode().append($createTextNode("Permission")),
      $setSettings($createOptionNode(), { hidden: true }),
      $createOptionNode(),
      $createWidgetNode("page-break"),
      ...$declaration(),
      check,
      $setSettings($createWidgetNode("page-break"), { name: "Later questions" }),
      $createInputNode(),
      $confirmation(),
    );
    const preview = $pagePreview(check);
    expect(
      preview.sections.map(({ title, rows }) => ({
        title,
        labels: rows.map(({ label }) => label),
      })),
    ).toEqual([
      { title: "About you", labels: ["Full name"] },
      {
        title: "Contact details",
        labels: ["Phone", "Unlabelled email address input", "Permission"],
      },
      { title: "Page 3", labels: [] },
    ]);
  });
});

test("declaration preview matches effective first, middle and last name IDs and needs a first or last name", () => {
  for (const ids of [
    [],
    ["other-names"],
    ["FIRST_NAME", "parent-middle-names", "Your_Last_Name"],
    ["applicant-lastname"],
    ["first-name"],
  ]) {
    const editor = newEditor();
    run(editor, () => {
      $getRoot().append($createFormTitleNode());

      for (const [index, fieldId] of ids.entries())
        $getRoot().append(
          $createQuestionNode().append($createTextNode(`Name ${index + 1}`)),
          $setSettings($createInputNode(), { fieldId }),
        );
      const [declaration, title, checkbox] = $declaration();
      $setSettings(checkbox!, { fieldId: "first-name" });
      $getRoot().append(declaration!, title!, checkbox!, $confirmation());
      $settle();
      expect($pagePreview(declaration!).applicant).toBe(
        ids.length === 3
          ? "[Name 1] [Name 2] [Name 3]"
          : ids[0] === "applicant-lastname" || ids[0] === "first-name"
            ? "[Name 1]"
            : "",
      );
    });
  }
});

test("gap warnings explain authored review content, declaration shape and page order", () => {
  const editor = newEditor();
  run(editor, () => {
    const [declaration, title, checkbox] = $declaration();
    const check = $checkAnswers();
    $getRoot().append(
      $createFormTitleNode(),
      declaration!,
      title!,
      checkbox!,
      $createParagraphNode(),
      check,
      $createParagraphNode(),
      $confirmation(),
    );
    expect($pagePreview(declaration!).warnings).toEqual([
      "Only the declaration checkbox belongs here",
      "The declaration goes just before the confirmation page",
    ]);
    expect($pagePreview(check).warnings).toEqual([
      "This page summarizes answers from the form",
      "Check answers goes before the declaration",
    ]);
  });
  run(editor, () => {
    $getRoot()
      .clear()
      .append($createFormTitleNode(), $checkAnswers(), ...$declaration(), $confirmation());

    for (const page of $getRoot().getChildren().filter($isPageBreak))
      expect($pagePreview(page).warnings).toEqual([]);
  });
});
