import * as fs from "node:fs/promises";
import * as path from "node:path";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import {
  serviceContractRecipeSchema,
  type Primitive,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { validate, validateField } from "@govtech-bb/form-validation";
import { getCatalog, hydrateForm } from "@govtech-bb/form-builder";

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
  return (await hydrateForm(
    recipe,
    getCatalog(),
  )) as unknown as ServiceContract;
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
    "You can only apply if you are under 25 or have a disability or long-term health condition",
  ]);
  expect(validateField(field as Primitive, "yes", {})).toEqual([]);
});

it("asks, blocks and warns only from age 25", async () => {
  const contract = await hydratedContract();

  const over = activeApplicantFields(contract, 30);
  expect(over?.has("disability-eligibility")).toBe(true);
  expect(over?.has("disability-ineligible-notice")).toBe(true);

  const under = activeApplicantFields(contract, 21);
  expect(under?.has("disability-eligibility")).toBe(false);
  expect(under?.has("disability-ineligible-notice")).toBe(false);
});

// The old stop step held a disabled required field that could never be
// filled; the gate now lives on the question itself.
it("has no separate ineligible step", async () => {
  const contract = await hydratedContract();
  expect(contract.steps.map((s) => s.stepId)).not.toContain("ineligble-step");
});

// Each training on the repeatable `post-secondary` step must check its own end
// year against its own start year (same bug class as #2856). The `gt` rule on
// `post-sec-end-year-1` used to carry `"targetStepId": "post-secondary"`, which
// pins it to the FIRST training: the shared validator reads
// `values["post-secondary"][0]`, so training 2's end year was compared with
// training 1's start year. Without targetStepId the reference resolves from
// the instance's own values. This hydrates the real recipe and validates each
// instance the way the submission pipeline does.
const repeatableStepIds = (c: ServiceContract) =>
  c.steps
    .filter((s) => (s.behaviours ?? []).some((b) => b.type === "repeatable"))
    .map((s) => s.stepId);

it("pins no field condition or rule in a repeatable step to that step", async () => {
  const c = await hydratedContract();
  expect(repeatableStepIds(c)).toEqual([
    "post-secondary",
    "another-previous-paid-job",
  ]);
  const pinned = c.steps
    .filter((s) => repeatableStepIds(c).includes(s.stepId))
    .flatMap((s) =>
      s.elements.flatMap((p) =>
        [...(p.behaviours ?? []), ...Object.values(p.validations ?? {})]
          .filter(
            (b) =>
              b !== null &&
              typeof b === "object" &&
              "targetStepId" in b &&
              b.targetStepId === s.stepId,
          )
          .map(() => `${s.stepId}.${p.fieldId}`),
      ),
    );
  expect(pinned).toEqual([]);
});

/** Whether each training's end year fails validation. */
async function endYearErrorPerTraining(
  trainings: Array<{ start: string; end: string }>,
): Promise<boolean[]> {
  const step = (await hydratedContract()).steps.find(
    (s) => s.stepId === "post-secondary",
  )!;
  const instances = trainings.map((t) => ({
    "post-sec-start-year-1": t.start,
    "post-sec-end-year-1": t.end,
  }));
  return instances.map(
    (stepValues) =>
      !validate({
        primitives: step.elements,
        stepValues,
        allValues: { "post-secondary": instances },
      }).valid,
  );
}

it("accepts training 2's end year after its own start year", async () => {
  expect(
    await endYearErrorPerTraining([
      { start: "2021", end: "2022" },
      { start: "2015", end: "2017" },
    ]),
  ).toEqual([false, false]);
});

it("rejects training 2's end year before its own start year", async () => {
  expect(
    await endYearErrorPerTraining([
      { start: "2010", end: "2012" },
      { start: "2019", end: "2018" },
    ]),
  ).toEqual([false, true]);
});
