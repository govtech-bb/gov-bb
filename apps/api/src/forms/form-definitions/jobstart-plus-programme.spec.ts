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

// Applicants aged 25 or over must have a disability. The gate is a `^yes$`
// pattern on `disability-eligibility`, which only shows from 25, plus a
// warning explaining why. Hidden answers are never cleared, so a "No" left
// behind after correcting the date of birth must neither block nor warn an
// applicant under 25 — both depend on the age condition, which validate-recipes
// and recipe-invariants.spec.ts cannot see.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/jobstart-plus-programme.json",
);

async function hydratedContract(): Promise<ServiceContract> {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  // Every ref in this recipe is a builtin, so a miss is a bug in the recipe.
  const resolver: Resolver = async (ref) => {
    const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
    if (!entry) throw new Error(`unresolvable ref "${ref}"`);
    return entry;
  };
  return (await hydrateForm(recipe, resolver)) as unknown as ServiceContract;
}

function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function activeApplicantFields(
  contract: ServiceContract,
  age: number,
): Set<string> | undefined {
  const cond = evaluateFormConditions(contract, {
    "applicant-details": {
      "applicant-dob": isoYearsAgo(age),
      "disability-eligibility": "no",
    },
  });
  return cond.activeFieldIds.get("applicant-details");
}

it("blocks a 'No' to the disability question and accepts a 'Yes'", async () => {
  const contract = await hydratedContract();
  const field = contract.steps
    .find((s) => s.stepId === "applicant-details")
    ?.elements.find((e) => e.fieldId === "disability-eligibility");
  expect(field, "disability-eligibility is missing").toBeDefined();

  expect(validateField(field as Primitive, "no", {})).toEqual([
    "You are not eligible to continue this application",
  ]);
  expect(validateField(field as Primitive, "yes", {})).toEqual([]);
});

it("asks, blocks and warns only from age 25", async () => {
  const contract = await hydratedContract();

  const over = activeApplicantFields(contract, 30);
  expect(over?.has("disability-eligibility")).toBe(true);
  expect(over?.has("ineligible-notice")).toBe(true);

  const under = activeApplicantFields(contract, 21);
  expect(under?.has("disability-eligibility")).toBe(false);
  expect(under?.has("ineligible-notice")).toBe(false);
});

// The old stop step held a disabled required field that could never be
// filled; the gate now lives on the question itself.
it("has no separate ineligible step", async () => {
  const contract = await hydratedContract();
  expect(contract.steps.map((s) => s.stepId)).not.toContain("ineligble-step");
});
