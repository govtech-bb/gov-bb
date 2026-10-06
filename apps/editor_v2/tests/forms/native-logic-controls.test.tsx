import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { $native } from "../../src/forms/editor/native-state";
import {
  $nativeTargets,
  $setNativeWidget,
  changeCondition,
  expressionKinds,
  newExpression,
  type NativeTargets,
  type ConditionKind,
} from "../../src/forms/features/logic/native-authoring";
import {
  NativeActionEditor,
  NativeConditionEditor,
  NativeDisplayReferenceEditor,
  NativeExpressionEditor,
  NativeRichTextEditor,
} from "../../src/forms/features/logic/native-controls";
import {
  $mentionsIn,
  $nativeReference,
  $setNativeReference,
} from "../../src/forms/features/mentions/node";
import type {
  AnyFormDefinition,
  Expression,
  Condition,
  LogicAction,
  RichText,
} from "../../src/forms/schema/types";

const targets: NativeTargets = {
  questions: [
    { value: "amount", label: "Amount", kind: "number", options: [] },
    {
      value: "choice",
      label: "Choice",
      kind: "choice",
      options: [{ value: "one", label: "First option" }],
    },
  ],
  calculated: [{ value: "total", label: "Total" }],
  pages: [{ value: "page", label: "Questions" }],
  visibility: [
    { value: '"amount"', label: "Amount", target: "amount" },
    {
      value: '{"question":"choice","option":"one"}',
      label: "Choice — First option",
      target: { question: "choice", option: "one" },
    },
  ],
};

test("compatible condition changes retain authored operands, scopes and child conditions", () => {
  const original: Condition = {
    op: "eq",
    left: { answer: "amount", scope: "current" },
    right: { op: "multiply", args: [{ value: "total", scope: "form" }, 0.05] },
  };

  const before = structuredClone(original);

  for (const op of ["ne", "gt", "gte", "lt", "lte"] satisfies ConditionKind[])
    expect(changeCondition(original, op)).toEqual({ ...original, op });

  const group: Condition = {
    op: "all",
    conditions: [original, { op: "not", condition: { op: "empty", value: { answer: "choice" } } }],
  };

  expect(changeCondition(group, "any")).toEqual({ ...group, op: "any" });
  expect(changeCondition(changeCondition(group, "any"), "all")).toEqual(group);
  expect(original).toEqual(before);
});

test("condition changes preserve unchanged kinds and reset incompatible shapes", () => {
  const selected: Condition = { op: "selected", question: "choice", option: "one", scope: "form" };
  expect(changeCondition(selected, "selected")).toEqual(selected);
  expect(changeCondition(selected, "empty")).toEqual({ op: "empty", value: { answer: "" } });
  expect(changeCondition(selected, "always")).toBe(true);
  expect(changeCondition(true, "never")).toBe(false);
});

test("all native expression operators have visual controls, including lookup, rounding and nested dates", () => {
  for (const [kind] of expressionKinds) {
    const value = newExpression(kind);
    const before = structuredClone(value);

    const rendered = renderToStaticMarkup(
      <NativeExpressionEditor value={value} targets={targets} onChange={() => {}} />,
    );

    expect(rendered).toContain("Value source");
    expect(rendered).not.toContain("textarea");
    expect(value).toEqual(before);
  }

  const lookup: Expression = {
    op: "lookup",
    args: [{ op: "year", args: [{ context: "today" }] }],
    entries: [
      {
        key: 2026,
        value: {
          op: "round",
          args: [{ op: "multiply", args: [{ answer: "amount", scope: "form" }, 0.15] }],
          increment: 10,
          ties: "towardPositiveInfinity",
        },
      },
    ],
    fallback: { answer: "amount" },
  };

  const html = renderToStaticMarkup(
    <NativeExpressionEditor value={lookup} targets={targets} onChange={() => {}} />,
  );

  expect(html).toContain("Lookup row 1");
  expect(html).toContain("Round to the nearest");
  expect(html).toContain("When no row matches");
  expect(html).toContain("Whole form");
});

