import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { $duplicateQuestion } from "../../src/forms/editor/structure/blocks";
import { fileUploadEntry } from "../../src/forms/features/file-upload/insertion";
import {
  compileForm,
  preflight,
  type FormQuestion,
  type FormSchema,
} from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $createFormTitleNode,
  $createQuestionNode,
  $deepCopy,
  $ensureBlockIds,
  $ensureQuestionFields,
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
import { DEFAULT_FILE_TYPES } from "../../src/forms/features/file-upload/files";
import { acceptedFiles } from "../../src/forms/features/file-upload/presentation";

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

test("new file uploads store the default MIME types and describe their extensions", () => {
  const editor = newEditor();
  run(editor, () => {
    const [title, upload] = [$createQuestionNode(), ...fileUploadEntry.create()];
    expect($settings(upload!).allowedFiles).toEqual(DEFAULT_FILE_TYPES);
    $getRoot().append($createFormTitleNode(), title!, upload!);
  });
  expect(acceptedFiles(DEFAULT_FILE_TYPES)).toBe("Attach a .pdf, .jpg or .png file");
});

test("the demo compiles SSB ids, messages and option values and passes preflight", () => {
  const editor = newEditor();
  run(editor, $demo);
  const schema = compileForm(editor.getEditorState());
  const fields = questions(schema);
  expect(schema.pages.map((page) => page.stepId)).toEqual([
    "tell-us-about-the-event",
    "road-closure",
    "sound-systems",
    "check-your-answers",
    "declaration",
    "submission-confirmation",
  ]);
  expect(fields.map((field) => field.fieldId)).toEqual([
    "event-name",
    "which-parish-is-the-event-in",
    "event-date",
    "national-id-number",
    "passport-number",
    "do-you-need-to-close-a-road",
    "how-long-will-the-road-be-closed",
    "which-roads",
    "upload-a-site-plan",
    "type-of-sound-system",
    "number-of-speakers",
    "speaker-brand",
    "declaration-confirmed",
  ]);
  expect(fields[0]!.errors.required).toBe("Enter event name");
  expect(fields[1]!.errors.required).toBe("Answer “Which parish is the event in?”");
  expect(fields[1]!.options.map((option) => option.value)).toEqual([
    "christ-church",
    "saint-michael",
  ]);
  expect(fields[2]!.errors.futureOrToday).toBe("Event date must be today or in the future");
  expect(fields[3]!.ref).toBe("components/national-id-number");
  expect(fields[8]!.settings.allowedFiles).toEqual(DEFAULT_FILE_TYPES);
  expect(fields[8]!.errors.fileTypes).toBe("The file must be a .pdf, .jpg or .png");
  expect(fields[12]!.errors.required).toBe("You must confirm the declaration to continue");
  expect(new Set(fields.map((field) => field.id)).size).toBe(fields.length);
  expect(new Set(fields.map((field) => field.fieldId)).size).toBe(fields.length);
  expect(preflight(schema)).toEqual([]);
});

test("a duplicate drops its field pin, keeps its messages, and resolves without a clash", () => {
  const editor = newEditor();
  run(editor, () => {
    const title = $createQuestionNode().append($createTextNode("Event name"));

    const input = $setSettings($createInputNode(), {
      fieldId: "event-name",
      required: true,
      errors: { required: "Enter the event name" },
    });

    $getRoot().append($createFormTitleNode(), title, input);
    $settle();
    const key = $questionKey(input);
    $duplicateQuestion(title);
    $settle();
    const copy = $getRoot().getLastChild()!;
    expect($questionKey(input)).toBe(key);
    expect($questionKey(copy)).not.toBe(key);
    expect($settings(copy).fieldId).toBeUndefined();
    expect($settings(copy).errors).toEqual({ required: "Enter the event name" });
    expect($ssbIds().fields.get($questionKey(copy))).toEqual({ id: "event-name-2", pinned: false });
  });
  expect(preflight(compileForm(editor.getEditorState())).map((issue) => issue.code)).toEqual([
    "no-confirmation",
    "no-declaration",
  ]);
});

