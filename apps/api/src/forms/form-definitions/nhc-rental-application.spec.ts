import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  evaluateFormConditions,
  resolveConditionalMarkdown,
  resolveFieldHint,
  resolveFieldLabel,
  type StepScopedValues,
} from "@govtech-bb/form-conditions";
import {
  serviceContractRecipeSchema,
  type Primitive,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { validateField } from "@govtech-bb/form-validation";
import { getCatalog, hydrateForm } from "@govtech-bb/form-builder";

// The NHC rental home or house lot form (#2913) routes almost entirely on
// stepConditionalOn / fieldConditionalOn gates, and it stops applicants with a
// `scaleBy` income cap and `^yes$` patterns. validate-recipes and
// recipe-invariants.spec.ts check only the file's shape, not that the routes
// and stops are the ones NHC asked for, so this spec pins them on the hydrated
// contract the applicant is served.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/nhc-rental-application.json",
);

type Rule = {
  value?: unknown;
  error?: string;
  scaleBy?: {
    referenceFieldId: string;
    targetStepId?: string;
    factors: Record<string, number>;
  };
};
type Field = Primitive & { validations?: Record<string, Rule | undefined> };

async function readRaw(): Promise<string> {
  return fs.readFile(RECIPE_PATH, "utf8");
}

// Hydrated once: every test reads the same recipe.
let hydrated: Promise<ServiceContract> | undefined;
function contract(): Promise<ServiceContract> {
  hydrated ??= readRaw().then(
    (raw) =>
      hydrateForm(
        serviceContractRecipeSchema.parse(JSON.parse(raw)),
        getCatalog(),
      ) as unknown as ServiceContract,
  );
  return hydrated;
}

async function step(stepId: string) {
  const s = (await contract()).steps.find((x) => x.stepId === stepId);
  if (!s) throw new Error(`step "${stepId}" is missing`);
  return s;
}

async function field(stepId: string, fieldId: string): Promise<Field> {
  const f = (await step(stepId)).elements.find((e) => e.fieldId === fieldId);
  if (!f) throw new Error(`field "${stepId}.${fieldId}" is missing`);
  return f as Field;
}

function gates(
  behaviours: readonly unknown[] | undefined,
  type: string,
): Record<string, unknown>[] {
  return ((behaviours ?? []) as Record<string, unknown>[]).filter(
    (b) => b.type === type,
  );
}

// MIME types only: the shared fileTypes rule accepts .jpg and .jpeg for
// image/jpeg (#2708), so the recipe needs no extension list.
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

// --- answer sets -----------------------------------------------------------

function answers(opts: {
  type: "rental-home" | "house-lot";
  joint: boolean;
  income: string;
  coIncome?: string;
  othersLiveThere?: "yes" | "no";
  maritalStatus?: string;
  country?: string;
  coCountry?: string;
  sameAddress?: "yes" | "no";
}): StepScopedValues {
  return {
    "application-type": { "application-type": opts.type },
    "applying-with": {
      "applying-with": opts.joint ? "with-another-person" : "on-my-own",
    },
    eligibility: { citizen: "yes" },
    income: {
      "income-type": opts.income,
      ...(opts.coIncome ? { "co-applicant-income-type": opts.coIncome } : {}),
    },
    "applicant-details": {
      "marital-status": opts.maritalStatus ?? "single",
      "country-of-residence": opts.country ?? "barbados",
    },
    "co-applicant-details": {
      "co-applicant-country-of-residence": opts.coCountry ?? "barbados",
    },
    "co-applicant-contact": {
      "co-applicant-same-address": opts.sameAddress ?? "yes",
    },
    household: { "anyone-else": opts.othersLiveThere ?? "no" },
  };
}

async function activeSteps(values: StepScopedValues): Promise<string[]> {
  const c = await contract();
  const result = evaluateFormConditions(c, values);
  return c.steps
    .map((s) => s.stepId)
    .filter((id) => result.activeStepIds.has(id));
}

async function activeFields(
  stepId: string,
  values: StepScopedValues,
): Promise<Set<string>> {
  const result = evaluateFormConditions(await contract(), values);
  return result.activeFieldIds.get(stepId) ?? new Set();
}

// --- removed questions -------------------------------------------------------

it.each([
  /tamis/i,
  /permanent-resident/,
  /fortnight/i,
  /employment-status/,
  /adults-count|children-count/,
  /nhc-debt/,
])("no longer asks anything matching %s", async (pattern) => {
  expect(await readRaw()).not.toMatch(pattern);
});

