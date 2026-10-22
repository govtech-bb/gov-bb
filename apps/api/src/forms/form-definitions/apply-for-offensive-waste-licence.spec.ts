import * as fs from "node:fs/promises";
import * as path from "node:path";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import {
  serviceContractRecipeSchema,
  type Primitive,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { validateField } from "@govtech-bb/form-validation";
import { getCatalog, hydrateForm } from "@govtech-bb/form-builder";

// The Environmental Health content review (#2858) rebuilt this journey around
// renewal checks, one "Who are you applying for?" answer and a site-plan upload
// asked for a new licence or a changed building; #3090 added the Planning and
// Development number on those same two routes. A broken condition here
// does not error: it shows a question to the wrong people or quietly never asks
// it. So this hydrates the real recipe and evaluates the conditions the
// submission pipeline validates against.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-offensive-waste-licence.json",
);

async function contract(): Promise<ServiceContract> {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  return hydrateForm(recipe, getCatalog()) as unknown as ServiceContract;
}

async function conditions(values: Record<string, unknown>) {
  return evaluateFormConditions(await contract(), values as never);
}

async function field(stepId: string, fieldId: string): Promise<Primitive> {
  const step = (await contract()).steps.find((s) => s.stepId === stepId);
  const found = step?.elements.find((e) => e.fieldId === fieldId);
  expect(found, `${stepId}.${fieldId} is missing`).toBeDefined();
  return found as Primitive;
}

const RENEWAL_STEPS = ["renewal-check"];
const PLANS_STEPS = ["building-plans", "changed-building-plans"];
const HOLDER_STEPS = ["licence-holder-person", "licence-holder-business"];

function activeOf(steps: string[], active: Set<string>): string[] {
  return steps.filter((s) => active.has(s));
}

// Environmental Health needs the Planning and Development number for a new
// licence, and for a renewal only when the building has changed (#3090). Each
// route has its own field, revealed under the answer that triggers it.
function planningNumberAsked(cond: Awaited<ReturnType<typeof conditions>>) {
  return {
    new:
      cond.activeFieldIds
        .get("application-type")
        ?.has("planning-application-number") ?? false,
    renewal:
      cond.activeFieldIds
        .get("renewal-check")
        ?.has("changed-planning-application-number") ?? false,
  };
}

it.each([
  ["new", undefined, { new: true, renewal: false }],
  ["renewal", "no", { new: false, renewal: false }],
  ["renewal", "yes", { new: false, renewal: true }],
])(
  "a %s application (building changed: %s) asks for the Planning number where it should",
  async (applicationType, buildingChanges, asked) => {
    const cond = await conditions({
      "application-type": { "application-type": applicationType },
      "renewal-check": { "building-changes": buildingChanges },
    });
    expect(planningNumberAsked(cond)).toEqual(asked);
  },
);

// Hidden fields are left out of Check your answers and the payload, so a number
// typed on one route must not survive a switch to the other.
it.each([
  [
    "new to renewal",
    "new",
    {
      "application-type": {
        "application-type": "renewal",
        "planning-application-number": "PD/123",
      },
      "renewal-check": { "building-changes": "no" },
    },
  ],
  [
    "renewal to new",
    "renewal",
    {
      "application-type": { "application-type": "new" },
      "renewal-check": {
        "building-changes": "yes",
        "changed-planning-application-number": "PD/123",
      },
    },
  ],
])(
  "drops a Planning number left behind after switching from %s",
  async (_, typedOn, values) => {
    const cond = await conditions(values);
    expect(planningNumberAsked(cond)[typedOn as "new" | "renewal"]).toBe(false);
  },
);

it.each([
  ["application-type", "planning-application-number"],
  ["renewal-check", "changed-planning-application-number"],
])("%s.%s is required", async (stepId, fieldId) => {
  const primitive = await field(stepId, fieldId);
  expect(validateField(primitive, "", {})).toEqual([
    "Enter your Planning and Development application number.",
  ]);
  expect(validateField(primitive, "PD/123", {})).toEqual([]);
});

it("no longer asks for the current licence number", async () => {
  const form = await contract();
  const ids = form.steps.flatMap((s) => s.elements.map((e) => e.fieldId));
  expect(ids).not.toContain("current-licence-number");
});

// One licence covers one trade, so the 12 activities are a single choice — a
// select, because a radio is only for exactly 2 options.
it("asks for exactly one business activity", async () => {
  const primitive = await field("business-activities", "business-activities");
  expect(primitive.htmlType).toBe("select");
  expect(primitive.options).toHaveLength(12);
});

