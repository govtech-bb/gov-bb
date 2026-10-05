import { nativeDefinition } from "../helpers/native-definition";
import { describe, expect, test } from "vitest";
import {
  calendarDaysBetween,
  calendarMonthsBetween,
  isDateOnly,
  nativeDiagnostic,
  nativeDiagnosticPath,
  nativeSemanticEqual,
  normalizeNativeRichText,
  remapNativeForm,
  validateFormDefinition,
  validateNativeCapabilities,
  visitNativeReferences,
  wholeCalendarYearsBetween,
  type AnyFormDefinition,
  type NativeQuestion,
  type NativeSchemaCapabilities,
  type QuestionBase,
  type RichText,
  type JsonValue,
} from "../../src/forms/schema";
import passport from "../fixtures/forms/v2/examples/passport-example.json";
import repeats from "../fixtures/forms/v2/examples/repeat-example.json";
import identity from "../fixtures/forms/v2/examples/identity-registry-example.json";
import pension from "../fixtures/forms/v2/pension.json";
import severance from "../fixtures/forms/v2/severance.json";
import nis from "../fixtures/forms/v2/nis.json";

function form(): AnyFormDefinition {
  return {
    schemaVersion: 2,
    id: "example",
    title: "Example",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "preview", hiddenAnswers: "retain" },
    blocks: [
      { id: "page", type: "page", role: "questions", title: "Your details" },
      { id: "name", type: "question", kind: "text", key: "name", label: "Your name" },
      {
        id: "amount",
        type: "question",
        kind: "number",
        key: "amount",
        label: "Amount",
        default: 0,
      },
      {
        id: "choice",
        type: "question",
        kind: "choice",
        key: "choice",
        label: "Choose",
        config: { selection: "single" },
        options: [
          { id: "yes", label: "Yes", value: "name" },
          { id: "no", label: "No", value: "no" },
        ],
      },
      {
        id: "copy",
        type: "content",
        kind: "paragraph",
        content: ["Hello ", { answer: "name", fallback: "person" }],
      },
      {
        id: "total",
        type: "calculated",
        valueType: "number",
        expression: { op: "multiply", args: [{ answer: "amount" }, 2] },
      },
      {
        id: "logic",
        type: "logic",
        rules: [
          {
            id: "show",
            when: { op: "selected", question: "choice", option: "yes" },
            actions: [{ type: "setVisible", targets: ["copy"], value: true }],
          },
        ],
      },
      { id: "confirmation", type: "page", role: "confirmation", title: "Submitted" },
    ],
  };
}

function question(value: AnyFormDefinition, id: string): QuestionBase {
  const block = value.blocks.find((block) => block.id === id);

  if (block?.type !== "question") throw Error(`Missing question ${id}`);

  return block;
}

function rejects(mutate: (value: AnyFormDefinition) => void, code: string) {
  const value = form();
  mutate(value);

  const original = structuredClone(value),
    result = validateFormDefinition(value);

  expect(result.status).toBe("blocked");
  expect(result.schema).toBeNull();
  expect(result.diagnostics.some((issue) => issue.code === code)).toBe(true);
  expect(value).toEqual(original);
}

