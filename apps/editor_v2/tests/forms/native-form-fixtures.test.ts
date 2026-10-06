import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { $createTextNode, $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import {
  nativeSemanticEqual,
  validateFormDefinition,
  type FormDefinitionV2,
  type QuestionBlock,
} from "../../src/forms/schema";
import { $native } from "../../src/forms/editor/native-state";
import { $isQuestionNode } from "../../src/forms/editor/nodes";
import { evaluate, Invalid, Missing, type RawAnswers } from "../helpers/native-fixture-interpreter";
import manifest from "../fixtures/forms/v2/manifest.json";

const read = (path: string): any =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

const fixture = (name: string): FormDefinitionV2 => read(`tests/fixtures/forms/v2/${name}.json`);

const source = (name: string) => read(`tests/fixtures/forms/source/${name}.expanded.json`);

const questions = (form: FormDefinitionV2) =>
  form.blocks.filter((block): block is QuestionBlock => block.type === "question");

const applications = [
  "reserve-society-name",
  "get-birth-certificate",
  "get-marriage-certificate",
  "get-death-certificate",
];

const allForms = [...applications, "severance", "pension", "nis"];

describe("seven full native form fixtures", () => {
  test("manifest pins native fixtures and independent source expectations", () => {
    expect(manifest.fixtures.map((entry) => entry.name)).toEqual(allForms);

    for (const entry of manifest.fixtures) {
      for (const evidence of entry.provenance)
        expect(
          createHash("sha256")
            .update(readFileSync(new URL(`../../${evidence.path}`, import.meta.url)))
            .digest("hex"),
        ).toBe(evidence.sha256);
      const form = fixture(entry.name);
      expect(questions(form)).toHaveLength(entry.nativeQuestionCount);
      expect(form.blocks.filter((block) => block.type === "page")).toHaveLength(entry.pageCount);
      expect(
        form.blocks.reduce(
          (total, block) => total + (block.type === "logic" ? block.rules.length : 0),
          0,
        ),
      ).toBe(entry.logicRuleCount);
    }

    expect(manifest.fixtures.slice(0, 4).map((entry) => entry.sourceControlCount)).toEqual([
      22, 36, 34, 26,
    ]);
  });

  for (const name of allForms)
    test(`${name}: native and Markdown round trips preserve every published property and real edits`, () => {
      const form = fixture(name),
        validation = validateFormDefinition(form, govbbFormEditor.nativeCapabilities);

      expect(validation.diagnostics).toEqual([]);
      expect(validation.status).toBe("ready");
      const imported = formSchemaToLexical(form, govbbFormEditor);
      expect(imported.diagnostics).toEqual([]);
      expect(imported.status).toBe("ready");

      if (imported.status !== "ready") throw Error("Fixture import failed");
      const editor = createHeadlessEditor(govbbFormEditor, imported.state);

      try {
        const exported = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
        expect(exported.diagnostics).toEqual([]);
        expect(nativeSemanticEqual(exported.schema, form)).toBe(true);

        const markdown = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor),
          restored = markdownToLexical(markdown, govbbFormEditor);

        expect(restored.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
        expect(restored.state).toBeDefined();

        if (!restored.state) throw Error("Fixture Markdown import failed");
        const reloaded = createHeadlessEditor(govbbFormEditor, restored.state);

        try {
          const result = lexicalToFormSchema(reloaded.getEditorState(), govbbFormEditor, reloaded);
          expect(result.diagnostics).toEqual([]);
          expect(nativeSemanticEqual(result.schema, form)).toBe(true);
        } finally {
          reloaded.dispose();
        }

        const first = questions(form)[0]!;
        editor.update(
          () => {
            const label = $getRoot()
              .getChildren()
              .find((node) => $isQuestionNode(node) && $native(node).owner === first.id);

            if (!$isQuestionNode(label)) throw Error("Missing editable label");
            label.clear().append($createTextNode("Edited fixture question"));
          },
          { discrete: true },
        );
        const edited = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
        expect(edited.diagnostics).toEqual([]);
        expect(edited.schema?.blocks.find((block) => block.id === first.id)).toMatchObject({
          label: "Edited fixture question",
          key: first.key,
        });
      } finally {
        editor.dispose();
      }
    });

  test("foreign block documents are rejected without discarding the original input", () => {
    const documents = [
      { title: "Imported form", blocks: [{ id: "question", type: "INPUT_TEXT" }] },
      { form: { id: "external-form", title: "Imported form", blocks: [] } },
    ];

    for (const original of documents) {
      const result = formSchemaToLexical(original, govbbFormEditor);
      expect(result.status).toBe("blocked");
      expect(result.diagnostics.some((issue) => issue.code === "schema-version")).toBe(true);

      if (result.status === "blocked") expect(result.recovery.original).toBe(original);
    }
  });

  for (const name of applications)
    test(`${name}: full original controls, messages, options, masks and page metadata are represented`, () => {
      const form = fixture(name),
        src = source(name),
        nativeQuestions = questions(form);

      expect(nativeQuestions.map((question) => question.id)).toEqual(
        src.steps.flatMap((step: any) => step.elements.map((field: any) => field.fieldId)),
      );

      for (const step of src.steps)
        for (const field of step.elements) {
          const question = nativeQuestions.find((question) => question.id === field.fieldId)!;
          expect(question.label).toEqual(field.label);

          if (field.hint !== undefined) expect(question.hint).toBe(field.hint);

          if (field.options)
            expect(
              question.options?.map((option) => ({ label: option.label, value: option.value })),
            ).toEqual(field.options);

          if (field.mask) expect(question.config).toMatchObject({ mask: field.mask });

          if (field.ui?.width) expect(question.config).toMatchObject({ width: field.ui.width });

          if (field.defaultValue !== undefined)
            expect(question.default).toEqual(field.defaultValue);

          const validations: Record<string, { value?: boolean; error?: string }> =
            field.validations ?? {};

          for (const [type, raw] of Object.entries(validations)) {
            if (type === "required") {
              expect(question.required?.value).toBe(raw.value);

              if (raw.error) expect(question.required?.message).toBe(raw.error);
            } else {
              const rule = question.validation?.find((rule) => rule.id === type);
              expect(rule).toBeDefined();

              if (raw.error) expect(rule?.message).toBe(raw.error);
            }
          }
        }

      expect(
        form.blocks.filter((block) => block.type === "page" && block.role === "review"),
      ).toHaveLength(1);
      expect(
        form.blocks.filter((block) => block.type === "page" && block.role === "confirmation"),
      ).toHaveLength(1);
      expect(
        form.blocks.some(
          (block) =>
            block.type === "content" && JSON.stringify(block.content).includes('"context":"today"'),
        ),
      ).toBe(true);
    });
});

function sourceMatches(behaviours: any[], values: RawAnswers, type: string): boolean {
  return (behaviours ?? [])
    .filter((behaviour) => behaviour.type === type)
    .every((behaviour) => values[behaviour.targetFieldId] === behaviour.value);
}

function compareSourceBranches(name: string, values: RawAnswers) {
  const form = fixture(name),
    src = source(name),
    actual = evaluate(form, values);

  for (const step of src.steps) {
    const pageVisible = sourceMatches(step.behaviours, values, "stepConditionalOn");
    expect(actual.visible[`page-${step.stepId}`]).toBe(pageVisible);

    for (const field of step.elements) {
      const active = pageVisible && sourceMatches(field.behaviours, values, "fieldConditionalOn");
      expect(actual.visible[field.fieldId]).toBe(active);

      if (active) {
        const optionalRules = (field.behaviours ?? []).filter(
          (behaviour: any) => behaviour.type === "optionalIf",
        );

        expect(actual.required[field.fieldId]).toBe(
          !!field.validations?.required?.value &&
            !(optionalRules.length > 0 && sourceMatches(optionalRules, values, "optionalIf")),
        );
      }
    }
  }

  return actual;
}

function baseAnswers(name: string): RawAnswers {
  return Object.fromEntries(
    source(name).steps.flatMap((step: any) =>
      step.elements.map((field: any) => [
        field.fieldId,
        field.htmlType === "show-hide"
          ? false
          : (field.options?.[0]?.value ??
            (field.htmlType === "number"
              ? 1
              : field.htmlType === "date"
                ? "2000-01-02"
                : "Example value")),
      ]),
    ),
  );
}

describe("independent application branch proof against frozen source", () => {
  test("society: every purpose, optional second/third names, restoration and native review", () => {
    const base = baseAnswers("reserve-society-name");

    for (const purpose of ["request-search", "reserve-name", "change-name", "reserve-name"]) {
      const result = compareSourceBranches("reserve-society-name", {
        ...base,
        "request-purpose": purpose,
        "society-name-2": "",
        "society-name-3": "",
      });

      expect(result.visible["current-society-name"]).toBe(purpose === "change-name");
      expect(result.required["society-name-2"]).toBe(false);
      expect(result.required["society-name-3"]).toBe(false);
      expect(result.review).not.toContain("society-name-2");
      expect(result.review).not.toContain("society-name-3");
    }
  });
  test("birth: all 32 saved routes, two conditional titles, NIS/passport branches and strict date bounds", () => {
    const evidence = read("tests/fixtures/forms/source/get-birth-certificate.cases.json");
    expect(evidence.scenarios).toHaveLength(32);

    for (const scenario of evidence.scenarios) {
      const result = compareSourceBranches("get-birth-certificate", {
        ...baseAnswers("get-birth-certificate"),
        ...scenario.answers,
      });

      expect(result.route).toEqual(scenario.route.map((page: string) => `page-${page}`));
      expect(result.titles["page-birth-details"]).toBe(
        scenario.answers["applying-for-yourself"] === "yes"
          ? "Provide your birth details"
          : "Provide the person's birth details",
      );
      expect(result.titles["page-parents"]).toBe(
        scenario.answers["applying-for-yourself"] === "yes"
          ? "Tell us your parents' names"
          : "Tell us their parents' names",
      );
      expect(result.visible["applicant-nid"]).toBe(true);
      expect(result.required["applicant-nid"]).toBe(!scenario.answers["passport-toggle"]);
    }

    const form = fixture("get-birth-certificate"),
      copies = questions(form).find((question) => question.id === "number-of-copies")!;

    expect(copies.default).toBe(1);
    expect(copies.validation).toContainEqual({
      id: "min",
      type: "minimum",
      value: 0,
      message: "This field must be greater than or equal to 0",
    });

    const today = evaluate(
      form,
      { ...baseAnswers("get-birth-certificate"), "birth-date-of-birth": "2026-10-04" },
      "2026-10-04",
    );

    expect(today.errors).toContainEqual({
      target: "birth-date-of-birth",
      message: "Date of birth must be in the past",
    });
  });
  test("marriage: all 32 source combinations and three independent passport restorations", () => {
    let cases = 0;

    for (const applying of ["yes", "no"])
      for (const relationship of ["parent", "other"])
        for (let toggles = 0; toggles < 8; toggles++) {
          const values = {
            ...baseAnswers("get-marriage-certificate"),
            "applying-for-yourself": applying,
            "relationship-to-married-persons": relationship,
            "passport-toggle": !!(toggles & 1),
            "husband-passport-toggle": !!(toggles & 2),
            "wife-passport-toggle": !!(toggles & 4),
          };

          const result = compareSourceBranches("get-marriage-certificate", values);
          expect(result.visible["page-reason-for-requesting"]).toBe(applying === "no");
          cases++;
        }

    for (const prefix of ["applicant", "husband", "wife"]) {
      const toggle = prefix === "applicant" ? "passport-toggle" : `${prefix}-passport-toggle`;

      const selected = compareSourceBranches("get-marriage-certificate", {
        ...baseAnswers("get-marriage-certificate"),
        [toggle]: true,
      });

      const restored = compareSourceBranches("get-marriage-certificate", {
        ...baseAnswers("get-marriage-certificate"),
        [toggle]: false,
      });

      expect(selected.required[`${prefix}-id-number`]).toBe(false);
      expect(restored.required[`${prefix}-id-number`]).toBe(true);
      expect(selected.visible[`${prefix}-passport-number`]).toBe(true);
      expect(restored.visible[`${prefix}-passport-number`]).toBe(false);
      cases++;
    }

    // The source matrix has 32 combinations and three independent passport restorations.
    expect(cases).toBe(35);
  });
  test("death: all 12 original evaluator snapshots match active, required and review identities", () => {
    const evidence = read("tests/fixtures/forms/source/get-death-certificate.source-cases.json");
    expect(evidence.fixtures).toHaveLength(12);

    for (const vector of evidence.fixtures) {
      const raw: RawAnswers = Object.assign({}, ...Object.values(vector.values));

      for (const [key, value] of Object.entries(raw))
        if (
          value &&
          typeof value === "object" &&
          "year" in value &&
          "month" in value &&
          "day" in value
        )
          raw[key] =
            `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;

      const form = fixture("get-death-certificate"),
        result = evaluate(form, raw);

      expect(
        questions(form)
          .filter((question) => result.visible[question.id])
          .map((question) => question.id),
      ).toEqual(vector.expectedActive);
      expect(
        questions(form)
          .filter((question) => result.visible[question.id] && result.required[question.id])
          .map((question) => question.id),
      ).toEqual(vector.expectedRequired);
      expect(result.review).toEqual(vector.expectedReview);
    }
  });
});

function close(
  actual: ReturnType<typeof evaluate>["values"][string] | undefined,
  expected: number | null,
): void {
  if (typeof actual === "number" && typeof expected === "number")
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
      Math.max(1e-9, Math.abs(expected) * 1e-12),
    );
  else expect(actual === expected).toBe(true);
}

const employment = (years: number, year = 2025, simpleAvg = 1000, period = "weekly") => ({
  employment: false,
  reason: "redundancy",
  startIso: `${year - years}-01-01`,
  endIso: `${year}-01-01`,
  simpleAvg,
  period,
});

describe("independent native calculator proof against saved source vectors", () => {
  test("pension: every frozen vector and missing, zero, invalid, equal/reversed-date cases", () => {
    const form = fixture("pension"),
      vectors = read("tests/fixtures/forms/source/pension-nis-vectors.json");

    for (const vector of vectors.pension) {
      const result = evaluate(form, vector.input);

      for (const key of [
        "months",
        "fullAnnual",
        "fullMonthly",
        "reducedAnnual",
        "reducedMonthly",
        "gratuity",
      ])
        close(result.values[key], vector.expected[key]);
      expect(result.visible["short-service-warning"]).toBe(vector.expected.serviceWarning);
    }

    const base = { startYear: 2000, startMonth: 1, endYear: 2020, endMonth: 1, salary: 60000 };
    expect(evaluate(form, base).values.fullAnnual).toBe(24000);
    expect(evaluate(form, { ...base, nopayMonths: 0 }).values.fullAnnual).toBe(24000);
    expect(evaluate(form, { ...base, nopayMonths: "invalid" }).values.fullAnnual).toBe(Invalid);
    expect(evaluate(form, { ...base, endYear: 2000 }).canEnterResult).toBe(false);
    expect(evaluate(form, { ...base, endYear: 1999 }).canEnterResult).toBe(false);
    expect(evaluate(form, { ...base, nopayMonths: 240 }).canEnterResult).toBe(false);
  });
  test("severance: service-year/pay/ceiling vectors and corrected Barbados calendar boundaries", () => {
    const form = fixture("severance"),
      vectors = read("tests/fixtures/forms/source/severance-vectors-utc.json");

    for (const vector of vectors.serviceYears) {
      const result = evaluate(form, employment(vector.years));

      if (vector.years === 0) {
        expect(result.canEnterResult).toBe(false);
        continue;
      }

      close(result.values.entitledWeeks, vector.weeks);
      expect(result.visible["pay-page"]).toBe(vector.eligible);

      if (vector.eligible) close(result.values.severance, vector.severance);
    }

    for (const vector of vectors.pay) {
      const result = evaluate(
        form,
        employment(vector.years, vector.year, vector.amount, vector.period),
      );

      if (vector.amount <= 0) {
        expect(result.canEnterResult).toBe(false);
        continue;
      }

      close(result.values.avgWeekly, vector.weekly);
      close(result.values.severance, vector.severance);
      expect(result.values.ceilingApplied).toBe(vector.ceilingApplied);
    }

    for (const vector of vectors.ceilingEdges) {
      const result = evaluate(form, employment(10, vector.year, vector.amount));
      close(result.values.avgWeekly, vector.weekly);
      expect(result.values.ceilingApplied).toBe(vector.ceilingApplied);
    }

    for (const vector of vectors.dates) {
      const result = evaluate(form, {
        ...employment(10),
        startIso: vector.startIso,
        endIso: vector.endIso,
      });

      if (typeof vector.years === "number" && vector.years >= 0 && vector.endIso >= vector.startIso)
        close(result.values.years, vector.years);
      else expect(result.canEnterResult).toBe(false);
    }

    expect(
      evaluate(form, { ...employment(2), startIso: "2020-03-01", endIso: "2022-03-01" }).values
        .years,
    ).toBe(2);
    expect(
      evaluate(form, { ...employment(2), startIso: "2020-02-29", endIso: "2022-02-28" }).values
        .years,
    ).toBe(1);
    expect(
      evaluate(form, { ...employment(2), startIso: "2020-02-29", endIso: "2022-03-01" }).values
        .years,
    ).toBe(2);
    expect(evaluate(form, employment(10, 2035, 5000)).values.avgWeekly).toBe(5000);
    expect(evaluate(form, { employment: true }).canEnterResult).toBe(true);
    expect(evaluate(form, { employment: false, reason: "other" }).canEnterResult).toBe(true);
  });
  test("NIS: both branches/all tiers, clear policy, rounding, cap ordering and invalidity floor", () => {
    const form = fixture("nis"),
      vectors = read("tests/fixtures/forms/source/pension-nis-vectors.json");

    for (const vector of vectors.nis) {
      const tiers: Record<string, { expected: Record<string, number> }> = vector.tiers;

      for (const [tier, data] of Object.entries(tiers)) {
        const result = evaluate(form, {
          earningsVary: true,
          goodMonth: vector.input.goodMonth,
          slowMonth: vector.input.slowMonth,
          goodMonths: vector.input.goodMonthsPerYear,
          tier,
        });

        close(result.values.annualIncome, vector.annualIncome);
        close(result.values.monthlyAverage, vector.monthlyAverage);

        for (const [key, expected] of Object.entries(vector.suggestions)) {
          if (typeof expected !== "number")
            throw Error("Reference vector must contain numeric suggestions");
          close(result.values[key], expected);
        }

        for (const [key, expected] of Object.entries(data.expected))
          close(result.values[key], expected);
        expect(result.visible["minimum-explanation"]).toBe(vector.minimumExplanation);
      }
    }

    const steady = evaluate(form, {
      earningsVary: false,
      usualMonth: 1500,
      goodMonth: 9000,
      slowMonth: 7000,
      goodMonths: 8,
      tier: "moderate",
    });

    expect(steady.values.monthlyAverage).toBe(1500);
    expect(steady.values.stronger).toBe(230);
    expect(steady.answers.goodMonth).toBe(Missing);
    expect(Object.hasOwn(steady.rawAfter, "goodMonth")).toBe(false);
    expect(evaluate(form, { ...steady.rawAfter, usualMonth: 1550 }).values.moderate).toBe(160);
    expect(evaluate(form, { ...steady.rawAfter, usualMonth: 6170 }).values.stronger).toBe(
      5360 * 0.1725,
    );
    expect(evaluate(form, { ...steady.rawAfter, usualMonth: 0 }).canEnterResult).toBe(false);
    expect(
      evaluate(form, {
        earningsVary: true,
        goodMonth: 4000,
        slowMonth: 2000,
        goodMonths: 1.5,
        tier: "moderate",
      }).canEnterResult,
    ).toBe(false);
    expect(form.title).toContain("unverified prototype");
  });
});

test("test interpreter injects date default today only for initial creation; clearing does not restore it", () => {
  const form: FormDefinitionV2 = {
    schemaVersion: 2,
    id: "date-default",
    title: "Date",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [
      { id: "page", type: "page", role: "questions", title: "Date" },
      {
        id: "date",
        type: "question",
        kind: "date",
        key: "date",
        label: "Date",
        default: { context: "today" },
      },
    ],
  };

  expect(evaluate(form, {}, "2026-10-04").answers.date).toBe("2026-10-04");
  expect(evaluate(form, { date: "" }, "2026-10-04").answers.date).toBe(Missing);
});