it.each([
  ["building-plans", "site-plan"],
  ["changed-building-plans", "changed-site-plan"],
])("%s asks for an optional site plan", async (stepId, fieldId) => {
  const primitive = await field(stepId, fieldId);
  expect(primitive.label).toBe("Site plan");
  expect(validateField(primitive, undefined, {})).toEqual([]);
});

it.each([
  ["new", undefined, [], ["building-plans"]],
  ["renewal", "no", RENEWAL_STEPS, []],
  ["renewal", "yes", RENEWAL_STEPS, ["changed-building-plans"]],
])(
  "a %s application (building changed: %s) shows the right renewal and plans steps",
  async (applicationType, buildingChanges, renewal, plans) => {
    const { activeStepIds } = await conditions({
      "application-type": { "application-type": applicationType },
      "renewal-check": { "building-changes": buildingChanges },
    });
    expect(activeOf(RENEWAL_STEPS, activeStepIds)).toEqual(renewal);
    expect(activeOf(PLANS_STEPS, activeStepIds)).toEqual(plans);
  },
);

// Hidden steps keep their answers, so a renewal answer left behind after
// switching to a new licence must not decide what the new licence is asked.
it("ignores renewal answers left behind after switching to a new licence", async () => {
  const { activeStepIds } = await conditions({
    "application-type": { "application-type": "new" },
    "renewal-check": { "building-changes": "yes" },
  });
  expect(activeOf(RENEWAL_STEPS, activeStepIds)).toEqual([]);
  expect(activeOf(PLANS_STEPS, activeStepIds)).toEqual(["building-plans"]);
});

it.each([
  ["yourself", [], undefined],
  ["another-person", ["licence-holder-person"], "person-has-permission"],
  ["business", ["licence-holder-business"], "business-has-permission"],
])(
  "applying for %s shows only the licence-holder questions for that answer",
  async (applyingFor, expected, permissionField) => {
    const cond = await conditions({
      "applying-for": { "applying-for": applyingFor },
    });
    expect(activeOf(HOLDER_STEPS, cond.activeStepIds)).toEqual(expected);
    const active = cond.activeFieldIds.get("applying-for")!;
    // Each branch has its own permission question, so each gets its own stop copy.
    for (const id of ["person-has-permission", "business-has-permission"]) {
      expect(active.has(id)).toBe(id === permissionField);
    }
    expect(active.has("relationship-to-licence-holder")).toBe(
      permissionField !== undefined,
    );
  },
);

// The platform has no stop page, so a blocking answer is refused where it is
// answered — the same pattern rule the hotel licence uses.
it.each([
  ["renewal-check", "same-licence-holder", "no", "yes"],
  ["renewal-check", "address-changed", "yes", "no"],
  ["applying-for", "person-has-permission", "no", "yes"],
  ["applying-for", "business-has-permission", "no", "yes"],
])(
  "%s.%s refuses %s and accepts %s",
  async (stepId, fieldId, refused, accepted) => {
    const primitive = await field(stepId, fieldId);
    expect(validateField(primitive, refused, {})).toHaveLength(1);
    expect(validateField(primitive, accepted, {})).toEqual([]);
  },
);

it.each([
  ["licence-holder-person", "person-same-address", "person", "another-person"],
  ["licence-holder-business", "business-same-address", "business", "business"],
])(
  "%s asks for an address only when it is not the applicant's",
  async (stepId, gate, prefix, applyingFor) => {
    const addressFields = [
      `${prefix}-address-line-1`,
      `${prefix}-address-line-2`,
      `${prefix}-parish`,
    ];
    for (const [answer, shown] of [
      ["yes", false],
      ["no", true],
    ] as const) {
      const active = (
        await conditions({
          "applying-for": { "applying-for": applyingFor },
          [stepId]: { [gate]: answer },
        })
      ).activeFieldIds.get(stepId)!;
      for (const id of addressFields) expect(active.has(id), id).toBe(shown);
    }
  },
);

// Catchment routing reads the work address's coordinates and parish by one
// fixed path — never the applicant's own address. On a hidden step that path
// resolves to nothing and the MDA email silently goes nowhere, so the work
// address step must stay unconditional.
it("routes on the work address, which is always asked", async () => {
  const form = await contract();
  expect(form.catchmentRouting).toEqual({
    coordinatesField: "work-address.business-address-coordinates",
    parishField: "work-address.work-address-parish",
  });
  const step = form.steps.find((s) => s.stepId === "work-address");
  expect(step?.behaviours ?? []).toEqual([]);
  expect(step!.elements.map((e) => e.fieldId)).toEqual(
    expect.arrayContaining([
      "business-address-coordinates",
      "work-address-parish",
    ]),
  );
});