test("the shared copy helper drops only SSB pins, including page and option pins", () => {
  const editor = newEditor();
  run(editor, () => {
    const original = $setSettings($createOptionNode(), {
      fieldId: "answer",
      pageId: "details",
      optionValue: "yes",
      required: true,
      errors: { required: "Select an answer about the event" },
    });

    $getRoot().append($createFormTitleNode(), original);
    const copy = $deepCopy(original);
    expect($settings(copy)).toEqual({
      required: true,
      errors: { required: "Select an answer about the event" },
    });
    expect($settings(original).optionValue).toBe("yes");

    const page = $setSettings($createWidgetNode("page-break"), {
      pageId: "details",
      name: "Details",
    });

    expect($settings($deepCopy(page))).toEqual({ name: "Details" });
  });
});

test("adding an option preserves its siblings' pinned values without sharing them", () => {
  const editor = newEditor();
  run(editor, () => {
    const first = $setSettings($createOptionNode(), {
      required: true,
      fieldId: "permission",
      optionValue: "Yes / approved",
    }).append($createTextNode("Yes"));

    const second = $createOptionNode().append($createTextNode("No"));
    $getRoot().append(
      $createFormTitleNode(),
      $createQuestionNode().append($createTextNode("Permission")),
      first,
      second,
    );
    $settle();
    const next = $createOptionNode().append($createTextNode("Maybe"));
    second.insertAfter(next);
    $settle();
    expect($settings(first).optionValue).toBe("Yes / approved");
    expect($settings(second).optionValue).toBeUndefined();
    expect($settings(next).optionValue).toBeUndefined();
    expect($settings(next).fieldId).toBe("permission");
  });
  const field = questions(compileForm(editor.getEditorState()))[0]!;
  expect(field.options.map((option) => option.value)).toEqual(["Yes / approved", "no", "maybe"]);
  expect(field.settings.optionValue).toBeUndefined();
});

test("preflight flags stored fieldless required messages and empty compiled file types", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append(
      $createFormTitleNode(),
      $createQuestionNode().append($createTextNode("Event name")),
      $setSettings($createInputNode(), {
        required: true,
        errors: { required: "  THIS FIELD IS REQUIRED!  " },
      }),
      $createQuestionNode().append($createTextNode("Site plan")),
      $setSettings($createWidgetNode("file-upload"), { allowedFiles: ["DOCUMENTS"] }),
    );
  });
  const schema = compileForm(editor.getEditorState());
  const file = questions(schema)[1]!;
  expect(file.settings.allowedFiles).toEqual([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  file.settings.allowedFiles = [];
  expect(preflight(schema).map((issue) => issue.code)).toEqual([
    "required-message",
    "file-types",
    "no-confirmation",
    "no-declaration",
  ]);
  questions(schema)[0]!.errors.required = "";
  expect(preflight(schema).map((issue) => issue.code)).toEqual([
    "required-message",
    "file-types",
    "no-confirmation",
    "no-declaration",
  ]);
});

test("preflight catches invalid stored ids and duplicated ids, option values and confirmation pages", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append(
      $setSettings($createFormTitleNode(), { pageId: "Invalid page" }),
      $createQuestionNode().append($createTextNode("Permission")),
      $setSettings($createOptionNode(), { fieldId: "Invalid field" }).append(
        $createTextNode("Yes"),
      ),
      $createOptionNode().append($createTextNode("No")),
    );
  });
  const invalid = compileForm(editor.getEditorState());
  expect(preflight(invalid).map((issue) => issue.code)).toEqual([
    "page-id",
    "field-id",
    "no-confirmation",
    "no-declaration",
  ]);

  const demo = newEditor();
  run(demo, $demo);
  const schema = compileForm(demo.getEditorState());
  const fields = questions(schema);
  fields[1]!.fieldId = fields[0]!.fieldId;
  fields[1]!.options[0]!.value = "";
  fields[5]!.options[1]!.value = fields[5]!.options[0]!.value;
  schema.pages[1]!.stepId = schema.pages[0]!.stepId;
  schema.pages.push({
    id: "extra",
    stepId: "confirmation",
    pageType: "confirmation",
    confirmation: true,
    blocks: [],
  });
  expect(preflight(schema).map((issue) => issue.code)).toEqual([
    "field-id",
    "option-value",
    "page-id",
    "option-value",
    "confirmation-pages",
  ]);
  schema.pages[0]!.stepId = "declaration";
  expect(preflight(schema)[0]!.message).toBe("This ID is kept for SSB's ‘declaration’ page");
});
