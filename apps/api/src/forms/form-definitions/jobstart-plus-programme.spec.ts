import * as fs from "node:fs/promises";
import * as path from "node:path";
import { validate } from "@govtech-bb/form-validation";
import {
  serviceContractRecipeSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// Each training on the repeatable `post-secondary` step must check its own end
// year against its own start year (same bug class as #2856). The `gt` rule on
// `post-sec-end-year-1` used to carry `"targetStepId": "post-secondary"`, which
// pins it to the FIRST training: the shared validator reads
// `values["post-secondary"][0]`, so training 2's end year was compared with
// training 1's start year. Without targetStepId the reference resolves from
// the instance's own values. This hydrates the real recipe and validates each
// instance the way the submission pipeline does.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/jobstart-plus-programme.json",
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

const repeatableStepIds = (c: ServiceContract) =>
  c.steps
    .filter((s) => (s.behaviours ?? []).some((b) => b.type === "repeatable"))
    .map((s) => s.stepId);

it("pins no field condition or rule in a repeatable step to that step", async () => {
  const c = await contract();
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
  const step = (await contract()).steps.find(
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