it("asks the steps in the spec's order", async () => {
  expect((await contract()).steps.map((s) => s.stepId)).toEqual([
    "application-type",
    "applying-with",
    "eligibility",
    "income",
    "applicant-details",
    "applicant-contact",
    "applicant-work",
    "co-applicant-details",
    "co-applicant-contact",
    "co-applicant-work",
    "housing",
    "money-owed",
    "household",
    "other-occupants",
    "upload-your-documents",
    "declaration",
    "submission-confirmation",
  ]);
});

// --- monthly income cap (scaleBy) --------------------------------------------

// There is no recipe guard for `scaleBy` yet (#3664), and an answer with no
// factor fails closed — it would block every applicant who picks it. So every
// `scaleBy` in this form must name a required field on its own step whose
// option values are exactly the factor keys.
it("gives every scaleBy a required reference with a factor for each option", async () => {
  const c = await contract();
  let checked = 0;
  for (const s of c.steps) {
    for (const f of s.elements as Field[]) {
      for (const rule of Object.values(f.validations ?? {})) {
        if (!rule?.scaleBy) continue;
        checked += 1;
        const { referenceFieldId, targetStepId, factors } = rule.scaleBy;
        const refStep = targetStepId
          ? c.steps.find((x) => x.stepId === targetStepId)
          : s;
        const ref = refStep?.elements.find(
          (e) => e.fieldId === referenceFieldId,
        ) as Field | undefined;
        expect(ref, `${f.fieldId} → ${referenceFieldId}`).toBeDefined();
        expect(ref?.validations?.required?.value, referenceFieldId).toBe(true);
        expect(Object.keys(factors).sort()).toEqual(
          (ref?.options ?? []).map((o) => o.value).sort(),
        );
        for (const factor of Object.values(factors)) {
          expect(factor).toBeGreaterThan(0);
        }
      }
    }
  }
  expect(checked).toBe(2);
});

describe.each([
  ["", "you"],
  ["co-applicant-", "they"],
])("income cap (%s)", (prefix, who) => {
  const frequencyId = `${prefix}income-frequency`;

  it("scales the amount to a month: weekly x52/12, twice a month x2, monthly x1", async () => {
    const amount = await field("income", `${prefix}income-amount`);
    expect(amount.validations?.max).toMatchObject({
      value: 3000,
      error: `The amount ${who} receive is more than BDS $3,000 a month`,
      scaleBy: {
        referenceFieldId: frequencyId,
        factors: { weekly: 4.333333, "twice-a-month": 2, monthly: 1 },
      },
    });
  });

  it.each([
    // 3000 / (52 / 12) = 692.307…, so 692.30 a week is the most that passes.
    ["weekly", "692.30", "692.31"],
    ["twice-a-month", "1500", "1500.01"],
    ["monthly", "3000", "3000.01"],
  ])(
    "lets %s pay of %s through and stops %s",
    async (frequency, atLimit, overLimit) => {
      const amount = await field("income", `${prefix}income-amount`);
      const stepValues = { [frequencyId]: frequency };
      const values = { income: stepValues };
      expect(validateField(amount, atLimit, values, stepValues)).toEqual([]);
      expect(validateField(amount, overLimit, values, stepValues)).toEqual([
        `The amount ${who} receive is more than BDS $3,000 a month`,
      ]);
    },
  );

  it("asks the income type and frequency as radios", async () => {
    for (const id of [`${prefix}income-type`, frequencyId]) {
      expect((await field("income", id)).htmlType, id).toBe("radio");
    }
    expect(
      (await field("income", frequencyId)).options?.map((o) => o.label),
    ).toEqual(["Weekly", "Twice a month", "Monthly"]);
  });

  it("uses the BDS $ money field for the amount", async () => {
    const amount = await field("income", `${prefix}income-amount`);
    expect(amount.ui?.prefix).toBe("BDS $");
  });
});

it("words the amount question and hint for the income type", async () => {
  const amount = await field("income", "income-amount");
  const at = (income: string) => ({ income: { "income-type": income } });
  expect(resolveFieldLabel(amount, at("government-employee"))).toBe(
    "How much are you paid?",
  );
  expect(resolveFieldLabel(amount, at("self-employed"))).toBe(
    "How much do you earn?",
  );
  expect(resolveFieldLabel(amount, at("retired"))).toBe(
    "How much pension do you receive?",
  );
  expect(resolveFieldHint(amount, at("private-sector-employee"))).toBe(
    "In BDS dollars. Give the amount before deductions.",
  );
  expect(resolveFieldHint(amount, at("retired"))).toBe("In BDS dollars");
});

