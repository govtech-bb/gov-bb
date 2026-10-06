import { createEditor, rulesFor } from "../helpers/default-form";
import { legacyFieldAdapter } from "../../src/forms/editor/legacy-mappings";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
} from "lexical";
import { $enter } from "../../src/forms/editor/structure/editing";
import { compileForm, type FormQuestion, type FormSchema } from "../helpers/default-form";
import { $describe } from "../../src/forms/react/gutter";
import { $fields } from "../../src/forms/features/logic/queries";
import { $mentionTargets } from "../../src/forms/features/mentions/editor";
import {
  $blockKind,
  $createFormTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createLongAnswerNode,
  $createOptionNode,
  choiceKinds,
} from "../../src/forms/editor/answer-nodes";
import { $setSettings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { type Settings } from "../../src/editor/core/settings";

const newEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (e) => {
      throw e;
    },
  });

const run = (editor: ReturnType<typeof newEditor>, fn: () => void) =>
  editor.update(
    () => {
      fn();
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
    },
    { discrete: true },
  );

const questions = (schema: FormSchema): FormQuestion[] =>
  schema.pages.flatMap((page) => page.blocks.filter((block) => block.type === "question"));

const inputKinds = govbbFormEditor.fields
  .filter((field) => field.source.storage.type === "input")
  .map((field) => field.kind);

const legacyDrawnInputs = [
  ...govbbFormEditor.fields
    .filter(legacyFieldAdapter)
    .filter((field) => field.source.storage.type === "input")
    .map((field) => () => $createInputNode(field.kind)),
  $createLongAnswerNode,
];

const drawnInputs = [
  ...inputKinds.map((kind) => () => $createInputNode(kind)),
  $createLongAnswerNode,
];

test("typing in short and long answers and the other drawn inputs leaves their slots empty", () => {
  for (const $make of drawnInputs) {
    const editor = newEditor();
    run(editor, () => {
      const input = $make();
      $getRoot().append($createFormTitleNode(), input);
      input.selectStart().insertText("A typed placeholder");
    });
    editor
      .getEditorState()
      .read(() => expect($getRoot().getLastChild()!.getTextContent()).toBe(""), { editor: editor });
  }
});

test("loading a saved draft clears old placeholder text from every drawn input", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append($createFormTitleNode(), ...drawnInputs.map(($make) => $make())),
  );
  const draft = editor.getEditorState().toJSON();

  const text = {
    type: "text",
    version: 1,
    text: "Saved placeholder",
    format: 0,
    detail: 0,
    mode: "normal",
    style: "",
  };

  // Seed the saved JSON itself: a normal update would already have cleared this text.
  for (const block of draft.root.children.slice(1)) Object.assign(block, { children: [text] });
  editor.setEditorState(editor.parseEditorState(draft));
  editor.getEditorState().read(
    () =>
      expect(
        $getRoot()
          .getChildren()
          .slice(1)
          .map((node) => node.getTextContent()),
      ).toEqual(drawnInputs.map(() => "")),
    { editor: editor },
  );
});

test("compilation ignores old input text and keeps only Dropdown's prompt", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      ...legacyDrawnInputs.map(($make) => $setSettings($make(), { placeholder: "Old prompt" })),
      ...choiceKinds.map((kind) =>
        $setSettings($createOptionNode(kind), { placeholder: "Select a parish" }).append(
          $createTextNode("Christ Church"),
        ),
      ),
    ),
  );
  const draft = editor.getEditorState().toJSON();

  const text = {
    type: "text",
    version: 1,
    text: "Saved placeholder",
    format: 0,
    detail: 0,
    mode: "normal",
    style: "",
  };

  for (const block of draft.root.children.slice(1, 1 + legacyDrawnInputs.length))
    Object.assign(block, { children: [text] });
  // Compile before hydration too: stale text must never become a respondent's placeholder.
  const fields = questions(compileForm(editor.parseEditorState(draft)));
  expect(fields.map((field) => field.placeholder)).toEqual([
    ...legacyDrawnInputs.map(() => ""),
    "",
    "",
    "Select a parish",
  ]);
  expect(fields.at(-1)!.options[0]!.label).toBe("Christ Church");
});

