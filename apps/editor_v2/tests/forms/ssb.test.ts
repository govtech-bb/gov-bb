import { createEditor, defaultMessage, messagesFor, rulesFor } from "../helpers/default-form";
import { $createHeadingNode, HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { legacyFieldAdapter } from "../../src/forms/editor/legacy-mappings";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import {
  $createFormTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { $setSettings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { $ssbIds } from "../../src/forms/editor/ssb";
import {
  autoId,
  checkId,
  RESERVED_PAGE_IDS,
  resolveIds,
  slug,
} from "../../src/forms/core/identities";
import {
  DEFAULT_FILE_TYPES,
  FILE_TYPES,
  fileTypesOf,
} from "../../src/forms/features/file-upload/files";
import { isFieldless, type RuleName } from "../../src/forms/adapters/ssb/rules";

test("SSB slugs normalise labels, shorten at a boundary, and prefix numbers", () => {
  expect(slug("Event name")).toBe("event-name");
  expect(slug("Which parish is the event in?")).toBe("which-parish-is-the-event-in");
  expect(slug("Café permit")).toBe("cafe-permit");
  expect(autoId("2nd address", "field", "field-")).toBe("field-2nd-address");
  expect(slug("event name ".repeat(10))).toBe("event-name-event-name-event-name-event-name");
  expect(autoId("a".repeat(100), "field", "field-")).toBe("field");
  expect(slug("!!!")).toBe("");
  expect(autoId("!!!", "field", "field-")).toBe("field");
});

test("SSB IDs reserve authored values before autos and report authored clashes", () => {
  const ids = resolveIds([
    { key: "first", auto: "event-name" },
    { key: "second", auto: "event-name" },
  ]);

  expect([...ids.values()]).toEqual([
    { id: "event-name", pinned: false },
    { id: "event-name-2", pinned: false },
  ]);

  const pins = [
    { key: "auto", auto: "event-name" },
    { key: "pin", auto: "another", pinned: "event-name" },
    { key: "clash", auto: "third", pinned: "event-name" },
  ];

  expect([...resolveIds(pins).values()]).toEqual([
    { id: "event-name-2", pinned: false },
    { id: "event-name", pinned: true },
    { id: "event-name-3", pinned: true, clash: "event-name" },
  ]);
  expect(resolveIds(pins)).toEqual(resolveIds(pins));
  expect(
    resolveIds([{ key: "page", auto: "declaration" }], RESERVED_PAGE_IDS).get("page")?.id,
  ).toBe("declaration-2");
  expect(
    resolveIds([{ key: "page", auto: "start", pinned: "config" }], RESERVED_PAGE_IDS).get("page"),
  ).toEqual({ id: "config-2", pinned: true, clash: "config" });
  expect(resolveIds([{ key: "invalid", auto: "title", pinned: "Bad ID" }]).get("invalid")?.id).toBe(
    "Bad ID",
  );
});

test("SSB ID checks explain invalid, duplicate and reserved values", () => {
  for (const value of ["", "2nd-address", "Event", "event_name", "event--name", "event-"])
    expect(checkId(value, new Set())).toBe(
      "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)",
    );
  expect(checkId("event", new Set(["event"]))).toBe("Another question already uses this ID");
  expect(checkId("event", new Set(["event"]), RESERVED_PAGE_IDS, "page")).toBe(
    "Another page already uses this ID",
  );

  for (const id of RESERVED_PAGE_IDS)
    expect(checkId(id, new Set(), RESERVED_PAGE_IDS, "page")).toBe(
      `This ID is kept for SSB's ‘${id}’ page`,
    );
  expect(checkId("event-name-2", new Set())).toBeNull();
});

test("SSB default messages follow GovBB wording for every active rule", () => {
  const cases: [RuleName, string, Parameters<typeof defaultMessage>[1]["value"], string, string][] =
    [
      ["required", "text", undefined, "Enter event name", "Answer “Which parish is the event in?”"],
      [
        "required",
        "multiple-choice",
        undefined,
        "Select event name",
        "Answer “Which parish is the event in?”",
      ],
      [
        "required",
        "file-upload",
        undefined,
        "Upload event name",
        "Answer “Which parish is the event in?”",
      ],
      [
        "minLength",
        "text",
        3,
        "Event name must be 3 characters or more",
        "Your answer must be 3 characters or more",
      ],
      [
        "maxLength",
        "long-answer",
        10,
        "Event name must be 10 characters or less",
        "Your answer must be 10 characters or less",
      ],
      ["min", "number", 2, "Event name must be 2 or more", "Your answer must be 2 or more"],
      ["max", "number", 8, "Event name must be 8 or less", "Your answer must be 8 or less"],
      [
        "email",
        "email",
        undefined,
        "Enter an email address in the correct format, like name@example.com",
        "Enter an email address in the correct format, like name@example.com",
      ],
      [
        "phone",
        "phone",
        undefined,
        "Enter a telephone number, like 246 123 4567",
        "Enter a telephone number, like 246 123 4567",
      ],
      [
        "before",
        "date",
        "2026-03-27",
        "Event name must be before 27 March 2026",
        "The date must be before 27 March 2026",
      ],
      [
        "after",
        "date",
        "2026-03-27",
        "Event name must be after 27 March 2026",
        "The date must be after 27 March 2026",
      ],
      [
        "onOrAfter",
        "date",
        { from: "2026-03-27", to: "2026-04-03" },
        "Event name must be between 27 March 2026 and 3 April 2026",
        "The date must be between 27 March 2026 and 3 April 2026",
      ],
      [
        "onOrBefore",
        "date",
        { from: "2026-03-27", to: "2026-04-03" },
        "Event name must be between 27 March 2026 and 3 April 2026",
        "The date must be between 27 March 2026 and 3 April 2026",
      ],
      ["minSelection", "checkboxes", 2, "Select at least 2", "Select at least 2"],
      ["maxSelection", "checkboxes", 3, "Select no more than 3", "Select no more than 3"],
      [
        "fileTypes",
        "file-upload",
        DEFAULT_FILE_TYPES,
        "The file must be a .pdf, .jpg or .png",
        "The file must be a .pdf, .jpg or .png",
      ],
      [
        "itemMaxSize",
        "file-upload",
        10,
        "The file must be smaller than 10MB",
        "The file must be smaller than 10MB",
      ],
      ["minItems", "file-upload", 2, "Upload at least 2 files", "Upload at least 2 files"],
      ["maxItems", "file-upload", 4, "Upload no more than 4 files", "Upload no more than 4 files"],
    ];

  for (const [rule, kind, value, noun, question] of cases) {
    expect(defaultMessage(rule, { kind, value, optionCount: 2, label: "Event name" })).toBe(noun);
    expect(
      defaultMessage(rule, { kind, value, optionCount: 2, label: "Which parish is the event in?" }),
    ).toBe(question);
  }

  for (const label of ["Declaration", "Do you confirm?"])
    expect(defaultMessage("required", { kind: "checkboxes", label, optionCount: 1 })).toBe(
      "You must confirm the declaration to continue",
    );
  expect(defaultMessage("required", { kind: "text", label: "VAT number:", optionCount: 0 })).toBe(
    "Enter VAT number",
  );
});

test("required defaults name titled, question-shaped and untitled inputs of every kind", () => {
  for (const entry of govbbFormEditor.fields.filter(legacyFieldAdapter)) {
    for (const label of ["Event name", "Which parish is the event in?", ""]) {
      const message = defaultMessage("required", { kind: entry.kind!, label, optionCount: 2 });
      expect(message.trim()).not.toBe("");
      expect(isFieldless(message)).toBe(false);
      expect(messagesFor(entry.kind!, { required: true }, 2, label)[0]?.message).toBe(message);
    }
  }

  expect(messagesFor("text", { required: true, name: "Applicant name" }, 0, "")[0]?.message).toBe(
    "Enter applicant name",
  );

  for (const label of ["Yes or no", "An option", "An answer", "At least one option"]) {
    for (const kind of ["multiple-choice", "dropdown", "checkboxes"]) {
      const message = defaultMessage("required", { kind, label, optionCount: 2 });
      expect(message).toBe(`Answer “${label}”`);
      expect(isFieldless(message)).toBe(false);
    }
  }

  expect(defaultMessage("required", { kind: "text", label: ":", optionCount: 0 })).toBe(
    "Enter text input",
  );
  expect(defaultMessage("minLength", { kind: "text", label: "?", optionCount: 0, value: 3 })).toBe(
    "Your answer must be 3 characters or more",
  );

  for (const text of [
    "This field is required",
    "Select an option",
    "Select an answer",
    "Select yes or no",
    "Select at least one option",
  ])
    expect(isFieldless(`  ${text.toUpperCase()}.!!  `)).toBe(true);
  expect(isFieldless("Select your parish")).toBe(false);
});

test("active rules follow settings, with a shared range message and blank pins falling back", () => {
  const names = (kind: string, settings: Parameters<typeof rulesFor>[1]) =>
    rulesFor(kind, settings, 2).map(({ rule }) => rule);

  expect(
    names("text", {
      required: true,
      hasMinCharacters: true,
      minCharacters: 0,
      hasMaxCharacters: true,
      maxCharacters: 20,
    }),
  ).toEqual(["required", "minLength", "maxLength"]);
  expect(names("long-answer", { hasMinCharacters: true, minCharacters: 5 })).toEqual(["minLength"]);
  expect(
    names("number", { hasMinNumber: true, minNumber: 0, hasMaxNumber: true, maxNumber: 10 }),
  ).toEqual(["min", "max"]);
  expect(names("email", {})).toEqual(["email"]);
  expect(names("phone", {})).toEqual(["phone"]);
  expect(names("date", { beforeDate: "2026-03-27" })).toEqual(["before"]);
  expect(names("date", { afterDate: "2026-03-27" })).toEqual(["after"]);
  expect(names("date", { specificDates: ["2026-03-27"] })).toEqual([]);
  const choices = { hasMinChoices: true, minChoices: 1, hasMaxChoices: true, maxChoices: 3 };
  expect(names("checkboxes", choices)).toEqual(["minSelection", "maxSelection"]);

  for (const kind of ["multiple-choice", "dropdown"]) {
    expect(names(kind, choices)).toEqual([]);
    expect(names(kind, { ...choices, allowMultiple: true })).toEqual([]);
  }

  expect(
    names("file-upload", {
      hasMaxFileSize: true,
      maxFileSize: 10,
      hasMinFiles: true,
      minFiles: 1,
      hasMaxFiles: true,
      maxFiles: 3,
    }),
  ).toEqual(["fileTypes", "itemMaxSize", "minItems", "maxItems"]);

  const range = {
    dateRange: { from: "2026-03-27", to: "2026-04-03" },
    errors: { onOrAfter: "Choose a date in the event week" },
  };

  const messages = messagesFor("date", range, 0, "Event date");
  expect(messages.map(({ rule }) => rule)).toEqual(["onOrAfter", "onOrBefore"]);
  expect(
    messages.every(({ message, pinned }) => pinned && message === range.errors.onOrAfter),
  ).toBe(true);
  expect(
    messagesFor("date", { dateRange: { from: "2026-03-27" } }, 0, "Event date").map(
      ({ message }) => message,
    ),
  ).toEqual(["Event date must be on or after 27 March 2026"]);
  expect(messagesFor("text", { required: true, errors: { required: "  " } }, 0, "Name")[0]).toEqual(
    {
      rule: "required",
      label: "When it's empty",
      message: "Enter name",
      default: "Enter name",
      pinned: false,
    },
  );
});

test("file types map old groups and fall back to the standard MIME list", () => {
  expect(
    fileTypesOf({ allowedFiles: ["IMAGES", "DOCUMENTS", "SPREADSHEETS", "AUDIO", "VIDEO"] }),
  ).toEqual(["image/jpeg", "image/png", "application/pdf", FILE_TYPES[3]![0], FILE_TYPES[4]![0]]);
  expect(fileTypesOf({ allowedFiles: ["application/pdf", "application/pdf", "PNG"] })).toEqual([
    "application/pdf",
  ]);
  expect(fileTypesOf({ allowedFiles: [] })).toEqual(DEFAULT_FILE_TYPES);
  expect(fileTypesOf({})).toEqual(DEFAULT_FILE_TYPES);
  expect(fileTypesOf({ allowedFiles: ["AUDIO"] })).toEqual(DEFAULT_FILE_TYPES);
});

test("the ID reader includes folded pages, stable question keys and arbitrary pinned option values", () => {
  const editor = createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const title = $createFormTitleNode();
      const question = $createQuestionNode().append($createTextNode("Event name"));
      const input = $createInputNode();

      const page = $setSettings($createWidgetNode("page-break"), {
        name: "Declaration",
        folded: true,
      });

      const heading = $createHeadingNode("h2").append($createTextNode("Your answers"));
      const a = $createOptionNode().append($createTextNode("Yes"));

      const b = $setSettings($createOptionNode().append($createTextNode("No")), {
        optionValue: "Yes / confirmed",
      });

      const other = $setSettings($createOptionNode().append($createTextNode("Something else")), {
        other: true,
      });

      const second = $createQuestionNode().append($createTextNode("Another choice"));

      const same = $setSettings($createOptionNode().append($createTextNode("Yes")), {
        optionValue: "Yes / confirmed",
      });

      const thanks = $setSettings($createWidgetNode("page-break"), {
        confirmation: true,
        pageId: "not-the-confirmation",
      });

      const extraThanks = $setSettings($createWidgetNode("page-break"), { confirmation: true });
      $getRoot().append(
        title,
        question,
        input,
        page,
        heading,
        a,
        b,
        other,
        second,
        same,
        thanks,
        extraThanks,
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      const ids = $ssbIds();
      expect(ids.fields.get($questionKey(input))?.id).toBe("event-name");
      expect(ids.fields.get($questionKey(a))?.id).toBe("checkboxes");
      expect(ids.fields.size).toBe(3);
      expect(ids.pages.get(title.getKey())?.id).toBe("event-name");
      expect(ids.pages.get(page.getKey())?.id).toBe("declaration-2");
      expect(ids.pages.get(thanks.getKey())?.id).toBe("submission-confirmation");
      expect(ids.pages.get(extraThanks.getKey())?.id).toBe("page-4");
      expect(ids.options.get(a.getKey())?.id).toBe("yes");
      expect(ids.options.get(b.getKey())).toEqual({ id: "Yes / confirmed", pinned: true });
      expect(ids.options.get(same.getKey())).toEqual({ id: "Yes / confirmed", pinned: true });
      expect(ids.options.get(other.getKey())?.id).toBe("other");
    },
    { discrete: true },
  );
});