test("conditions, false actions and rich reference formats are editable as structured controls", () => {
  const condition = renderToStaticMarkup(
    <NativeConditionEditor
      value={{
        op: "all",
        conditions: [
          { op: "selected", question: "choice", option: "one" },
          { op: "not", condition: { op: "empty", value: { answer: "amount" } } },
        ],
      }}
      targets={targets}
      onChange={() => {}}
    />,
  );

  expect(condition).toContain("Selected option");
  expect(condition).toContain("Remove condition 2");

  const action = renderToStaticMarkup(
    <NativeActionEditor
      value={{ type: "setRequired", target: "amount", value: false }}
      targets={targets}
      onChange={() => {}}
    />,
  );

  expect(action).toContain('value="false" selected=""');

  const mention = renderToStaticMarkup(
    <NativeDisplayReferenceEditor
      value={{
        value: "total",
        scope: "form",
        format: { type: "currency", currency: "BBD", fractionDigits: 2 },
        fallback: "Not available",
      }}
      targets={targets}
      onChange={() => {}}
    />,
  );

  expect(mention).toContain("Currency code");
  expect(mention).toContain('value="BBD"');
  expect(mention).toContain("Decimal places");
  expect(mention).toContain("Not available");
});

test("malformed source values stay repairable without crashing native authoring controls", () => {
  const malformed = {
    expression: 0,
    condition: true,
    lookup: { op: "lookup", args: [0], entries: [], fallback: 0 },
    action: { type: "setVisible", targets: [], value: true },
    text: [],
  } satisfies {
    expression: Expression;
    condition: Condition;
    lookup: Expression;
    action: LogicAction;
    text: RichText;
  };

  Object.assign(malformed, {
    expression: null,
    condition: null,
    lookup: { op: "lookup", args: [], entries: null, fallback: 0 },
    action: { type: "setVisible", targets: null, value: true },
    text: [null],
  });

  const examples = [
    <NativeExpressionEditor value={malformed.expression} targets={targets} onChange={() => {}} />,
    <NativeExpressionEditor value={malformed.lookup} targets={targets} onChange={() => {}} />,
    <NativeConditionEditor value={malformed.condition} targets={targets} onChange={() => {}} />,
    <NativeActionEditor value={malformed.action} targets={targets} onChange={() => {}} />,
    <NativeRichTextEditor
      label="Text"
      value={malformed.text}
      targets={targets}
      onChange={() => {}}
    />,
  ];

  for (const component of examples)
    expect(renderToStaticMarkup(component)).toContain("needs repair");
});

const form: AnyFormDefinition = {
  schemaVersion: 2,
  id: "logic-controls",
  title: "Logic controls",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "preview", hiddenAnswers: "retain" },
  blocks: [
    { id: "page", type: "page", role: "questions", title: "Questions" },
    { id: "amount", type: "question", kind: "number", key: "amount", label: "Amount" },
    {
      id: "toggle",
      type: "question",
      kind: "boolean",
      key: "toggle",
      label: "Use an alternative",
      default: false,
    },
    {
      id: "choice",
      type: "question",
      kind: "choice",
      key: "choice",
      label: "Choice",
      config: { selection: "single" },
      options: [{ id: "one", label: "First option", value: 0 }],
    },
    {
      id: "other-choice",
      type: "question",
      kind: "choice",
      key: "otherChoice",
      label: "Other choice",
      config: { selection: "single" },
      options: [{ id: "one", label: "Another option", value: false }],
    },
    {
      id: "total",
      type: "calculated",
      valueType: "number",
      expression: { op: "multiply", args: [{ answer: "amount" }, 2] },
    },
    {
      id: "rules",
      type: "logic",
      rules: [
        {
          id: "optional",
          when: { op: "eq", left: { answer: "toggle" }, right: false },
          actions: [{ type: "setRequired", target: "amount", value: false }],
        },
      ],
    },
    { id: "confirmation", type: "page", role: "confirmation", title: "Confirmation" },
    { id: "result", type: "content", kind: "paragraph", content: ["Total: ", { value: "total" }] },
  ],
};

