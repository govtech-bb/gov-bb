import { expect, test } from "vitest";
import { formulaReferences, mapFormulaReferences } from "../../src/forms/core/formula";
import { referencesInSettings, remapKnownSettings } from "../../src/forms/core/references";
import { logicIssues } from "../../src/forms/adapters/ssb/capabilities";
import { finalizeLegacySsb } from "../../src/forms/adapters/ssb/finalize";
import type { Settings } from "../../src/forms/core/settings";

test("formula reference edits preserve quoted text, escapes and all non-reference bytes", () => {
  const expression = String.raw` "{{original-field}}" + '{{original-field}}' + "escaped \" {{original-field}}" + {{original-field}}  + {{score:total}} `;

  const mapped = mapFormulaReferences(expression, (key) =>
    key === "original-field" ? "copied-field" : key === "score:total" ? "copy:total" : key,
  );

  expect(mapped).toBe(
    String.raw` "{{original-field}}" + '{{original-field}}' + "escaped \" {{original-field}}" + {{copied-field}}  + {{copy:total}} `,
  );
  const references = formulaReferences(expression);
  expect(references.map((item) => item.field)).toEqual(["original-field", "score:total"]);

  for (const { field, start, end } of references)
    expect(expression.slice(start, end)).toBe(`{{${field}}}`);
  expect(mapFormulaReferences(expression, (field) => field)).toBe(expression);
});

test("unfinished formulas retain bytes and only complete references outside strings are remapped", () => {
  const cases = [
    [
      String.raw`{{original-field}} + "unfinished {{original-field}}`,
      String.raw`{{copied-field}} + "unfinished {{original-field}}`,
    ],
    [String.raw`'unfinished \' {{original-field}}`, String.raw`'unfinished \' {{original-field}}`],
    ["({{original-field}} + {{unfinished", "({{copied-field}} + {{unfinished"],
    [
      String.raw`"backslash \\" + {{original-field}}`,
      String.raw`"backslash \\" + {{copied-field}}`,
    ],
  ];

  for (const [original, expected] of cases)
    expect(mapFormulaReferences(original!, () => "copied-field")).toBe(expected!);
});

test("retained inactive and disabled calculation payloads enumerate and copy real refs without changing literal data", () => {
  const expression = '"{{original-field}}" + {{original-field}}';

  const settings: Settings = {
    actions: [
      {
        id: "inactive",
        type: "SHOW_BLOCKS",
        disabled: true,
        showBlocks: ["original-field"],
        calculate: { field: "score:total", operator: "FORMULA", expression },
        unknown: { expression },
      },
    ],
    unknown: { expression },
  };

  const original = JSON.stringify(settings);
  const references = referencesInSettings(settings);
  expect(references.map((reference) => [reference.kind, reference.value, reference.path])).toEqual([
    ["block", "original-field", ["actions", 0, "showBlocks", 0]],
    ["field", "score:total", ["actions", 0, "calculate", "field"]],
    ["field", "original-field", ["actions", 0, "calculate", "expression"]],
  ]);

  const mapped = remapKnownSettings(
    settings,
    new Map([
      ["original-field", "copied-field"],
      ["score", "copied-score"],
    ]),
  );

  expect(mapped).toEqual({
    ...settings,
    actions: [
      {
        id: "inactive",
        type: "SHOW_BLOCKS",
        disabled: true,
        showBlocks: ["copied-field"],
        calculate: {
          field: "copied-score:total",
          operator: "FORMULA",
          expression: '"{{original-field}}" + {{copied-field}}',
        },
        unknown: { expression },
      },
    ],
  });
  expect(JSON.stringify(settings)).toBe(original);
  expect(referencesInSettings(mapped).map((reference) => reference.value)).toEqual([
    "copied-field",
    "copied-score:total",
    "copied-field",
  ]);
});

test("SSB reference validation does not mistake quoted formula text for a missing field", () => {
  const schema = finalizeLegacySsb(
    [
      {
        id: "start",
        stepId: "start-page",
        pageType: "questions",
        confirmation: false,
        blocks: [
          {
            type: "calculated-fields",
            id: "score",
            fields: [{ key: "score:total", name: "Score", type: "TEXT", value: "" }],
          },
          {
            type: "logic",
            id: "rule",
            logicalOperator: "AND",
            conditionals: [{ id: "when", type: "SINGLE", field: "id", comparison: "IS_NOT_EMPTY" }],
            actions: [
              {
                id: "then",
                type: "CALCULATE",
                calculate: {
                  field: "score:total",
                  operator: "FORMULA",
                  expression: '"{{removed-field}}" + {{formName}}',
                },
              },
            ],
          },
        ],
      },
    ],
    {},
    "Formula",
    "Formula",
  );

  expect(logicIssues(schema)).toEqual([]);
  const rule = schema.pages[0]!.blocks[1]!;

  if (rule.type !== "logic") throw Error("Missing fixture rule");
  rule.actions[0]!.calculate!.expression += " + {{removed-field}}";
  expect(logicIssues(schema)).toEqual([
    {
      code: "missing-reference",
      where: "rule",
      message: "Choose a field or block that still exists in this form.",
    },
  ]);
});