// --- eligibility stops -------------------------------------------------------

it.each([
  ["eligibility", "citizen", "You must be a citizen of Barbados to apply"],
  [
    "eligibility",
    "co-applicant-citizen",
    "The person applying with you must be a citizen of Barbados",
  ],
  [
    "income",
    "combined-income-eligible",
    "Together, you receive more than BDS $3,000 a month",
  ],
])("stops on %s.%s unless the answer is yes", async (stepId, fieldId, msg) => {
  const f = await field(stepId, fieldId);
  expect(validateField(f, "no", {})).toEqual([msg]);
  expect(validateField(f, "yes", {})).toEqual([]);
});

it.each([
  ["eligibility", "citizen-notice", "citizen", false],
  ["eligibility", "co-applicant-citizen-notice", "co-applicant-citizen", true],
  ["income", "combined-income-notice", "combined-income-eligible", true],
])(
  "shows %s.%s on a No answer",
  async (stepId, noticeId, questionId, jointOnly) => {
    const notice = await field(stepId, noticeId);
    expect(notice.variant).toBe("warning");
    const conditions = gates(notice.behaviours, "fieldConditionalOn");
    expect(conditions).toContainEqual(
      expect.objectContaining({
        targetFieldId: questionId,
        operator: "equal",
        value: "no",
      }),
    );
    // A leftover "no" must not show the warning once the applicant changes
    // to applying on their own, so the joint question's gate is repeated.
    expect(conditions.some((c) => c.targetFieldId === "applying-with")).toBe(
      jointOnly,
    );
  },
);

it("asks the second person's income and the combined total for joint applications only", async () => {
  const single = await activeFields(
    "income",
    answers({ type: "rental-home", joint: false, income: "retired" }),
  );
  const joint = await activeFields(
    "income",
    answers({
      type: "rental-home",
      joint: true,
      income: "retired",
      coIncome: "retired",
    }),
  );
  for (const id of [
    "co-applicant-income-type",
    "co-applicant-income-amount",
    "co-applicant-income-frequency",
    "combined-income-eligible",
  ]) {
    expect(single.has(id), id).toBe(false);
    expect(joint.has(id), id).toBe(true);
  }
});

// --- step routing ------------------------------------------------------------

it.each(["co-applicant-details", "co-applicant-contact", "co-applicant-work"])(
  "gates %s on applying with another person",
  async (stepId) => {
    expect(
      gates((await step(stepId)).behaviours, "stepConditionalOn"),
    ).toContainEqual(
      expect.objectContaining({
        targetStepId: "applying-with",
        targetFieldId: "applying-with",
        operator: "equal",
        value: "with-another-person",
      }),
    );
  },
);

it.each([
  ["applicant-work", "income-type"],
  ["co-applicant-work", "co-applicant-income-type"],
])("hides %s when %s is retired", async (stepId, fieldId) => {
  expect(
    gates((await step(stepId)).behaviours, "stepConditionalOn"),
  ).toContainEqual(
    expect.objectContaining({
      targetStepId: "income",
      targetFieldId: fieldId,
      operator: "notEqual",
      value: "retired",
    }),
  );
});

it.each(["household", "other-occupants"])(
  "shows %s for a rental home only",
  async (stepId) => {
    expect(
      gates((await step(stepId)).behaviours, "stepConditionalOn"),
    ).toContainEqual(
      expect.objectContaining({
        targetStepId: "application-type",
        targetFieldId: "application-type",
        operator: "equal",
        value: "rental-home",
      }),
    );
  },
);

it("lists other occupants only when someone else will live there, up to 20", async () => {
  const s = await step("other-occupants");
  expect(gates(s.behaviours, "stepConditionalOn")).toContainEqual(
    expect.objectContaining({
      targetStepId: "household",
      targetFieldId: "anyone-else",
      operator: "equal",
      value: "yes",
    }),
  );
  expect(gates(s.behaviours, "repeatable")).toEqual([
    expect.objectContaining({ min: 1, max: 20 }),
  ]);
});

