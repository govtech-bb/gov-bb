import {
  nativeQuestions,
  nativeRegistryEditor,
  nativeRegistryForm,
} from "../helpers/native-registry-editor";
import { $native } from "../../src/forms/editor/native-state";
import { validateRegistryEntry } from "../../src/forms/registry/validation";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { fieldWidthOf } from "../helpers/default-form";
import { createEditor, defaultMessage, rulesFor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createTextNode, $getNodeByKey, $getRoot } from "lexical";
import { $duplicateQuestion } from "../../src/forms/editor/structure/blocks";
import { $registryBlocks as $govbbField } from "../../src/forms/editor/registry-module";
import { $insertionGroups } from "../helpers/insertion";
import { pageEntries } from "../../src/forms/features/pages/insertion";
import {
  compileForm,
  preflight,
  type FormQuestion,
  type FormSchema,
} from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $blockGroup,
  $createFormTitleNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $hintBlocks,
  $isInput,
  $isQuestionNode,
  $shareQuestionSettings,
  $turnInto,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $isOptionNode,
  type InputNode,
} from "../../src/forms/editor/answer-nodes";
import { $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { COMPONENTS } from "../../src/presets/form-registry/components";
import { FORMATS } from "../../src/forms/core/formats";
import { govbbFormRegistryEntries } from "../../src/presets/form-registry/entries";
import { registryPreviewQuestions } from "../../src/presets/form-registry/preview";

const fieldQuestions = (key: string) =>
  registryPreviewQuestions(govbbFormRegistryEntries.find((entry) => entry.key === key)!);

import { maskHelp, patternWorks, relativeDateOf } from "../../src/forms/core/field-settings";

import { type RuleName } from "../../src/forms/adapters/ssb/rules";
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

test("relative dates use SSB's rules and messages for labels and questions", () => {
  expect(rulesFor("date", { relativeDate: "past" }, 0)).toEqual([
    { rule: "past", label: "Today or later" },
  ]);
  expect(relativeDateOf({ relativeDate: "toString" })).toBeUndefined();

  const cases: [RuleName, string][] = [
    ["past", "in the past"],
    ["pastOrToday", "today or in the past"],
    ["futureOrToday", "today or in the future"],
    ["future", "in the future"],
  ];

  for (const [rule, phrase] of cases) {
    expect(defaultMessage(rule, { kind: "date", label: "Date of birth", optionCount: 0 })).toBe(
      `Date of birth must be ${phrase}`,
    );
    expect(
      defaultMessage(rule, { kind: "date", label: "When did you arrive?", optionCount: 0 }),
    ).toBe(`The date must be ${phrase}`);
  }
});

test("dates use age messages while numbers keep their limits' wording", () => {
  expect(rulesFor("date", { hasMinAge: true, minAge: 16, hasMaxAge: true, maxAge: 24 }, 0)).toEqual(
    [
      { rule: "min", label: "Younger than the minimum age", value: 16 },
      { rule: "max", label: "Older than the maximum age", value: 24 },
    ],
  );

  for (const label of ["Date of birth", "When were you born?"]) {
    expect(defaultMessage("min", { kind: "date", label, optionCount: 0, value: 16 })).toBe(
      "Age must be 16 or over",
    );
    expect(defaultMessage("max", { kind: "date", label, optionCount: 0, value: 24 })).toBe(
      "Age must be 24 or under",
    );
  }

  expect(
    defaultMessage("min", { kind: "number", label: "Event name", optionCount: 0, value: 2 }),
  ).toBe("Event name must be 2 or more");
});

test("registry formats compile as Unicode patterns and accept their expected shapes", () => {
  for (const { pattern } of Object.values(FORMATS)) expect(patternWorks(pattern)).toBe(true);
  const person = new RegExp(FORMATS.personName.pattern, "u");

  for (const name of ["O’Brien", "St. John", "J. R.", "Anne-Marie", "Le\u0302"])
    expect(person.test(name), name).toBe(true);

  for (const name of ["Smith-", "1st", " "]) expect(person.test(name), name).toBe(false);
  const nationalId = new RegExp(FORMATS.nationalId.pattern, "u");
  expect(nationalId.test("900314-0052")).toBe(true);
  expect(nationalId.test("9003140052")).toBe(false);
  const postcode = new RegExp(FORMATS.postcode.pattern, "u");
  expect(postcode.test("BB17004")).toBe(true);
  expect(postcode.test("bb 17004")).toBe(true);
  expect(postcode.test("BB1700")).toBe(false);
  expect(patternWorks("")).toBe(false);
  expect(patternWorks("[")).toBe(false);
  expect(maskHelp("999999-9999")).toBe("Input mask: 9 is a digit");
});

test("only short answers use pattern rules, with known format messages or a labelled fallback", () => {
  const pattern = FORMATS.nationalId.pattern;
  expect(rulesFor("text", { pattern }, 0)).toEqual([
    { rule: "pattern", label: "Wrong format", value: pattern },
  ]);
  expect(rulesFor("long-answer", { pattern }, 0)).toEqual([]);

  for (const [label, subject] of [
    ["First name", "First name"],
    ["What is your first name?", "Your answer"],
  ])
    expect(
      defaultMessage("pattern", {
        kind: "text",
        label: label!,
        optionCount: 0,
        value: FORMATS.personName.pattern,
      }),
    ).toBe(`${subject} must contain only letters, spaces, hyphens, apostrophes, or periods`);
  expect(
    defaultMessage("pattern", {
      kind: "text",
      label: "National ID",
      optionCount: 0,
      value: pattern,
    }),
  ).toBe("Enter a valid National ID number (for example, 900314-0052)");
  expect(
    defaultMessage("pattern", { kind: "text", label: "Event name", optionCount: 0, value: "^x$" }),
  ).toBe("Enter event name in the correct format");
});

test("field width follows the kind's default and ignores unsupported kinds", () => {
  expect(fieldWidthOf("text", {})).toBe("long");
  expect(fieldWidthOf("time", {})).toBe("short");
  expect(fieldWidthOf("dropdown", { width: "medium" })).toBe("medium");
  expect(fieldWidthOf("number", { width: "short" })).toBe("short");
  expect(fieldWidthOf("text", { width: "huge" })).toBe("long");
  expect(fieldWidthOf("date", { width: "short" })).toBeUndefined();
  expect(fieldWidthOf("multiple-choice", { width: "medium" })).toBeUndefined();
});

test("the Form registry follows Questions with 22 validated native fragments and one complete form", () => {
  const groups = newEditor().read(() => $insertionGroups(null));
  const index = groups.findIndex(([name]) => name === "Form registry");
  expect(index).toBe(groups.findIndex(([name]) => name === "Questions") + 1);
  const fragments = govbbFormRegistryEntries;
  expect(fragments).toHaveLength(22);
  expect(groups[index]![1].map(({ id }) => id)).toEqual(fragments.map((entry) => entry.key));
  expect(
    govbbFormEditor.registry.filter((entry) => entry.scope === "form").map((entry) => entry.key),
  ).toEqual(["GOVBB_LOUD_MUSIC_PERMIT"]);

  for (const entry of govbbFormRegistryEntries)
    expect(() => validateRegistryEntry(entry, govbbFormEditor)).not.toThrow();

  for (const component of Object.values(COMPONENTS)) {
    const values =
      ("options" in component ? component.options : undefined)?.map((option) => option.value) ?? [];

    expect(new Set(values).size).toBe(values.length);
    expect(component).not.toHaveProperty("ref");
    expect(component).not.toHaveProperty("settings");
  }
});

test("GovBB name and address entries create labelled questions with their optional fields and hints", () => {
  const editor = newEditor();
  run(editor, () => {
    const name = $govbbField("GOVBB_NAME");
    const address = $govbbField("GOVBB_ADDRESS");
    $getRoot().append($createFormTitleNode(), ...name, ...address);
    const titles = name.filter($isQuestionNode);
    expect(titles.map((title) => title.getTextContent())).toEqual([
      "First name",
      "Middle name(s)",
      "Last name",
    ]);
    expect($hintBlocks(titles[1]!)?.map((hint) => hint.getTextContent())).toEqual([
      "If you have more than one, add them in order",
    ]);
    expect($settings($blockGroup(titles[1]!).find($isInput)!).required).toBe(false);
    expect($settings($blockGroup(titles[0]!).find($isInput)!)).toMatchObject({
      hasMinCharacters: true,
      minCharacters: 2,
      pattern: FORMATS.personName.pattern,
      required: true,
    });
    const addressTitles = address.filter($isQuestionNode);
    expect(addressTitles.map((title) => title.getTextContent())).toEqual([
      "Address line 1",
      "Address line 2",
      "Parish",
      "Postcode",
    ]);
    expect(
      addressTitles.map((title) => $settings($blockGroup(title).find($isInput)!).required === true),
    ).toEqual([true, false, true, false]);
  });
});

test("National ID stores its format in an empty input and Country folds its options with stable values", () => {
  const editor = newEditor();
  run(editor, () => {
    const nationalId = $govbbField("GOVBB_NATIONAL_ID");
    const country = $govbbField("GOVBB_COUNTRY");
    $getRoot().append($createFormTitleNode(), ...nationalId, ...country);
    const input = nationalId.find($isInput)!;
    expect(input.getTextContent()).toBe("");
    expect($settings(input)).toMatchObject({
      width: "medium",
      mask: "999999-9999",
      pattern: FORMATS.nationalId.pattern,
      errors: { required: "Enter your National ID number" },
    });
    expect($settings(country.find($isQuestionNode)!).folded).toBe(true);
    const options = country.filter($isOptionNode);
    expect(options).toHaveLength(128);
    expect(options.map((option) => $native(option).option?.value)).toEqual(
      COMPONENTS["components/country"]!.options!.map((option) => option.value),
    );
  });
  const preview = fieldQuestions("GOVBB_COUNTRY")!;
  expect(preview[0]!.options).toEqual(
    COMPONENTS["components/country"]!.options!.slice(0, 3).map((option) => String(option.label)),
  );
  expect(preview[0]!.more).toBe(125);
  expect(fieldQuestions("GOVBB_ADDRESS")!.map(({ required }) => required)).toEqual([
    true,
    false,
    true,
    false,
  ]);
  expect(fieldQuestions("GOVBB_NATIONAL_ID")![0]).toMatchObject({
    width: "medium",
    mask: "999999-9999",
  });
});

test("a drawn input redraws when its mask changes or is removed, but not when its width changes", () => {
  const editor = newEditor();
  let key = "";
  run(editor, () => {
    const input = $createInputNode();
    key = input.getKey();
    $getRoot().append($createFormTitleNode(), input);
  });

  for (const [patch, redraw] of [
    [{ mask: "999999-9999" }, true],
    [{ width: "medium" }, false],
    [{ mask: undefined }, true],
  ] as const) {
    const previous = editor
      .getEditorState()
      .read(() => $getNodeByKey<InputNode>(key)!, { editor: editor });

    run(editor, () => $setSettings($getNodeByKey<InputNode>(key)!, patch));
    editor
      .getEditorState()
      .read(() => expect($getNodeByKey<InputNode>(key)!.updateDOM(previous)).toBe(redraw), {
        editor: editor,
      });
  }
});

test("preset submitted keys remain stable after retitling and suffix repeated entries", () => {
  const editor = nativeRegistryEditor();

  try {
    editor.update(
      () => {
        $getRoot().append(...$govbbField("GOVBB_NAME"));
        $getRoot().append(...$govbbField("GOVBB_NAME"));
        $getRoot().append(...$govbbField("GOVBB_NATIONAL_ID"));
        $getRoot()
          .getChildren()
          .filter($isQuestionNode)[1]!
          .clear()
          .append($createTextNode("Other names"));
      },
      { discrete: true },
    );
    const fields = nativeQuestions(nativeRegistryForm(editor));
    expect(fields.map((field) => field.key)).toEqual([
      "first-name",
      "middle-name",
      "last-name",
      "first-name_2",
      "middle-name_2",
      "last-name_2",
      "national-id-number",
    ]);
    expect(fields[1]!.label).toBe("Other names");
  } finally {
    editor.dispose();
  }
});

test("a copied Country keeps the registry's stable submitted option values", () => {
  const editor = nativeRegistryEditor();

  try {
    editor.update(
      () => {
        $getRoot().append(...$govbbField("GOVBB_COUNTRY"));
        $duplicateQuestion($getRoot().getChildren().find($isQuestionNode)!);
      },
      { discrete: true },
    );
    const fields = nativeQuestions(nativeRegistryForm(editor));
    expect(fields).toHaveLength(2);
    expect(
      fields.map(
        (field) =>
          field.options!.find((option) => option.label === "Democratic Republic of the Congo")!
            .value,
      ),
    ).toEqual(["dr-congo", "dr-congo"]);
  } finally {
    editor.dispose();
  }
});

test("Parish turned into multiple choice keeps native values and changes presentation", () => {
  const editor = nativeRegistryEditor();

  try {
    editor.update(
      () => {
        const parish = $govbbField("GOVBB_PARISH");
        $getRoot().append(...parish);
        $turnInto(parish.find($isOptionNode)!, "multiple-choice");
      },
      { discrete: true },
    );
    const field = nativeQuestions(nativeRegistryForm(editor))[0]!;
    expect(field).toMatchObject({
      kind: "choice",
      config: { selection: "single", presentation: "radio" },
    });
    expect(field.options!.find((option) => option.label === "St. Andrew")!.value).toBe("st-andrew");
  } finally {
    editor.dispose();
  }
});

test("the name entry supplies all three applicant name parts in a declaration preview", () => {
  const editor = newEditor();
  run(editor, () => {
    const declaration = pageEntries.find(({ id }) => id === "DECLARATION_PAGE")!.create();
    $getRoot().append($createFormTitleNode(), ...$govbbField("GOVBB_NAME"), ...declaration);
    $settle();
    expect($pagePreview(declaration[0]!).applicant).toBe(
      "[First name] [Middle name(s)] [Last name]",
    );
  });
});

test("National ID exports its native format, width and authored messages", () => {
  const editor = nativeRegistryEditor();

  try {
    editor.update(() => $getRoot().append(...$govbbField("GOVBB_NATIONAL_ID")), { discrete: true });
    const field = nativeQuestions(nativeRegistryForm(editor))[0]!;
    expect(field.config).toEqual({ width: "medium", mask: "999999-9999" });
    expect(field.validation).toEqual(COMPONENTS["components/national-id-number"]!.validation);
    expect(field.required).toEqual({ value: true, message: "Enter your National ID number" });
    expect(field).not.toHaveProperty("ref");
    expect(field).not.toHaveProperty("settings");
  } finally {
    editor.dispose();
  }
});

test("plain fields compile to generic refs and the declaration to confirmation", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $createInputNode(),
      $createInputNode("time"),
      $createInputNode("email"),
    ),
  );
  expect(questions(compileForm(editor.getEditorState())).map(({ ref }) => ref)).toEqual([
    "components/generic-text",
    "components/generic-time",
    "components/generic-email",
  ]);
  const demo = newEditor();
  run(demo, $demo);
  const schema = compileForm(demo.getEditorState());
  expect(questions(schema).find(({ fieldId }) => fieldId === "declaration-confirmed")!.ref).toBe(
    "components/confirmation",
  );
  expect(preflight(schema)).toEqual([]);
});

