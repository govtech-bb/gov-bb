import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import {
  evaluateFormConditions,
  resolveConditionalMarkdown,
  type StepScopedValues,
} from "@govtech-bb/form-conditions";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// The NHC rental home or house lot form (#2913) routes almost entirely on
// stepConditionalOn / fieldConditionalOn gates and stops applicants with
// numeric caps and `^yes$` patterns. validate-recipes and
// recipe-invariants.spec.ts only check the file's shape, not that the routes
// and stops are the ones the content review asked for, so this spec pins them
// on the hydrated contract the citizen is actually served.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/nhc-rental-application.json",
);

type Validation = { value?: unknown; error?: string };
type Field = {
  fieldId: string;
  label?: string;
  validations?: Record<string, Validation | undefined>;
  behaviours?: Record<string, unknown>[];
  conditionalLabel?: { label: string }[];
};

async function readRaw(): Promise<string> {
  return fs.readFile(RECIPE_PATH, "utf8");
}

async function hydrated(): Promise<ServiceContract> {
  const recipe = serviceContractRecipeSchema.parse(JSON.parse(await readRaw()));
  const resolver: Resolver = async (ref) => {
    const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
    if (!entry) throw new Error(`unresolvable ref "${ref}"`);
    return entry;
  };
  return hydrateForm(recipe, resolver);
}

async function step(stepId: string) {
  const s = (await hydrated()).steps.find((x) => x.stepId === stepId);
  if (!s) throw new Error(`step "${stepId}" is missing`);
  return s;
}

async function field(stepId: string, fieldId: string): Promise<Field> {
  const f = (await step(stepId)).elements.find((e) => e.fieldId === fieldId);
  if (!f) throw new Error(`field "${stepId}.${fieldId}" is missing`);
  return f as unknown as Field;
}

function gates(
  behaviours: Record<string, unknown>[] | undefined,
  type: string,
) {
  return (behaviours ?? []).filter((b) => b.type === type);
}

// --- answer sets -----------------------------------------------------------

function answers(opts: {
  type: "rental-home" | "house-lot";
  joint: boolean;
  income: string;
  coIncome?: string;
  othersLiveThere?: "yes" | "no";
}): StepScopedValues {
  return {
    "application-type": { "application-type": opts.type },
    "applicant-count": {
      "applying-with": opts.joint ? "with-another-person" : "on-my-own",
    },
    eligibility: { "citizenship-eligible": "yes" },
    income: {
      "income-type": opts.income,
      ...(opts.coIncome ? { "co-applicant-income-type": opts.coIncome } : {}),
    },
    household: { "others-live-there": opts.othersLiveThere ?? "no" },
  };
}

async function activeSteps(values: StepScopedValues): Promise<string[]> {
  const contract = await hydrated();
  const result = evaluateFormConditions(contract, values);
  return contract.steps
    .map((s) => s.stepId)
    .filter((id) => result.activeStepIds.has(id));
}

async function activeFields(
  stepId: string,
  values: StepScopedValues,
): Promise<Set<string>> {
  const result = evaluateFormConditions(await hydrated(), values);
  return result.activeFieldIds.get(stepId) ?? new Set();
}

// --- content ----------------------------------------------------------------

it("never mentions TAMIS", async () => {
  expect(await readRaw()).not.toMatch(/tamis/i);
});

it("asks the steps in the content review's order", async () => {
  const contract = await hydrated();
  expect(contract.steps.map((s) => s.stepId)).toEqual([
    "application-type",
    "applicant-count",
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
    "occupant-details",
    "upload-your-documents",
    "declaration",
    "submission-confirmation",
  ]);
});

it("titles the declaration step as the confirm-and-submit page", async () => {
  expect((await step("declaration")).title).toBe(
    "Confirm and submit your application",
  );
});

// --- stops ------------------------------------------------------------------

