import { expect, test } from "vitest";
import { referencesInSettings, remapKnownSettings } from "./references";
import type { Settings } from "./settings";

test("reference enumeration distinguishes owned targets from literal answers and opaque draft data", () => {
  const draft: Settings = {
    conditionals: [
      {
        type: "GROUP",
        conditionals: [
          { field: "choice", value: ["yes", "no"] },
          { field: "choice", value: "yes", valueIsLiteral: true },
          { field: "count", value: { field: "minimum" } },
        ],
      },
    ],
    actions: [
      {
        type: "CHANGE_LABEL",
        changeLabel: { target: "answer", text: "answer {{minimum}}" },
        showBlocks: ["retained-target"],
        jumpToPage: "next-page",
        calculate: {
          field: "totals:sum",
          value: { field: "count" },
          expression: "{{count}} + {{totals:sum}} + (",
        },
      },
    ],
    calculatedFields: [{ value: { field: "minimum" } }],
    applicantEmail: { question: "email" },
    conditionalTitle: [{ field: "choice", value: { options: ["yes"] }, text: "yes" }],
    opaque: { field: "not-a-reference", text: "{{count}}" },
  };

  const original = structuredClone(draft);
  const references = referencesInSettings(draft, { choiceFields: new Set(["choice"]) });
  expect(references.filter(({ kind }) => kind === "option").map(({ value }) => value)).toEqual([
    "yes",
    "no",
    "yes",
  ]);
  expect(references.find(({ value }) => value === "retained-target")).toEqual({
    kind: "block",
    value: "retained-target",
    path: ["actions", 0, "showBlocks", 0],
  });
  expect(references.find(({ value }) => value === "next-page")?.kind).toBe("page");
  expect(
    references.filter(({ path }) => path.at(-1) === "expression").map(({ value }) => value),
  ).toEqual(["count", "totals:sum"]);
  expect(references.some(({ value }) => value === "not-a-reference")).toBe(false);
  expect(references.some(({ path }) => path.includes("text"))).toBe(false);
  expect(draft).toEqual(original);
});

test("two remapped fragments keep separate internal targets and preserve outside references and submitted values", () => {
  const fragment: Settings = {
    conditionals: [{ field: "grouped-choice", value: "group-option" }],
    actions: [
      {
        changeLabel: { target: "answer", text: "grouped-choice" },
        requireAnswer: "external-question",
        calculate: { field: "total:sum", expression: "{{answer}} + {{external-question}} + (" },
      },
    ],
    optionValue: "group-option",
    opaque: { field: "answer" },
  };

  const copy = (suffix: string) =>
    remapKnownSettings(
      fragment,
      new Map([
        ["grouped-choice", `choice-${suffix}`],
        ["answer", `answer-${suffix}`],
        ["total", `total-${suffix}`],
      ]),
      {
        choiceFields: new Set(["grouped-choice"]),
        optionAliases: new Map([["group-option", `option-${suffix}`]]),
      },
    );

  const first = copy("one"),
    second = copy("two");

  expect(first.conditionals).toEqual([{ field: "choice-one", value: "option-one" }]);
  expect(second.conditionals).toEqual([{ field: "choice-two", value: "option-two" }]);
  expect(first.actions).toEqual([
    {
      changeLabel: { target: "answer-one", text: "grouped-choice" },
      requireAnswer: "external-question",
      calculate: {
        field: "total-one:sum",
        expression: "{{answer-one}} + {{external-question}} + (",
      },
    },
  ]);
  expect(first.optionValue).toBe("group-option");
  expect(first.opaque).toEqual({ field: "answer" });
  expect(fragment.conditionals).toEqual([{ field: "grouped-choice", value: "group-option" }]);
});