describe("native definition structural validation", () => {
  for (const [name, value] of Object.entries({
    passport,
    repeats,
    identity,
    pension,
    severance,
    nis,
  }))
    test(`${name} is valid without a vendor or editor dependency`, () => {
      const before = JSON.stringify(value),
        result = validateFormDefinition(value);

      expect(result).toMatchObject({ status: "ready", diagnostics: [] });

      if (result.status === "ready") expect(result.schema === value).toBe(true);
      expect(JSON.stringify(value)).toBe(before);
    });
  test("preserves false, zero, empty and omissions", () => {
    const value = form();
    question(value, "name").default = "";
    question(value, "name").required = { value: false, message: "" };
    question(value, "name").visible = false;
    question(value, "name").disabled = false;
    const result = validateFormDefinition(value);
    expect(result.status).toBe("ready");
    expect(result.schema).toEqual(value);
  });
  test("rejects wrong versions and documents without a schema version", () => {
    rejects((value) => {
      Object.assign(value, { schemaVersion: 3 });
    }, "schema-version");
    const result = validateFormDefinition({ id: "external-form", name: "Example", blocks: [] });
    expect(result.diagnostics.find((issue) => issue.code === "schema-version")?.message).toContain(
      "v2 form definition",
    );
  });
  test("rejects hidden conditional properties and arbitrary config", () => {
    rejects((value) => {
      Object.assign(question(value, "name"), { visibleIf: true });
    }, "unknown-property");
    rejects((value) => {
      question(value, "name").config = { secretProviderToken: "wrong-place" };
    }, "unknown-property");
  });
  test("rejects functions, undefined, non-finite numbers, exotic objects, cycles and accessors", () => {
    for (const bad of [
      undefined,
      () => true,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      BigInt(2),
      new Date(),
      new Map(),
      Symbol("key"),
    ])
      expect(
        validateFormDefinition({ ...form(), extra: bad }).diagnostics.some(
          (issue) => issue.code === "not-json",
        ),
      ).toBe(true);
    const cyclic = { self: null };
    Object.assign(cyclic, { self: cyclic });
    expect(validateFormDefinition(cyclic).diagnostics[0]?.code).toBe("not-json");
    let read = false;

    const getter = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get() {
        read = true;

        return 2;
      },
    });

    expect(validateFormDefinition(getter).status).toBe("blocked");
    expect(read).toBe(false);
    expect(
      validateFormDefinition({ ...form(), blocks: Object.assign([], { length: 2 }) }).status,
    ).toBe("blocked");
  });
  test("reports JSON paths and owning blocks", () => {
    const value = form();
    question(value, "amount").config = { step: 0 };
    expect(validateFormDefinition(value).diagnostics).toContainEqual({
      code: "step",
      severity: "error",
      message: "The input increment must be positive.",
      path: ["blocks", 2, "config", "step"],
      blockId: "amount",
    });
    expect(nativeDiagnosticPath(["key/with~", 2])).toBe("/key~1with~0/2");
  });
  test("requires coherent choice presentation and typed values", () => {
    rejects((value) => {
      question(value, "choice").config = { selection: "multiple", presentation: "radio" };
    }, "choice-presentation");
    rejects((value) => {
      question(value, "choice").options![1]!.value = false;
    }, "option-type");
    rejects((value) => {
      question(value, "choice").options![1]!.value = "name";
    }, "duplicate");
    rejects((value) => {
      question(value, "choice").default = "absent";
    }, "default-option");
    rejects((value) => {
      question(value, "choice").config = { selection: "multiple" };
      question(value, "choice").default = "name";
    }, "default-type");
  });
  test("checks exhaustive accordion membership", () => {
    const value = form();
    question(value, "choice").config = {
      selection: "multiple",
      presentation: "accordion",
      groups: [{ id: "g", label: "Group", optionIds: ["yes", "no"] }],
    };
    expect(validateFormDefinition(value).status).toBe("ready");
    question(value, "choice").config = {
      selection: "multiple",
      presentation: "accordion",
      groups: [{ id: "g", label: "Group", optionIds: ["yes"] }],
    };
    expect(
      validateFormDefinition(value).diagnostics.some((issue) => issue.code === "choice-groups"),
    ).toBe(true);
  });
  test("validates explicit regex flags and keeps rule messages", () => {
    rejects((value) => {
      question(value, "name").validation = [
        { id: "pattern", type: "pattern", pattern: "[", flags: "", message: "Custom error" },
      ];
    }, "pattern");
    rejects((value) => {
      question(value, "name").validation = [
        { id: "minimum", type: "minimum", value: 0, message: "Custom" },
      ];
    }, "validation-kind");
    rejects((value) => {
      question(value, "amount").validation = [
        { id: "low", type: "minimum", value: 10, message: "Low" },
        { id: "high", type: "maximum", value: 2, message: "High" },
      ];
    }, "validation-bounds");
  });
  test("validates date/time defaults and repeat bounds", () => {
    rejects((value) => {
      Object.assign(question(value, "name"), { kind: "date", default: "2025-02-29" });
    }, "default-date");
    rejects((value) => {
      Object.assign(question(value, "name"), { kind: "time", default: "24:00" });
    }, "default-date");
    rejects((value) => {
      question(value, "name").repeat = { min: 3, max: 2, addLabel: "Add" };
    }, "repeat-bounds");
    rejects((value) => {
      Object.assign(value.blocks.at(-1)!, {
        repeat: { key: "entries", min: 1, max: 2, addLabel: "Add" },
      });
    }, "page-repeat");
  });
  test("validates settings without executing notification delivery", () => {
    const value = form();
    value.blocks.splice(1, 0, {
      id: "email",
      type: "question",
      kind: "email",
      key: "email",
      label: "Email",
    });
    value.settings.notifications = {
      applicant: { enabled: false, recipient: { answer: "email" }, subject: "" },
      department: { enabled: true, recipient: { context: "departmentEmail" } },
    };
    expect(validateFormDefinition(value).status).toBe("ready");
    value.settings.notifications.applicant!.recipient.answer = "name";
    expect(
      validateFormDefinition(value).diagnostics.some(
        (issue) => issue.code === "notification-recipient",
      ),
    ).toBe(true);
    rejects((value) => {
      value.settings.closingDateTime = "2026-10-04T14:00";
    }, "closing-date");
  });
});