describe.each(["", "co-applicant-"])("income caps (%s)", (prefix) => {
  it.each([
    ["weekly", 692.3],
    ["twice-a-month", 1500],
    ["monthly", 3000],
  ])("caps the %s amount at %s", async (frequency, max) => {
    const f = await field("income", `${prefix}income-amount-${frequency}`);
    expect(f.validations?.max?.value).toBe(max);
    expect(f.validations?.max?.error).toMatch(/more than BDS \$3,000 a month/);
    expect(f.validations?.min?.value).toBe(0);
    expect(gates(f.behaviours, "fieldConditionalOn")).toContainEqual(
      expect.objectContaining({
        targetFieldId: `${prefix}pay-frequency`,
        operator: "equal",
        value: frequency,
      }),
    );
  });
});

it.each([
  ["eligibility", "citizenship-eligible"],
  ["income", "combined-income-eligible"],
])("stops on %s.%s unless the answer is yes", async (stepId, fieldId) => {
  const f = await field(stepId, fieldId);
  expect(f.validations?.pattern?.value).toBe("^yes$");
});

it("asks the combined-income question for joint applications only", async () => {
  const single = answers({
    type: "rental-home",
    joint: false,
    income: "retired",
  });
  const joint = answers({
    type: "rental-home",
    joint: true,
    income: "retired",
    coIncome: "retired",
  });
  expect(
    (await activeFields("income", single)).has("combined-income-eligible"),
  ).toBe(false);
  expect(
    (await activeFields("income", joint)).has("combined-income-eligible"),
  ).toBe(true);
  expect(
    (await activeFields("income", single)).has("co-applicant-income-type"),
  ).toBe(false);
  expect(
    (await activeFields("income", joint)).has("co-applicant-income-type"),
  ).toBe(true);
});

// --- step routing (gates survive hydration) ---------------------------------

