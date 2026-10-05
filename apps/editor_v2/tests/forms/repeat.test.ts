import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
} from "lexical";
import { $insertBlocks } from "../../src/forms/editor/insertion";
import { pageEntries } from "../../src/forms/features/pages/insertion";
import {
  compileForm,
  preflight,
  type FormQuestion,
  type FormSchema,
} from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { $pageButtons } from "../../src/forms/features/pages/buttons";
import { $describe } from "../../src/forms/react/gutter";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $blockKind,
  $createFormTitleNode,
  $createQuestionNode,
  $deepCopy,
  $ensureBlockIds,
  $ensureQuestionFields,
  $isPageBreak,
  $pageType,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createLongAnswerNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { type Setting } from "../../src/editor/core/settings";
import {
  $fieldArrayDrawingOf,
  $labelOf,
  $pageBehaviours,
  $pageRepeat,
  $questionBehaviours,
  $repeatEnd,
} from "../../src/forms/features/repetition/queries";
import {
  autoAddAnother,
  autoQuestion,
  boundsError,
  DEFAULT_FIELD_ARRAY,
  DEFAULT_REPEATABLE,
  entriesText,
  fieldArrayDrawing,
  fieldArrayOf,
  instanceMarker,
  phrase,
  repeatableOf,
  repeatSummary,
  toSettings,
  withText,
} from "../../src/forms/core/repetition";
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

const questions = (schema: FormSchema): FormQuestion[] =>
  schema.pages.flatMap((page) => page.blocks.filter((block) => block.type === "question"));

test("repeat readers clamp finite bounds, reject other shapes and omit blank labels", () => {
  const invalid: Setting[] = [
    null,
    "repeat",
    [],
    { min: "1", max: 5 },
    { min: 1 },
    { min: NaN, max: 5 },
    { min: 1, max: Infinity },
  ];

  for (const read of [repeatableOf, fieldArrayOf]) {
    const settings = (value: Setting) => ({ repeatable: value, fieldArray: value });
    expect(read(settings({ min: 0, max: 0 }))).toEqual({ min: 1, max: 1 });
    expect(read(settings({ min: 2.7, max: 9.2 }))).toEqual({ min: 2, max: 9 });
    expect(read(settings({ min: 3, max: 1 }))).toEqual({ min: 3, max: 3 });

    for (const value of invalid) expect(read(settings(value))).toBeUndefined();
    expect(read(settings({ min: 1, max: 5, addAnotherLabel: "  ", instanceLabel: "" }))).toEqual({
      min: 1,
      max: 5,
    });
  }

  expect(
    repeatableOf({
      repeatable: { min: 1, max: 5, addAnotherLabel: "Another?", instanceLabel: "Child" },
    }),
  ).toEqual({ min: 1, max: 5, addAnotherLabel: "Another?", instanceLabel: "Child" });
  expect(fieldArrayOf({ fieldArray: { min: 1, max: 4, instanceLabel: "Child" } })).toEqual({
    min: 1,
    max: 4,
  });
});

test("repeat writes keep plain settings without absent or blank labels", () => {
  expect(toSettings(undefined)).toBeUndefined();
  expect(toSettings({ min: 1, max: 5, addAnotherLabel: "", instanceLabel: undefined })).toEqual(
    DEFAULT_REPEATABLE,
  );
  const value = { ...DEFAULT_REPEATABLE, instanceLabel: "Child" };
  expect(withText(value, "addAnotherLabel", "Another child?")).toEqual({
    ...value,
    addAnotherLabel: "Another child?",
  });
  expect(withText(value, "instanceLabel", " \n ")).toEqual(DEFAULT_REPEATABLE);
  expect(value.instanceLabel).toBe("Child");
});

test("auto repeat text keeps initials and uses neutral text for questions or missing labels", () => {
  expect(phrase(" Sound system: ")).toBe("sound system");
  expect(phrase("NIS card?")).toBe("NIS card");
  expect(autoQuestion("Sound system")).toBe("Do you need to add another sound system?");
  expect(autoQuestion("NIS card")).toBe("Do you need to add another NIS card?");
  expect(autoQuestion()).toBe("Add another?");
  expect(autoQuestion("  ")).toBe("Add another?");
  expect(autoAddAnother("Telephone number")).toBe("Add another telephone number");
  expect(autoAddAnother("Which roads?")).toBe("Add another");
  expect(autoAddAnother("")).toBe("Add another");
});