describe("native reference, type and dependency validation", () => {
  test("identities and submitted keys are unique at their own scope", () => {
    rejects((value) => {
      value.blocks.push(structuredClone(value.blocks[1]!));
    }, "duplicate-id");
    rejects((value) => {
      question(value, "amount").key = "name";
    }, "duplicate-key");
    const value = structuredClone(nativeDefinition(repeats));
    value.blocks.splice(3, 0, {
      id: "same-key",
      type: "question",
      kind: "text",
      key: "name",
      label: "Same key outside repeat",
    });
    expect(validateFormDefinition(value).status).toBe("ready");
  });
  test("validates references in disabled rules", () => {
    rejects((value) => {
      const logic = value.blocks.find((block) => block.type === "logic")!;

      if (logic.type === "logic") {
        logic.rules[0]!.enabled = false;
        logic.rules[0]!.when = { op: "eq", left: { answer: "unknown" }, right: "" };
      }
    }, "reference-missing");
  });
  test("rejects references to the wrong block kind and wrong local option", () => {
    rejects((value) => {
      const block = value.blocks.find((block) => block.type === "calculated")!;

      if (block.type === "calculated") block.expression = { answer: "copy" };
    }, "reference-kind");
    rejects((value) => {
      const logic = value.blocks.find((block) => block.type === "logic")!;

      if (logic.type === "logic")
        logic.rules[0]!.when = { op: "selected", question: "choice", option: "missing" };
    }, "reference-option");
  });
  test("rejects scalar reads across repeat scopes and implicit form reads", () => {
    const value = structuredClone(nativeDefinition(repeats));
    question(value, value.blocks[1]!.id).label = [{ answer: "member-name" }];
    expect(
      validateFormDefinition(value).diagnostics.some((issue) => issue.code === "reference-scope"),
    ).toBe(true);
    const local = structuredClone(nativeDefinition(repeats));
    question(local, "member-phones").label = [{ answer: "requester-name" }];
    expect(
      validateFormDefinition(local).diagnostics.some((issue) => issue.code === "reference-scope"),
    ).toBe(true);
    rejects((value) => {
      question(value, "name").label = [{ answer: "amount", scope: "current" }];
    }, "reference-scope");
  });
  test("rejects implicit fan-out writes into repeated entries", () => {
    const value = structuredClone(nativeDefinition(repeats));
    value.blocks.push({
      id: "global-logic",
      type: "logic",
      rules: [
        {
          id: "rule",
          when: true,
          actions: [{ type: "setRequired", target: "member-name", value: false }],
        },
      ],
    });
    expect(
      validateFormDefinition(value).diagnostics.some((issue) => issue.code === "action-scope"),
    ).toBe(true);
  });
  test("enforces expression arity, scalar types, explicit coercion and date types", () => {
    const expression = (value: AnyFormDefinition, replacement: JsonValue) =>
      Object.assign(
        value.blocks.find((block) => block.type === "calculated")!,
        { expression: replacement },
      );

    rejects((value) => expression(value, { op: "add", args: [1] }), "expression-arity");
    rejects((value) => expression(value, { op: "add", args: ["1", 2] }), "expression-type");
    rejects(
      (value) => expression(value, { op: "year", args: [{ answer: "name" }] }),
      "expression-type",
    );
    rejects((value) => {
      question(value, "amount").repeat = { min: 0, addLabel: "Add" };
    }, "expression-type");
    rejects(
      (value) =>
        expression(value, { op: "round", args: [2], increment: 0, ties: "towardPositiveInfinity" }),
      "round-increment",
    );
    rejects((value) => expression(value, { op: "coalesce", args: [true, 0] }), "expression-type");
    const valid = form();
    Object.assign(
      valid.blocks.find((block) => block.type === "calculated")!,
      {
        valueType: "string",
        expression: {
          op: "concat",
          args: ["Value ", { op: "toText", args: [{ answer: "amount" }] }],
        },
      },
    );
    expect(validateFormDefinition(valid).status).toBe("ready");
  });
  test("lookup validates keys and every potential branch", () => {
    rejects(
      (value) =>
        Object.assign(
          value.blocks.find((block) => block.type === "calculated")!,
          {
            expression: {
              op: "lookup",
              args: [1],
              entries: [
                { key: 1, value: 2 },
                { key: 1, value: 3 },
              ],
              fallback: 0,
            },
          },
        ),
      "duplicate",
    );
    rejects(
      (value) =>
        Object.assign(
          value.blocks.find((block) => block.type === "calculated")!,
          {
            expression: { op: "lookup", args: [1], entries: [{ key: "1", value: 2 }], fallback: 0 },
          },
        ),
      "lookup-key-type",
    );
    rejects(
      (value) =>
        Object.assign(
          value.blocks.find((block) => block.type === "calculated")!,
          {
            expression: {
              op: "lookup",
              args: [1],
              entries: [{ key: 1, value: { value: "total" } }],
              fallback: 0,
            },
          },
        ),
      "dependency-cycle",
    );
  });
  test("cycles include base calculations, conditional overrides and effective page visibility", () => {
    rejects(
      (value) =>
        Object.assign(
          value.blocks.find((block) => block.type === "calculated")!,
          { expression: { value: "total" } },
        ),
      "dependency-cycle",
    );
    rejects((value) => {
      const logic = value.blocks.find((block) => block.type === "logic")!;

      if (logic.type === "logic")
        logic.rules.push({
          id: "cycle",
          when: { op: "gt", left: { value: "total" }, right: 0 },
          actions: [{ type: "setValue", target: "total", value: 1 }],
        });
    }, "dependency-cycle");
    rejects((value) => {
      value.blocks.splice(2, 0, { id: "second", type: "page", role: "questions", title: "Amount" });
      const logic = value.blocks.find((block) => block.type === "logic")!;

      if (logic.type === "logic")
        logic.rules.push({
          id: "cycle",
          when: { op: "gt", left: { answer: "amount" }, right: 0 },
          actions: [{ type: "setVisible", targets: ["second"], value: true }],
        });
    }, "dependency-cycle");
  });
  test("input-part visibility masks answers while labels and hints do not", () => {
    const value = form(),
      logic = value.blocks.find((block) => block.type === "logic")!;

    if (logic.type !== "logic") throw Error("Expected logic");
    logic.rules.push({
      id: "label",
      when: { op: "empty", value: { answer: "name" } },
      actions: [
        {
          type: "setVisible",
          targets: [
            { question: "name", part: "label" },
            { question: "name", part: "hint" },
          ],
          value: false,
        },
      ],
    });
    expect(validateFormDefinition(value).status).toBe("ready");
    logic.rules.at(-1)!.actions = [
      { type: "setVisible", targets: [{ question: "name", part: "input" }], value: false },
    ];
    expect(
      validateFormDefinition(value).diagnostics.some((issue) => issue.code === "dependency-cycle"),
    ).toBe(true);
  });
  test("navigation cannot go backward or bypass submission into confirmation", () => {
    rejects((value) => {
      const logic = value.blocks.find((block) => block.type === "logic")!;

      if (logic.type === "logic") logic.rules[0]!.actions = [{ type: "goTo", target: "page" }];
    }, "navigation-order");
    rejects((value) => {
      const logic = value.blocks.find((block) => block.type === "logic")!;

      if (logic.type === "logic")
        logic.rules[0]!.actions = [{ type: "goTo", target: "confirmation" }];
    }, "navigation-confirmation");
    rejects((value) => {
      const logic = value.blocks.find((block) => block.type === "logic")!;

      if (logic.type === "logic")
        logic.rules[0]!.actions = [{ type: "setVisible", targets: ["page"], value: true }];
    }, "first-page");
  });
  test("layout preserves placement but cannot point forward or cross pages", () => {
    const value = form();
    question(value, "choice").layout = { under: { block: "copy" } };
    expect(
      validateFormDefinition(value).diagnostics.some((issue) => issue.code === "layout-order"),
    ).toBe(true);
    const copy = value.blocks.find((block) => block.id === "copy")!;

    if (copy.type === "content") copy.layout = { under: { question: "choice", option: "yes" } };
    delete question(value, "choice").layout;
    expect(validateFormDefinition(value).status).toBe("ready");
  });
  test("same local option IDs and list item IDs are scoped structurally", () => {
    const value = form();
    value.blocks.splice(
      4,
      0,
      { ...structuredClone(question(value, "choice")), id: "other-choice", key: "other" },
      {
        id: "list",
        type: "content",
        kind: "list",
        content: "",
        config: { ordered: false, items: [{ id: "yes", content: "Item" }] },
      },
    );
    const logic = value.blocks.find((block) => block.type === "logic")!;

    if (logic.type === "logic")
      logic.rules[0]!.actions = [
        {
          type: "setVisible",
          value: false,
          targets: [
            { question: "choice", option: "yes" },
            { question: "other-choice", option: "yes" },
            { question: "choice", part: "label" },
            { question: "choice", part: "hint" },
            { question: "other-choice", part: "input" },
            { list: "list", item: "yes" },
          ],
        },
      ];
    expect(validateFormDefinition(value).status).toBe("ready");

    const mapped = remapNativeForm(value, {
      blocks: new Map([
        ["choice", "a"],
        ["other-choice", "b"],
        ["list", "new-list"],
      ]),
      options: new Map([
        ["choice", new Map([["yes", "first-yes"]])],
        ["other-choice", new Map([["yes", "second-yes"]])],
      ]),
      listItems: new Map([["list", new Map([["yes", "item-yes"]])]]),
      keys: new Map([["choice", "firstKey"]]),
    });

    expect(validateFormDefinition(mapped).status).toBe("ready");
    const result = mapped.blocks.find((block) => block.type === "logic")!;

    if (result.type === "logic")
      expect(result.rules[0]!.actions[0]).toMatchObject({
        targets: [
          { question: "a", option: "first-yes" },
          { question: "b", option: "second-yes" },
          { question: "a", part: "label" },
          { question: "a", part: "hint" },
          { question: "b", part: "input" },
          { list: "new-list", item: "item-yes" },
        ],
      });
    expect(question(mapped, "a").key).toBe("firstKey");
    expect(question(mapped, "a").options![0]!.value).toBe("name");
    expect(question(value, "choice").options![0]!.id).toBe("yes");
  });
});