it.each([
  ["9", []],
  ["0", []],
  ["9.5", ["Enter age as a whole number, like 9"]],
  ["250", ["Age must be 120 or less"]],
])("checks an occupant age of %s", async (age, errors) => {
  const f = await field("other-occupants", "occupant-age");
  expect(validateField(f, age, {})).toEqual(errors);
});

it("routes a single employed applicant for a rental home past the joint steps", async () => {
  expect(
    await activeSteps(
      answers({
        type: "rental-home",
        joint: false,
        income: "government-employee",
        othersLiveThere: "yes",
      }),
    ),
  ).toEqual([
    "application-type",
    "applying-with",
    "eligibility",
    "income",
    "applicant-details",
    "applicant-contact",
    "applicant-work",
    "housing",
    "money-owed",
    "household",
    "other-occupants",
    "upload-your-documents",
    "declaration",
    "submission-confirmation",
  ]);
});

it("routes a joint house-lot application with a retired second applicant", async () => {
  expect(
    await activeSteps(
      answers({
        type: "house-lot",
        joint: true,
        income: "self-employed",
        coIncome: "retired",
      }),
    ),
  ).toEqual([
    "application-type",
    "applying-with",
    "eligibility",
    "income",
    "applicant-details",
    "applicant-contact",
    "applicant-work",
    "co-applicant-details",
    "co-applicant-contact",
    "housing",
    "money-owed",
    "upload-your-documents",
    "declaration",
    "submission-confirmation",
  ]);
});

it("skips the work step for a retired applicant", async () => {
  expect(
    await activeSteps(
      answers({ type: "house-lot", joint: false, income: "retired" }),
    ),
  ).not.toContain("applicant-work");
});

it("asks employees and the self-employed different work questions", async () => {
  const employed = await activeFields(
    "applicant-work",
    answers({
      type: "house-lot",
      joint: false,
      income: "private-sector-employee",
    }),
  );
  const selfEmployed = await activeFields(
    "applicant-work",
    answers({ type: "house-lot", joint: false, income: "self-employed" }),
  );
  for (const id of ["employer-name", "job-title", "employment-length"]) {
    expect(employed.has(id), id).toBe(true);
    expect(selfEmployed.has(id), id).toBe(false);
  }
  for (const id of [
    "self-employed-work",
    "business-name",
    "self-employment-length",
  ]) {
    expect(employed.has(id), id).toBe(false);
    expect(selfEmployed.has(id), id).toBe(true);
  }
  expect(
    (await field("applicant-work", "business-name")).validations?.required
      ?.value,
  ).toBe(false);
});

// --- personal and contact details ---------------------------------------------

it("asks marital status as radios with the spec's 5 options", async () => {
  for (const [stepId, id] of [
    ["applicant-details", "marital-status"],
    ["co-applicant-details", "co-applicant-marital-status"],
  ]) {
    const f = await field(stepId, id);
    expect(f.htmlType, id).toBe("radio");
    expect(f.options?.map((o) => o.value)).toEqual([
      "single",
      "married",
      "widowed",
      "divorced",
      "separated",
    ]);
  }
});

it("asks for the country by name only when it is Other", async () => {
  const f = await field("applicant-details", "other-country-of-residence");
  expect(gates(f.behaviours, "fieldConditionalOn")).toEqual([
    expect.objectContaining({
      targetFieldId: "country-of-residence",
      value: "other",
    }),
  ]);
});

it("asks for a parish and a Barbados postcode only for an address in Barbados", async () => {
  const at = (country: string) =>
    activeFields(
      "applicant-contact",
      answers({
        type: "house-lot",
        joint: false,
        income: "retired",
        country,
      }),
    );
  const barbados = await at("barbados");
  const abroad = await at("other");
  expect(barbados.has("parish")).toBe(true);
  expect(barbados.has("postcode")).toBe(true);
  expect(barbados.has("overseas-postcode")).toBe(false);
  // Abroad: no parish, and a free-text postal code instead of the Barbados
  // postcode pattern, which would refuse a real foreign postal code.
  expect(abroad.has("parish")).toBe(false);
  expect(abroad.has("postcode")).toBe(false);
  expect(abroad.has("overseas-postcode")).toBe(true);
  expect(
    (await field("applicant-contact", "overseas-postcode")).validations
      ?.pattern,
  ).toBeUndefined();
});