test("repeat markers and summaries describe the saved entry totals", () => {
  expect(instanceMarker({ ...DEFAULT_REPEATABLE, instanceLabel: "Child" }, 2)).toBe("Child 2");
  expect(instanceMarker(DEFAULT_REPEATABLE, 2)).toBe("2");
  expect(repeatSummary(DEFAULT_REPEATABLE)).toBe("Repeats · up to 5 entries");
  expect(repeatSummary({ min: 2, max: 5, instanceLabel: "Child" })).toBe(
    "Repeats · 2 to 5 entries · Child",
  );
  expect(repeatSummary({ min: 3, max: 3 })).toBe("Repeats · 3 entries");
  expect(entriesText({ min: 1, max: 1 })).toBe("1 entry");
});

test("bounds messages follow their priority, with a whole-number minimum and a cap", () => {
  const cases: [number, number, string | null][] = [
    [NaN, 0, "Enter a whole number"],
    [0, 1.5, "Enter a whole number"],
    [1, Infinity, "Enter a whole number"],
    [0, 0, "Start with 1 or more"],
    [-1, 501, "Start with 1 or more"],
    [1, 1, "Allow 2 or more"],
    [3, 1, "Allow 2 or more"],
    [3, 2, "Allow at least as many as you start with"],
    [502, 501, "Allow at least as many as you start with"],
    [1, 501, "SSB takes up to 500"],
    [1, 5, null],
    [2, 2, null],
    [500, 500, null],
  ];

  for (const [min, max, expected] of cases)
    expect(boundsError(min, max), `${min}, ${max}`).toBe(expected);
});

test("repeated answer drawings show numbered legends, only a visible last Remove and the effective Add text", () => {
  expect(fieldArrayDrawing("Telephone number", DEFAULT_FIELD_ARRAY)).toEqual({
    legends: ["Telephone number 1"],
    remove: false,
    add: "Add another telephone number",
  });
  expect(fieldArrayDrawing("Telephone number", { min: 2, max: 4 })).toEqual({
    legends: ["Telephone number 1 of 2", "Telephone number 2 of 2"],
    remove: true,
    add: "Add another telephone number",
  });
  expect(fieldArrayDrawing("Telephone number", { min: 5, max: 5 })).toEqual({
    legends: ["Telephone number 1 of 5", "Telephone number 2 of 5", "Telephone number 3 of 5"],
    remove: false,
  });
  expect(
    fieldArrayDrawing("Email", { min: 3, max: 4, addAnotherLabel: "Another address" }),
  ).toEqual({
    legends: ["Email 1 of 3", "Email 2 of 3", "Email 3 of 3"],
    remove: true,
    add: "Another address",
  });
});

test("the demo compiles only its sound-system page and speaker-brand answer behaviours and passes preflight", () => {
  const editor = newEditor();
  run(editor, $demo);
  const schema = compileForm(editor.getEditorState());
  expect(schema.pages[2]!.behaviours).toEqual([
    {
      type: "repeatable",
      min: 1,
      max: 5,
      addAnotherLabel: "Do you need to add another sound system?",
      instanceLabel: "Sound system",
    },
  ]);

  for (const page of schema.pages.filter((_, i) => i !== 2))
    expect(page).not.toHaveProperty("behaviours");
  const fields = questions(schema);
  const brand = fields.find((field) => field.fieldId === "speaker-brand")!;
  expect(brand.behaviours).toEqual([
    { type: "fieldArray", min: 1, max: 4, addAnotherLabel: "Add another speaker brand" },
  ]);
  expect(brand.settings.fieldArray).toEqual(DEFAULT_FIELD_ARRAY);

  for (const field of fields.filter((field) => field !== brand))
    expect(field).not.toHaveProperty("behaviours");
  expect(preflight(schema)).toEqual([]);
});

test("repeatable counts on page one and question pages, and is ignored on every special page", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $setSettings($createFormTitleNode(), {
      repeatable: toSettings(DEFAULT_REPEATABLE),
    });

    $getRoot().append(title, $createInputNode());
    expect($pageRepeat(title)).toEqual({ value: DEFAULT_REPEATABLE, question: "Add another?" });

    for (const type of ["check-answers", "declaration", "confirmation"]) {
      const page = $setSettings($createWidgetNode("page-break"), {
        ...(type === "confirmation" ? { confirmation: true } : { pageType: type }),
        repeatable: toSettings(DEFAULT_REPEATABLE),
      });

      $getRoot().append(page);
      expect($pageRepeat(page)).toBeUndefined();
      expect($pageBehaviours(page)).toBeUndefined();
      expect($settings(page).repeatable).toEqual(DEFAULT_REPEATABLE);
    }

    expect($pageRepeat($getRoot().getChildren()[1]!)).toBeUndefined();
  });
  const schema = compileForm(editor.getEditorState());
  expect(schema.pages[0]!.behaviours).toEqual([
    { type: "repeatable", min: 1, max: 5, addAnotherLabel: "Add another?" },
  ]);

  for (const page of schema.pages.slice(1)) expect(page).not.toHaveProperty("behaviours");
});