it.each(["co-applicant-details", "co-applicant-contact", "co-applicant-work"])(
  "gates %s on applying with another person",
  async (stepId) => {
    expect(
      gates((await step(stepId)).behaviours, "stepConditionalOn"),
    ).toContainEqual(
      expect.objectContaining({
        targetStepId: "applicant-count",
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

it.each(["household", "occupant-details"])(
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

it("lists occupants only when others will live there, 1 to 20 of them", async () => {
  const s = await step("occupant-details");
  expect(gates(s.behaviours, "stepConditionalOn")).toContainEqual(
    expect.objectContaining({
      targetStepId: "household",
      targetFieldId: "others-live-there",
      operator: "equal",
      value: "yes",
    }),
  );
  expect(gates(s.behaviours, "repeatable")).toEqual([
    expect.objectContaining({ min: 1, max: 20 }),
  ]);
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
    "applicant-count",
    "eligibility",
    "income",
    "applicant-details",
    "applicant-contact",
    "applicant-work",
    "housing",
    "money-owed",
    "household",
    "occupant-details",
    "upload-your-documents",
    "declaration",
    "submission-confirmation",
  ]);
});

it("routes a joint house-lot application with a retired co-applicant", async () => {
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
    "applicant-count",
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

it("skips the work step for a retired single applicant", async () => {
  const steps = await activeSteps(
    answers({ type: "house-lot", joint: false, income: "retired" }),
  );
  expect(steps).not.toContain("applicant-work");
});

// --- optional and required fields ------------------------------------------

it.each(["nhc-debt", "nhc-debt-details"])(
  "keeps money-owed.%s optional",
  async (fieldId) => {
    const f = await field("money-owed", fieldId);
    expect(f.validations?.required?.value).toBe(false);
  },
);

it.each([
  ["applicant-contact", "email"],
  ["applicant-contact", "mobile-telephone"],
  ["co-applicant-contact", "co-applicant-email"],
  ["co-applicant-contact", "co-applicant-mobile-telephone"],
])("requires %s.%s", async (stepId, fieldId) => {
  const f = await field(stepId, fieldId);
  expect(f.validations?.required?.value).toBe(true);
});

// --- documents --------------------------------------------------------------

it("limits every file upload to 10 MB per file", async () => {
  const contract = await hydrated();
  const files = contract.steps
    .flatMap((s) => s.elements)
    .filter((e) => (e as { htmlType?: string }).htmlType === "file");
  expect(files.length).toBeGreaterThan(0);
  for (const f of files as unknown as Field[]) {
    expect(f.validations?.itemMaxSize?.value, f.fieldId).toBe(10485760);
  }
});

it("asks for payslips and a job letter from employed people only", async () => {
  const employed = await activeFields(
    "upload-your-documents",
    answers({
      type: "rental-home",
      joint: true,
      income: "private-sector-employee",
      coIncome: "self-employed",
    }),
  );
  expect(employed.has("pay-slips")).toBe(true);
  expect(employed.has("job-letter")).toBe(true);
  expect(employed.has("co-applicant-pay-slips")).toBe(false);
  expect(employed.has("co-applicant-national-id-card")).toBe(true);

  const single = await activeFields(
    "upload-your-documents",
    answers({ type: "rental-home", joint: false, income: "self-employed" }),
  );
  expect(single.has("pay-slips")).toBe(false);
  expect(single.has("national-id-card")).toBe(true);
  expect(single.has("co-applicant-national-id-card")).toBe(false);
});

// --- confirmation -----------------------------------------------------------

it("emails the first applicant only, with the agreed subject", async () => {
  const applicant = (await hydrated()).processors?.filter(
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

it("mentions the rental waiting list on the rental route only", async () => {
  const s = await step("submission-confirmation");
  const segment = s.conditionalMarkdown?.find(
    (c) => c.token === "rentalWaitingList",
  );
  expect(segment?.default).toBe("");
  for (const c of s.conditionalMarkdown ?? []) {
    expect(s.markdownContent).toContain(`{${c.token}}`);
  }

  const rental = resolveConditionalMarkdown(
    s,
    answers({ type: "rental-home", joint: false, income: "retired" }),
  );
  const lot = resolveConditionalMarkdown(
    s,
    answers({ type: "house-lot", joint: false, income: "retired" }),
  );
  expect(rental).toContain("waiting list");
  expect(rental).toContain("NHC rental home has been submitted");
  expect(lot).not.toContain("waiting list");
  expect(lot).toContain("NHC house lot has been submitted");
});

it("asks a married applicant about their spouse's land or property", async () => {
  const owns = await field("housing", "owns-property");
  expect(owns.label).toBe("Do you own land or property?");
  expect(owns.conditionalLabel).toEqual([
    expect.objectContaining({
      targetStepId: "applicant-details",
      targetFieldId: "marital-status",
      operator: "equal",
      value: "married",
      label: "Do you or your spouse own land or property?",
    }),
  ]);
});

// --- review fixes (PR #2954) -------------------------------------------------

it.each([
  ["co-applicant-details", "co-applicant-relationship"],
  ["occupant-details", "occupant-relationship"],
])("asks %s.%s as free text", async (stepId, fieldId) => {
  const f = (await field(stepId, fieldId)) as Field & { htmlType?: string };
  expect(f.htmlType).toBe("text");
  expect(f.validations?.required?.error).toBe(
    "Enter their relationship to you",
  );
  expect(await readRaw()).not.toContain(`${fieldId}-other`);
});

it("gives an example for the occupant's relationship", async () => {
  const f = (await field(
    "occupant-details",
    "occupant-relationship",
  )) as Field & {
    hint?: string;
  };
  expect(f.hint).toBe("For example, son, daughter or parent.");
});

it("accepts PDF, JPG and PNG by MIME type and extension on every upload", async () => {
  const files = (await hydrated()).steps
    .flatMap((s) => s.elements)
    .filter((e) => (e as { htmlType?: string }).htmlType === "file");
  for (const f of files as unknown as Field[]) {
    expect(f.validations?.fileTypes?.value, f.fieldId).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
    ]);
  }
});

it.each([
  "income-type",
  "pay-frequency",
  "co-applicant-income-type",
  "co-applicant-pay-frequency",
])("asks income.%s as radios", async (fieldId) => {
  const f = (await field("income", fieldId)) as Field & { htmlType?: string };
  expect(f.htmlType).toBe("radio");
});

it.each(["weekly", "twice-a-month", "monthly"])(
  "words the co-applicant %s cap about their amount",
  async (frequency) => {
    const f = await field("income", `co-applicant-income-amount-${frequency}`);
    expect(f.validations?.max?.error).toBe(
      "You cannot continue with this application. The amount they receive is more than BDS $3,000 a month.",
    );
  },
);