test("native control writes and mention settings change the exported form without stale payloads", () => {
  const imported = formSchemaToLexical(form, govbbFormEditor);
  expect(imported.status).toBe("ready");

  if (imported.status !== "ready") return;
  const editor = createHeadlessEditor(govbbFormEditor, imported.state);

  try {
    const expression: Expression = {
      op: "round",
      args: [{ op: "multiply", args: [{ answer: "amount" }, 1.5] }],
      increment: 10,
      ties: "towardPositiveInfinity",
    };

    editor.update(
      () => {
        const nodes = $getRoot().getChildren();
        const calculated = nodes.find((node) => $native(node).calculated?.id === "total")!;
        $setNativeWidget(calculated.getKey(), {
          ...$native(calculated).calculated!,
          expression,
          submit: false,
        });
        const logic = nodes.find((node) => $native(node).logic?.id === "rules")!;
        $setNativeWidget(logic.getKey(), {
          ...$native(logic).logic!,
          rules: [
            {
              id: "optional",
              enabled: false,
              when: { op: "eq", left: { answer: "toggle" }, right: false },
              actions: [{ type: "setRequired", target: "amount", value: false }],
            },
          ],
        });
        const mention = $mentionsIn($getRoot())[0]!;
        $setNativeReference(mention, {
          value: "total",
          scope: "form",
          format: { type: "currency", currency: "BBD", fractionDigits: 2 },
          fallback: "Unavailable",
        });
      },
      { discrete: true },
    );
    const exported = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
    expect(exported.diagnostics).toEqual([]);
    expect(exported.status).toBe("ready");
    expect(exported.schema?.blocks.find((block) => block.id === "total")).toMatchObject({
      expression,
      submit: false,
    });
    expect(exported.schema?.blocks.find((block) => block.id === "rules")).toMatchObject({
      rules: [
        {
          id: "optional",
          enabled: false,
          actions: [{ type: "setRequired", target: "amount", value: false }],
        },
      ],
    });
    expect(exported.schema?.blocks.at(-1)).toMatchObject({
      content: [
        "Total: ",
        {
          value: "total",
          scope: "form",
          format: { type: "currency", currency: "BBD", fractionDigits: 2 },
          fallback: "Unavailable",
        },
      ],
    });
    editor.read(() => {
      const options = $nativeTargets().visibility.filter(
        (item) => typeof item.target !== "string" && "option" in item.target,
      );

      expect(options.map((option) => option.target)).toEqual([
        { question: "choice", option: "one" },
        { question: "other-choice", option: "one" },
      ]);
      expect($nativeReference($mentionsIn($getRoot())[0]!)).toMatchObject({
        scope: "form",
        fallback: "Unavailable",
      });
    });
  } finally {
    editor.dispose();
  }
});

test("unfinished native controls remain in the editable state while runnable export is blocked", () => {
  const imported = formSchemaToLexical(form, govbbFormEditor);
  expect(imported.status).toBe("ready");

  if (imported.status !== "ready") return;
  const editor = createHeadlessEditor(govbbFormEditor, imported.state);

  try {
    editor.update(
      () => {
        const logic = $getRoot()
          .getChildren()
          .find((node) => $native(node).logic?.id === "rules")!;

        $setNativeWidget(logic.getKey(), {
          ...$native(logic).logic!,
          rules: [
            {
              id: "unfinished",
              when: { op: "all", conditions: [] },
              actions: [{ type: "setRequired", target: "", value: false }],
            },
          ],
        });
      },
      { discrete: true },
    );
    const exported = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
    expect(exported.status).toBe("blocked");
    expect(exported.diagnostics.length).toBeGreaterThan(0);
    editor.read(() => {
      const logic = $getRoot()
        .getChildren()
        .find((node) => $native(node).logic?.id === "rules")!;

      expect($native(logic).logic?.rules[0]?.when).toEqual({ op: "all", conditions: [] });
    });
  } finally {
    editor.dispose();
  }
});
