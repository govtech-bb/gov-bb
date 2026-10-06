import * as fs from "node:fs/promises";
import * as path from "node:path";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import {
  serviceContractRecipeSchema,
  type Primitive,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { validateField } from "@govtech-bb/form-validation";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// The Environmental Health content review (#2856) rebuilt this journey around
// one "Who are you applying for?" answer, a property step and a repeatable pool
// step. Most of its rules are branching, and a broken condition here does not
// error: it shows a question to the wrong people or quietly never asks it. So
// this hydrates the real recipe and evaluates the conditions the submission
// pipeline validates against.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-swimming-pool-licence.json",
);

const resolver: Resolver = async (ref) => {
  const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
  if (!entry) throw new Error(`unresolvable ref "${ref}"`);
  return entry;
};

async function contract(): Promise<ServiceContract> {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  return (await hydrateForm(recipe, resolver)) as unknown as ServiceContract;
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

const REPRESENTED_STEPS = [
  "permission",
  "your-role",
  "person-details",
  "business-details",
];

it.each([
  ["yourself", []],
  ["another-person", ["permission", "your-role", "person-details"]],
  ["business", ["permission", "your-role", "business-details"]],
])(
  "applying for %s shows only the steps for that answer",
  async (applyingFor, expected) => {
    const cond = await conditions({
      "applying-for": { "applying-for": applyingFor },
    });
    expect(REPRESENTED_STEPS.filter((s) => cond.activeStepIds.has(s))).toEqual(
      expected,
    );
  },
);

// The platform has no stop page, so "No" is refused where it is answered —
// the same pattern rule the hotel licence uses.
it("refuses to continue without permission", async () => {
  const permission = await field("permission", "has-permission");
  expect(validateField(permission, "no", {})).toEqual([
    "You need permission to apply for this swimming pool licence.",
  ]);
  expect(validateField(permission, "yes", {})).toEqual([]);
});

it.each([
  ["person-details", "person-same-address", "person", "another-person"],
  ["business-details", "business-same-address", "business", "business"],
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

it("asks for the type of property only for another type", async () => {
  for (const [type, shown] of [
    ["hotel", false],
    ["other", true],
  ] as const) {
    const active = (
      await conditions({ "pool-location": { "property-type": type } })
    ).activeFieldIds.get("pool-location")!;
    expect(active.has("property-type-other")).toBe(shown);
  }
});

it("asks for the current licence number only on a renewal", async () => {
  for (const [type, shown] of [
    ["new", false],
    ["renewal", true],
  ] as const) {
    const active = (
      await conditions({ "about-application": { "application-type": type } })
    ).activeFieldIds.get("about-application")!;
    expect(active.has("licence-number")).toBe(shown);
  }
});

// Catchment routing reads the property's coordinates and parish by one fixed
// path. On a hidden or repeatable step that path resolves to nothing and the
// MDA email silently goes nowhere, so the step must stay plain and unconditional.
it("keeps the routed property address on a plain, always-shown step", async () => {
  const step = (await contract()).steps.find(
    (s) => s.stepId === "pool-location",
  );
  expect(step?.behaviours ?? []).toEqual([]);
  const ids = step!.elements.map((e) => e.fieldId);
  expect(ids).toEqual(
    expect.arrayContaining(["pool-address-coordinates", "pool-parish"]),
  );
});

// #2856 part A: a condition on the repeatable pool step that names its own
// step is pinned to pool 1, so one pool's answers decided what another pool
// was asked. Every pool must be evaluated on its own answers.
it("does not pin any pool condition to pool 1", async () => {
  const step = (await contract()).steps.find(
    (s) => s.stepId === "pool-details",
  );
  const pinned = step!.elements.flatMap((e) =>
    (e.behaviours ?? []).filter(
      (b) => (b as { targetStepId?: string }).targetStepId === "pool-details",
    ),
  );
  expect(pinned).toEqual([]);
});