test("field arrays count only on supported kinds, use label fallbacks and keep a pinned button", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append($createFormTitleNode());

    const inputs = [
      $createInputNode(),
      $createLongAnswerNode(),
      $createInputNode("number"),
      $createInputNode("email"),
      $createInputNode("phone"),
      $createInputNode("time"),
      $createInputNode("date"),
      $createOptionNode("dropdown"),
      $createWidgetNode("file-upload"),
    ];

    for (const input of inputs) {
      $setSettings(input, { fieldArray: toSettings(DEFAULT_FIELD_ARRAY) });
      $getRoot().append(input);
      const supported = !["date", "dropdown", "file-upload"].includes($blockKind(input));
      expect(!!$questionBehaviours(input)).toBe(supported);
      expect(!!$fieldArrayDrawingOf(input)).toBe(supported);
    }

    const email = inputs[3]!;
    expect($labelOf(email)).toBe("Email address");
    $setSettings(email, { name: "Contact email" });
    expect($labelOf(email)).toBe("Contact email");
    email.insertBefore($createQuestionNode().append($createTextNode("Your email")));
    expect($labelOf(email)).toBe("Your email");
    $setSettings(email, {
      fieldArray: toSettings({ ...DEFAULT_FIELD_ARRAY, addAnotherLabel: "Another address" }),
    });
    expect($questionBehaviours(email)?.[0]?.addAnotherLabel).toBe("Another address");
  });
  const fields = questions(compileForm(editor.getEditorState()));
  expect(fields.find((field) => field.kind === "email")?.behaviours?.[0]?.addAnotherLabel).toBe(
    "Another address",
  );
  expect(fields.find((field) => field.kind === "dropdown")).not.toHaveProperty("behaviours");
});

test("page questions use pinned text and fixed totals compile without an add-another label", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $setSettings($createFormTitleNode(), {
      repeatable: toSettings({
        ...DEFAULT_REPEATABLE,
        instanceLabel: "Child",
        addAnotherLabel: "Any more children?",
      }),
    });

    const input = $setSettings($createInputNode(), {
      fieldArray: toSettings({ min: 2, max: 2, addAnotherLabel: "Another answer" }),
    });

    $getRoot().append(title, input);
    expect($pageRepeat(title)?.question).toBe("Any more children?");
    expect($pageBehaviours(title)?.[0]?.addAnotherLabel).toBe("Any more children?");
    $setSettings(title, {
      repeatable: toSettings({
        min: 2,
        max: 2,
        instanceLabel: "Child",
        addAnotherLabel: "Any more children?",
      }),
    });
    expect($pageBehaviours(title)).toEqual([
      { type: "repeatable", min: 2, max: 2, instanceLabel: "Child" },
    ]);
    expect($questionBehaviours(input)).toEqual([{ type: "fieldArray", min: 2, max: 2 }]);
    expect($repeatEnd(title)).toEqual({ caption: "SSB repeats this page · 2 entries" });
  });
});

test("repeat previews reserve precisely the preceding button's room and disappear when folded", () => {
  const editor = newEditor();
  run(editor, $demo);
  let soundKey = "";
  editor.getEditorState().read(
    () => {
      const buttons = $pageButtons();
      const sound = buttons.find((button) => button.pageId.id === "sound-systems")!;
      soundKey = sound.key;
      expect(sound.repeatEnd).toEqual({
        caption: "Preview · up to 5 entries",
        question: "Do you need to add another sound system?",
      });

      for (const button of buttons) {
        if (!button.before) continue;
        const next = $getNodeByKey(button.before)!;
        expect($isPageBreak(next)).toBe(true);
        expect($pagePreview(next).repeatRoom).toEqual(button.repeatEnd ?? null);
      }
    },
    { editor: editor },
  );
  run(editor, () => $setSettings($getNodeByKey(soundKey)!, { folded: true }));
  editor.getEditorState().read(
    () => {
      expect($pageButtons().some((button) => button.pageId.id === "sound-systems")).toBe(false);
      const sound = $getNodeByKey(soundKey)!;
      expect($repeatEnd(sound)).toBeNull();

      const check = $getRoot()
        .getChildren()
        .find((node) => $pageType(node) === "check-answers")!;

      expect($pagePreview(check).repeatRoom).toBeNull();
      expect($pageBehaviours(sound)).toHaveLength(1);
    },
    { editor: editor },
  );
});