test("compiled questions drop removed settings and preserve the supported defaults and limits", () => {
  const editor = newEditor();

  const removed: Settings = {
    randomize: true,
    lockInPlace: true,
    allowMultiple: true,
    format: "CURRENCY",
    prefix: "$",
    suffix: "BBD",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    internationalFormat: true,
    defaultCountryCode: "BB",
    disableDays: ["Saturday"],
    startWeekOn: "Sunday",
    specificDates: ["2026-10-03"],
  };

  const defaults = { hasDefaultAnswer: true, defaultAnswer: "Kept default" };
  const today = { field: "utility::today()" };
  const limits = { hasMinChoices: true, minChoices: 2, hasMaxChoices: true, maxChoices: 3 };
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      ...legacyDrawnInputs.map(($make) => {
        const input = $make();

        return $setSettings(input, {
          ...removed,
          ...defaults,
          required: true,
          defaultAnswer: $blockKind(input) === "date" ? today : defaults.defaultAnswer,
        });
      }),
      ...choiceKinds.map((kind) =>
        $setSettings($createOptionNode(kind), {
          ...removed,
          ...defaults,
          ...limits,
          hasOtherOption: true,
        }).append($createTextNode("Other")),
      ),
    ),
  );
  const fields = questions(compileForm(editor.getEditorState()));

  for (const field of fields)
    for (const key of Object.keys(removed)) expect(field.settings[key]).toBeUndefined();

  for (const field of fields.slice(0, legacyDrawnInputs.length)) {
    expect(field.settings.hasDefaultAnswer).toBe(true);
    expect(field.settings.defaultAnswer).toEqual(
      field.kind === "date" ? today : defaults.defaultAnswer,
    );
    expect(field.settings.required).toBe(true);
  }

  for (const field of fields.slice(legacyDrawnInputs.length)) {
    expect(field.settings.hasDefaultAnswer).toBeUndefined();
    expect(field.settings.defaultAnswer).toBeUndefined();
    expect(field.settings.hasOtherOption).toBe(true);

    for (const [key, value] of Object.entries(limits))
      expect(field.settings[key]).toBe(field.kind === "checkboxes" ? value : undefined);
  }
});

test("dates retain Before, After and Date range limits when obsolete calendar settings are dropped", () => {
  const editor = newEditor();

  const limits = [
    { beforeDate: "2026-10-10" },
    { afterDate: "2026-10-01" },
    { dateRange: { from: "2026-10-01", to: "2026-10-10" } },
  ];

  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      ...limits.map((limit) =>
        $setSettings($createInputNode("date"), {
          ...limit,
          format: "MM/DD/YYYY",
          specificDates: ["2026-10-03"],
        }),
      ),
    ),
  );

  for (const [i, field] of questions(compileForm(editor.getEditorState())).entries()) {
    expect(field.settings).toMatchObject(limits[i]!);
    expect(field.settings.format).toBeUndefined();
    expect(field.settings.specificDates).toBeUndefined();
  }
});

test("old Multiple selection settings give radios and Dropdown no min or max selection rule", () => {
  const settings = {
    allowMultiple: true,
    hasMinChoices: true,
    minChoices: 2,
    hasMaxChoices: true,
    maxChoices: 3,
  };

  for (const kind of ["multiple-choice", "dropdown"])
    expect(rulesFor(kind, settings, 3)).toEqual([]);
  expect(rulesFor("checkboxes", settings, 3).map(({ rule }) => rule)).toEqual([
    "minSelection",
    "maxSelection",
  ]);
});

test("stray input text cannot name a field in its menu, logic or mentions", () => {
  const editor = newEditor();
  run(editor, () => {
    const input = $createInputNode().append($createTextNode("Stray placeholder"));
    $getRoot().append($createFormTitleNode(), input);
    $ensureBlockIds($getRoot());
    $ensureQuestionFields($getRoot());
    expect($describe(input.getKey())!.menu.header).toMatchObject({
      name: "Unlabelled text input",
    });
    expect($fields()[0]!.title).toBe("Unlabelled text input");
    expect($mentionTargets().get($questionKey(input))).toBe("@Unlabelled text input");
    input.insertBefore($createQuestionNode().append($createTextNode("Event name")));
    expect($describe(input.getKey())!.menu.header!.name).toBe("Event name");
    $setSettings(input, { name: "Applicant's event" });
    expect($describe(input.getKey())!.menu.header!.name).toBe("Event name");
    expect($fields()[0]!.title).toBe("Event name");
    expect($mentionTargets().get($questionKey(input))).toBe("@Event name");
  });
});

test("logic treats only Checkboxes as multiple and keeps Dropdown's prompt as its untitled name", () => {
  const editor = newEditor();
  run(editor, () => {
    const options = choiceKinds.map((kind) =>
      $setSettings($createOptionNode(kind), {
        allowMultiple: true,
        placeholder: "Select a parish",
      }).append($createTextNode("Christ Church")),
    );

    $getRoot().append($createFormTitleNode(), ...options);
    $ensureBlockIds($getRoot());
    $ensureQuestionFields($getRoot());
    expect($fields().map(({ kind, multiple }) => [kind, multiple])).toEqual([
      ["checkboxes", true],
      ["multiple-choice", false],
      ["dropdown", false],
    ]);
    expect($describe(options[2]!.getKey())!.menu.header!.name).toBe("Select a parish");
    expect($fields()[2]!.title).toBe("Select a parish");
  });
});

test("Enter in an empty hidden input slot makes a text line after its box", () => {
  for (const $make of drawnInputs) {
    const editor = newEditor();
    run(editor, () => {
      const input = $make();
      $getRoot().append($createFormTitleNode(), input);
      input.selectStart();
      expect($enter()).toBe(false);
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) throw new Error("Expected the input's caret");
      selection.insertParagraph();
      expect($getRoot().getChildAtIndex(1)!.is(input)).toBe(true);
      expect($isParagraphNode(input.getNextSibling())).toBe(true);
      expect($getRoot().getChildrenSize()).toBe(3);
    });
  }
});