it("asks the second person for an overseas postal code when they live abroad", async () => {
  const fields = await activeFields(
    "co-applicant-contact",
    answers({
      type: "house-lot",
      joint: true,
      income: "retired",
      coIncome: "retired",
      sameAddress: "no",
      coCountry: "other",
    }),
  );
  expect(fields.has("co-applicant-parish")).toBe(false);
  expect(fields.has("co-applicant-postcode")).toBe(false);
  expect(fields.has("co-applicant-overseas-postcode")).toBe(true);
});

it("hides the second person's address when they live at the same address", async () => {
  const addressIds = [
    "co-applicant-address-line-1",
    "co-applicant-address-line-2",
    "co-applicant-parish",
    "co-applicant-postcode",
  ];
  const at = (sameAddress: "yes" | "no") =>
    activeFields(
      "co-applicant-contact",
      answers({
        type: "house-lot",
        joint: true,
        income: "retired",
        coIncome: "retired",
        sameAddress,
      }),
    );
  const same = await at("yes");
  const elsewhere = await at("no");
  for (const id of addressIds) {
    expect(same.has(id), id).toBe(false);
    expect(elsewhere.has(id), id).toBe(true);
  }
  // Only the address: the telephone numbers and email are always asked.
  for (const id of ["co-applicant-mobile-telephone", "co-applicant-email"]) {
    expect(same.has(id), id).toBe(true);
  }
});

it.each([
  ["applicant-contact", "email"],
  ["applicant-contact", "mobile-telephone"],
  ["co-applicant-contact", "co-applicant-email"],
  ["co-applicant-contact", "co-applicant-mobile-telephone"],
])("requires %s.%s", async (stepId, fieldId) => {
  expect((await field(stepId, fieldId)).validations?.required?.value).toBe(
    true,
  );
});

it.each([
  ["co-applicant-details", "co-applicant-relationship"],
  ["other-occupants", "occupant-relationship"],
])("asks %s.%s with the relationship list", async (stepId, fieldId) => {
  const f = await field(stepId, fieldId);
  expect(f.htmlType).toBe("select");
  expect(f.options?.map((o) => o.value)).toContain("other");
});

// --- housing and money owed ------------------------------------------------------

it("words the land or property question for spouses and joint applications", async () => {
  const owns = await field("housing", "owns-property");
  const values = (joint: boolean, maritalStatus: string) =>
    answers({
      type: "house-lot",
      joint,
      income: "retired",
      maritalStatus,
    });
  const joint = values(true, "married");
  const marriedAlone = values(false, "married");
  const singleAlone = values(false, "single");

  expect(resolveFieldLabel(owns, joint)).toBe(
    "Do you own any land or property?",
  );
  expect(resolveFieldLabel(owns, marriedAlone)).toBe(
    "Do you or your spouse own land or property?",
  );
  expect(resolveFieldLabel(owns, singleAlone)).toBe(
    "Do you own any land or property?",
  );
  expect(resolveFieldHint(owns, joint)).toBe(
    "Include land or property you own on your own or with someone else.",
  );
  expect(resolveFieldHint(owns, marriedAlone)).toBeUndefined();
});

// conditionalHint is not scoped inside repeatable steps and the cross-step
// guard does not check it yet (#3663), so check its targets by hand here.
it("points every conditionalHint at a real field on a non-repeatable step", async () => {
  const c = await contract();
  for (const s of c.steps) {
    for (const f of s.elements) {
      for (const entry of f.conditionalHint ?? []) {
        expect(gates(s.behaviours, "repeatable"), s.stepId).toEqual([]);
        const target = c.steps.find(
          (x) => x.stepId === (entry.targetStepId ?? s.stepId),
        );
        expect(
          target?.elements.some((e) => e.fieldId === entry.targetFieldId),
          `${f.fieldId} → ${entry.targetStepId ?? s.stepId}.${entry.targetFieldId}`,
        ).toBe(true);
      }
    }
  }
});

it.each([
  "has-debts",
  "debt-details",
  "co-applicant-has-debts",
  "co-applicant-debt-details",
])("keeps money-owed.%s optional", async (fieldId) => {
  expect(
    (await field("money-owed", fieldId)).validations?.required?.value,
  ).toBe(false);
});

// --- documents -----------------------------------------------------------------