test("turning a preset into another kind drops unsupported compiled settings and keeps its stored settings", () => {
  const editor = newEditor();
  run(editor, () => {
    const nationalId = $govbbField("GOVBB_NATIONAL_ID");
    const parish = $govbbField("GOVBB_PARISH");
    $getRoot().append($createFormTitleNode(), ...nationalId, ...parish);
    $turnInto(nationalId.find($isInput)!, "long-answer");
    const option = parish.find($isOptionNode)!;
    $setSettings(option, { width: "short" });
    $turnInto(option, "multiple-choice");
  });
  const fields = questions(compileForm(editor.getEditorState()));
  expect(fields[0]!.ref).toBe("components/generic-textarea");
  expect(fields[0]!.settings.pattern).toBeUndefined();
  expect(fields[0]!.settings.mask).toBeUndefined();
  expect(fields[0]!.errors.pattern).toBeUndefined();
  expect(fields[1]!.settings.width).toBeUndefined();
  editor.getEditorState().read(
    () => {
      const input = $getRoot().getChildren().find($isInput)!;
      expect($settings(input)).toMatchObject({
        pattern: FORMATS.nationalId.pattern,
        mask: "999999-9999",
      });
    },
    { editor: editor },
  );
});

test("preflight rejects a broken stored pattern and an invalid field width", () => {
  const editor = newEditor();
  run(editor, () => {
    $demo();
    $setSettings($getRoot().getChildren().find($isInput)!, { pattern: "[", width: "huge" });
  });
  const issues = preflight(compileForm(editor.getEditorState()));
  expect(issues.map(({ code, message }) => ({ code, message }))).toEqual([
    { code: "pattern", message: "This format’s pattern doesn’t work" },
    { code: "field-width", message: "Field width must be short, medium or long" },
  ]);
});