test("gaps identify repeats and check answers draws the second entry marker, including text-only repeating pages", () => {
  const editor = newEditor();
  run(editor, $demo);
  editor.getEditorState().read(
    () => {
      const sound = $getRoot()
        .getChildren()
        .find((node) => $isPageBreak(node) && $pagePreview(node).typedTitle === "Sound systems")!;

      expect($pagePreview(sound)).toMatchObject({
        repeatChip: "Repeats · up to 5 entries · Sound system",
        qualified: false,
      });

      const check = $getRoot()
        .getChildren()
        .find((node) => $pageType(node) === "check-answers")!;

      expect($pagePreview(check).sections[2]).toMatchObject({
        title: "Sound systems",
        repeat: "Sound system 2",
      });
    },
    { editor: editor },
  );
  run(editor, () => {
    const page = $setSettings($createWidgetNode("page-break"), {
      repeatable: toSettings(DEFAULT_REPEATABLE),
    });

    $getRoot()
      .clear()
      .append(
        $createFormTitleNode(),
        page,
        $createParagraphNode().append($createTextNode("Guidance")),
      );
    expect($pagePreview(page).qualified).toBe(false);
    expect($repeatEnd(page)?.question).toBe("Add another?");
    page.getNextSibling()!.remove();
    expect($repeatEnd(page)).toBeNull();
  });
});

test("block menus offer repeats only for eligible inputs", () => {
  const editor = newEditor();
  run(editor, () => {
    const road = $setSettings($createInputNode(), { fieldArray: toSettings(DEFAULT_REPEATABLE) });

    const others = [
      $createInputNode("date"),
      $createOptionNode("dropdown"),
      $createWidgetNode("file-upload"),
    ];

    $getRoot().append(
      $createFormTitleNode(),
      $createQuestionNode().append($createTextNode("Road name")),
      road,
      ...others,
    );
    $settle();
    expect($describe(road.getKey())?.menu.fieldArray).toEqual({
      value: { min: 1, max: 5 },
      auto: "Add another road name",
    });

    for (const input of others) expect($describe(input.getKey())?.menu.fieldArray).toBeUndefined();
  });
});

test("the repeating-page catalog entry creates defaults and leaves the caret in a new text line", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $createFormTitleNode();
    $getRoot().append(title);
    const entry = pageEntries.find((entry) => entry.id === "REPEATING_PAGE")!;
    const [page] = entry.create();
    expect($isPageBreak(page)).toBe(true);
    expect($settings(page!)).toEqual({ repeatable: DEFAULT_REPEATABLE });
    $insertBlocks([page!], title);
    const next = page!.getNextSibling();
    expect($isParagraphNode(next)).toBe(true);
    const selection = $getSelection();
    expect(
      $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.getNode().is(next),
    ).toBe(true);
  });
});

test("repeat configuration survives duplicate helpers and serialized editor state", () => {
  const editor = newEditor();
  run(editor, () => {
    const page = $setSettings($createWidgetNode("page-break"), {
      repeatable: toSettings({ ...DEFAULT_REPEATABLE, instanceLabel: "Child" }),
    });

    const input = $setSettings($createInputNode("email"), {
      fieldArray: toSettings({ ...DEFAULT_FIELD_ARRAY, addAnotherLabel: "Another address" }),
    });

    $getRoot().append($createFormTitleNode(), page, input);
    expect($settings($deepCopy(page)).repeatable).toEqual($settings(page).repeatable);
    expect($settings($deepCopy(input)).fieldArray).toEqual($settings(input).fieldArray);
  });
  const restored = newEditor();
  restored.setEditorState(
    restored.parseEditorState(JSON.stringify(editor.getEditorState().toJSON())),
  );
  expect(compileForm(restored.getEditorState())).toEqual(compileForm(editor.getEditorState()));
});

test("preflight checks repeat types, empty pages and bounds in page and question order", () => {
  const editor = newEditor();
  run(editor, $demo);
  const schema = compileForm(editor.getEditorState());
  const road = questions(schema).find((field) => field.fieldId === "which-roads")!;
  road.kind = "date";
  road.behaviours = [{ type: "fieldArray", min: 2, max: 1 }];
  const sound = schema.pages[2]!;
  sound.behaviours![0]!.min = 0;
  sound.blocks = [];
  const check = schema.pages.find((page) => page.pageType === "check-answers")!;
  check.behaviours = [{ type: "repeatable", ...DEFAULT_REPEATABLE }];
  expect(preflight(schema)).toEqual([
    {
      code: "field-array-kind",
      message:
        "Answer more than once is available for Text input, Textarea, Number, Email address, Phone number and Time",
      where: road.id,
    },
    {
      code: "repeat-bounds",
      message: "Start with 1 or more, and allow at least as many as you start with",
      where: road.id,
    },
    {
      code: "repeat-empty",
      message: "A repeating page needs a question for people to answer",
      where: sound.id,
    },
    {
      code: "repeat-bounds",
      message: "Start with 1 or more, and allow at least as many as you start with",
      where: sound.id,
    },
    { code: "repeat-page-type", message: "Only question pages can repeat", where: check.id },
    {
      code: "repeat-empty",
      message: "A repeating page needs a question for people to answer",
      where: check.id,
    },
  ]);
});