it("accepts PDF, JPG and PNG up to 10 MB on every upload", async () => {
  const files = (await contract()).steps
    .flatMap((s) => s.elements as Field[])
    .filter((e) => e.htmlType === "file");
  expect(files.length).toBe(14);
  for (const f of files) {
    expect(f.validations?.fileTypes?.value, f.fieldId).toEqual(FILE_TYPES);
    expect(f.validations?.itemMaxSize?.value, f.fieldId).toBe(10485760);
  }
});

it.each([
  ["government-employee", ["payslips", "job-letter"]],
  ["private-sector-employee", ["payslips", "job-letter"]],
  [
    "self-employed",
    ["business-registration-certificate", "financial-statements"],
  ],
  ["retired", ["pension-document"]],
])("asks a %s applicant for %j", async (income, expected) => {
  const incomeDocs = [
    "payslips",
    "job-letter",
    "business-registration-certificate",
    "financial-statements",
    "pension-document",
  ];
  const active = await activeFields(
    "upload-your-documents",
    answers({ type: "house-lot", joint: false, income }),
  );
  expect(incomeDocs.filter((id) => active.has(id))).toEqual(expected);
  expect(active.has("national-id-card")).toBe(true);
  expect(active.has("passport-photo")).toBe(true);
});

it("asks for the second person's documents only on a joint application", async () => {
  // A leftover second-person income type must not bring their documents back
  // after the applicant switches to applying on their own.
  const single = await activeFields(
    "upload-your-documents",
    answers({
      type: "house-lot",
      joint: false,
      income: "retired",
      coIncome: "government-employee",
    }),
  );
  const joint = await activeFields(
    "upload-your-documents",
    answers({
      type: "house-lot",
      joint: true,
      income: "retired",
      coIncome: "government-employee",
    }),
  );
  for (const id of [
    "co-applicant-national-id-card",
    "co-applicant-passport-photo",
    "co-applicant-payslips",
    "co-applicant-job-letter",
  ]) {
    expect(single.has(id), id).toBe(false);
    expect(joint.has(id), id).toBe(true);
  }
  expect(joint.has("co-applicant-pension-document")).toBe(false);
});

it.each(["payslips", "co-applicant-payslips"])(
  "asks for 2 files in upload-your-documents.%s",
  async (fieldId) => {
    expect(
      (await field("upload-your-documents", fieldId)).validations?.minItems
        ?.value,
    ).toBe(2);
  },
);

it("lets a self-employed applicant apply without proof of income, but not a retired one without a pension document", async () => {
  for (const prefix of ["", "co-applicant-"]) {
    for (const id of [
      "business-registration-certificate",
      "financial-statements",
    ]) {
      expect(
        (await field("upload-your-documents", `${prefix}${id}`)).validations
          ?.required?.value,
      ).toBe(false);
    }
    expect(
      (await field("upload-your-documents", `${prefix}pension-document`))
        .validations?.required?.value,
    ).toBe(true);
  }
});

// --- confirmation ----------------------------------------------------------------

it("emails the first applicant with the agreed subject", async () => {
  const applicant = (await contract()).processors?.filter(
    (p) =>
      p.type === "email" &&
      (p.config as { recipientField?: string }).recipientField !==
        "config.mdaEmail",
  );
  expect(applicant).toHaveLength(1);
  expect(applicant?.[0].config).toMatchObject({
    recipientField: "applicant-contact.email",
    subject: "Your NHC application has been submitted",
  });
});

it.each([
  ["rental-home", "rental home"],
  ["house-lot", "house lot"],
] as const)(
  "names the %s on the confirmation page and email",
  async (type, name) => {
    const s = await step("submission-confirmation");
    for (const c of s.conditionalMarkdown ?? []) {
      expect(s.markdownContent).toContain(`{${c.token}}`);
    }
    const body = resolveConditionalMarkdown(
      s,
      answers({ type, joint: false, income: "retired" }),
    );
    expect(body).toContain(
      `Your application for an NHC ${name} has been submitted.`,
    );
    // Hard breaks (a trailing backslash), so the address keeps its lines on
    // the page (react-markdown) and in the email (markdown-it).
    expect(body).toContain(
      "**National Housing Corporation**\\\n“The Garden”\\\nCountry Road\\\nSt. Michael\\\nBarbados",
    );
    expect(body).toContain("Telephone: (246) 536-5300");
    expect(body).toContain("Email: NHC.CustomerService@barbados.gov.bb");
    expect(body).not.toMatch(/\{[a-zA-Z]+\}/);
  },
);