describe("configured module validation and data semantics", () => {
  const capabilities: NativeSchemaCapabilities = {
    fields: [
      { kind: "text", valueType: "string" },
      { kind: "number", valueType: "number" },
      {
        kind: "choice",
        config: { selection: "single", presentation: "radio" },
        valueType: "string",
      },
    ],
    contents: [{ kind: "paragraph" }],
  };

  test("configured modules determine availability without loading a preset", () => {
    expect(validateFormDefinition(form(), capabilities).status).toBe("ready");
    expect(
      validateFormDefinition(form(), {
        ...capabilities,
        fields: capabilities.fields.filter((field) => field.kind !== "number"),
      }).diagnostics.some((issue) => issue.code === "missing-module"),
    ).toBe(true);
    expect(
      validateFormDefinition(form(), { ...capabilities, structural: [] }).diagnostics.some(
        (issue) => issue.code === "missing-module",
      ),
    ).toBe(true);
  });
  test("rejects overlapping capability claims but permits disjoint choices", () => {
    expect(
      validateNativeCapabilities({
        ...capabilities,
        fields: [...capabilities.fields, { kind: "choice", valueType: "string" }],
      }).some((issue) => issue.code === "capability-overlap"),
    ).toBe(true);
    expect(
      validateNativeCapabilities({
        ...capabilities,
        fields: [
          ...capabilities.fields,
          {
            kind: "choice",
            config: { selection: "single", presentation: "dropdown" },
            valueType: "string",
          },
        ],
      }),
    ).toEqual([]);
  });
  test("custom fields supply exact typed configuration validation", () => {
    type CodeQuestion = NativeQuestion<"reference-code", { prefix: string; digits: number }>;

    const authored: CodeQuestion = {
      id: "custom",
      type: "question",
      kind: "reference-code",
      key: "reference",
      label: "Reference",
      config: { prefix: "BB", digits: 4 },
    };

    const value = form();
    value.blocks.splice(-1, 0, authored);

    const installed: NativeSchemaCapabilities = {
      ...capabilities,
      fields: [
        ...capabilities.fields,
        {
          kind: "reference-code",
          valueType: "string",
          validate: (block, path) => {
            const config = block.config;

            return config &&
              typeof config === "object" &&
              "prefix" in config &&
              "digits" in config &&
              typeof config.prefix === "string" &&
              Number.isInteger(config.digits) &&
              Object.keys(config).every((key) => ["prefix", "digits"].includes(key))
              ? []
              : [
                  nativeDiagnostic(
                    "custom-config",
                    "Use prefix and digits only.",
                    [...path, "config"],
                    block.id,
                  ),
                ];
          },
        },
      ],
    };

    expect(validateFormDefinition(value, installed).status).toBe("ready");
    Object.assign(authored.config!, { unsupported: true });
    expect(
      validateFormDefinition(value, installed).diagnostics.some(
        (issue) => issue.code === "custom-config",
      ),
    ).toBe(true);
  });
  test("reference visitor only visits structural references, including descriptions", () => {
    const value = form();
    value.description = [{ answer: "name" }];
    const refs: string[] = [];
    visitNativeReferences(value, (reference) => refs.push(`${reference.kind}:${reference.id}`));
    expect(refs).toContain("answer:name");
    expect(refs).not.toContain("answer:no");
    const mapped = remapNativeForm(value, { blocks: new Map([["name", "renamed"]]) });
    expect(mapped.description).toEqual([{ answer: "renamed" }]);
    expect(question(mapped, "choice").options![0]!.value).toBe("name");
  });
  test("semantic equality preserves ordered data and literal distinctions", () => {
    const left = form(),
      right = structuredClone(left);

    right.settings = { hiddenAnswers: "retain", visibility: "preview" };
    expect(nativeSemanticEqual(left, right)).toBe(true);
    question(right, "name").visible = false;
    expect(nativeSemanticEqual(left, right)).toBe(false);
    delete question(right, "name").visible;
    question(right, "choice").options!.reverse();
    expect(nativeSemanticEqual(left, right)).toBe(false);
    expect(nativeSemanticEqual({ default: ["a", "b"] }, { default: "ab" })).toBe(false);
  });
  test("rich text segmentation normalization is idempotent and preserves reference metadata", () => {
    const text: RichText = [
      "Hello",
      { text: " ", marks: [] },
      "world",
      { text: "!", marks: ["italic", "bold"] },
      { answer: "name", scope: "form", fallback: "" },
    ];

    const normalized = normalizeNativeRichText(structuredClone(text));
    expect(normalizeNativeRichText(normalized)).toEqual(normalized);
    expect(normalized).toEqual([
      "Hello world",
      { text: "!", marks: ["bold", "italic"] },
      { answer: "name", scope: "form", fallback: "" },
    ]);
    expect(
      nativeSemanticEqual(
        { type: "question", label: ["a", { text: "b" }] },
        { type: "question", label: "ab" },
      ),
    ).toBe(true);
  });
  test("calendar helpers implement date-only anniversaries without timezone arithmetic", () => {
    expect(isDateOnly("2000-02-29")).toBe(true);
    expect(isDateOnly("1900-02-29")).toBe(false);
    expect(wholeCalendarYearsBetween("2020-02-29", "2021-02-28")).toBe(0);
    expect(wholeCalendarYearsBetween("2020-02-29", "2021-03-01")).toBe(1);
    expect(wholeCalendarYearsBetween("2021-03-01", "2020-02-29")).toBeUndefined();
    expect(calendarMonthsBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(calendarMonthsBetween("2026-02-01", "2026-01-31")).toBe(-1);
    expect(calendarDaysBetween("2026-03-08", "2026-03-09")).toBe(1);
  });
});

test("native schema preserves current page navigation labels, file multiplicity and specific date validation", () => {
  const value = form();
  Object.assign(value.blocks[0]!, { navigation: { nextLabel: "Continue", backLabel: "" } });
  value.blocks.splice(
    1,
    0,
    {
      id: "files",
      type: "question",
      kind: "file",
      key: "files",
      label: "Documents",
      config: { multiple: false },
      validation: [
        { id: "types", type: "fileTypes", value: ["application/pdf"], message: "Upload a PDF" },
      ],
    },
    {
      id: "date",
      type: "question",
      kind: "date",
      key: "date",
      label: "Choose a date",
      validation: [
        {
          id: "dates",
          type: "dateIn",
          value: ["2026-10-04", "2026-10-05"],
          message: "Choose one of the available dates",
        },
      ],
    },
  );
  expect(validateFormDefinition(value).status).toBe("ready");
  question(value, "date").validation = [
    { id: "dates", type: "dateIn", value: ["2026-02-30"], message: "Choose a date" },
  ];
  expect(validateFormDefinition(value).diagnostics.some((issue) => issue.code === "date-in")).toBe(
    true,
  );
});

test("date default today is retained as runtime context and is not permitted on other kinds", () => {
  const value = form();
  value.blocks.splice(1, 0, {
    id: "date",
    type: "question",
    kind: "date",
    key: "date",
    label: "Date",
    default: { context: "today" },
  });
  expect(validateFormDefinition(value).status).toBe("ready");
  expect(question(value, "date").default).toEqual({ context: "today" });
  rejects((value) => {
    question(value, "name").default = { context: "today" };
  }, "default");
  Object.assign(question(value, "date"), { default: { context: "submittedAt" } });
  expect(validateFormDefinition(value).status).toBe("blocked");
});

test("calculated display names preserve empty strings and reject non-text values", () => {
  const value = form();
  value.blocks.push({
    id: "named-calculation",
    type: "calculated",
    name: "Annual amount",
    valueType: "number",
    expression: 0,
  });
  expect(validateFormDefinition(value).status).toBe("ready");
  Object.assign(value.blocks.at(-1)!, { name: "" });
  expect(validateFormDefinition(value).status).toBe("ready");
  Object.assign(value.blocks.at(-1)!, { name: 2 });
  expect(validateFormDefinition(value).status).toBe("blocked");
});

describe("confirmation and submission context semantics", () => {
  test("confirmation accepts informational content and rejects even hidden optional questions", () => {
    const value = form();
    value.blocks.push(
      {
        id: "receipt-heading",
        type: "content",
        kind: "heading",
        content: "What happens next",
        config: { level: 2 },
      },
      {
        id: "receipt",
        type: "content",
        kind: "paragraph",
        content: ["Reference: ", { context: "submissionReference" }],
      },
      {
        id: "next-steps",
        type: "content",
        kind: "list",
        content: "",
        config: { items: [{ id: "retain", content: "Keep your reference number" }] },
      },
    );
    expect(validateFormDefinition(value).status).toBe("ready");
    value.blocks.push({
      id: "too-late",
      type: "question",
      kind: "text",
      key: "late",
      label: "More information",
      visible: false,
      required: { value: false, message: "" },
    });

    const snapshot = structuredClone(value),
      result = validateFormDefinition(value);

    expect(result.status).toBe("blocked");
    expect(result.schema).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "confirmation-content",
        blockId: "too-late",
        path: ["blocks", value.blocks.length - 1],
      }),
    );
    expect(value).toEqual(snapshot);
    value.blocks.splice(value.blocks.length - 1, 0, {
      id: "later-questions",
      type: "page",
      role: "questions",
      title: "More information",
    });
    expect(
      validateFormDefinition(value).diagnostics.some(
        (issue) => issue.code === "confirmation-content",
      ),
    ).toBe(false);
  });

  test("submittedAt stays an unresolved date context and supports every native date display style", () => {
    for (const style of [undefined, "short", "medium", "long", "full"] as const) {
      const value = form();
      value.blocks.push({
        id: "submitted-date",
        type: "content",
        kind: "paragraph",
        content: [
          {
            context: "submittedAt",
            format: { type: "date", ...(style && { style }) },
            fallback: "Awaiting submission",
          },
        ],
      });
      value.blocks.push({
        id: "submission-year",
        type: "calculated",
        valueType: "number",
        expression: { op: "year", args: [{ context: "submittedAt" }] },
      });

      const snapshot = structuredClone(value),
        result = validateFormDefinition(value);

      expect(result).toMatchObject({ status: "ready", diagnostics: [] });
      expect(result.schema).toEqual(snapshot);
      expect(value).toEqual(snapshot);
    }
  });

  test("submission context format validation rejects mismatched output types", () => {
    const value = form();
    value.blocks.push({
      id: "submitted-number",
      type: "content",
      kind: "paragraph",
      content: [{ context: "submittedAt", format: { type: "number" } }],
    });
    expect(validateFormDefinition(value).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "format-type",
        blockId: "submitted-number",
        path: ["blocks", 8, "content", 0, "format"],
      }),
    );
    value.blocks[8] = {
      id: "reference-date",
      type: "content",
      kind: "paragraph",
      content: [{ context: "submissionReference", format: { type: "date" } }],
    };
    expect(validateFormDefinition(value).diagnostics).toContainEqual(
      expect.objectContaining({ code: "format-type", blockId: "reference-date" }),
    );
  });
});
