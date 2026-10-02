import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// The food steps are the only conditional STEPS in the recipe set, and a
// step-level property that hydrateForm does not carry through is dropped
// silently from the served contract — the form would then always show the food
// steps, including to someone who is not serving food. validate-recipes and
// recipe-invariants.spec.ts both read the file on disk, so neither can see
// that. This spec hydrates the real recipe and asserts the gate survives.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/request-an-environmental-health-officer.json",
);

const GATED_STEP_IDS = ["food-details", "food-safety"];

async function hydratedSteps() {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  // Resolver = (ref: string) => Promise<RegistryEntry | null>. Every ref in
  // this recipe is a builtin, so a miss is a bug in the recipe, not a
  // DB-backed custom component — fail loudly rather than returning null.
  const resolver: Resolver = async (ref) => {
    const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
    if (!entry) throw new Error(`unresolvable ref "${ref}"`);
    return entry;
  };
  const hydrated = await hydrateForm(recipe, resolver);
  return hydrated.steps as unknown as {
    stepId: string;
    behaviours?: {
      type: string;
      targetStepId?: string;
      targetFieldId?: string;
      operator?: string;
      value?: unknown;
    }[];
  }[];
}

it.each(GATED_STEP_IDS)(
  "gates the %s step on operating-restaurant = yes, and the gate survives hydration",
  async (stepId) => {
    const steps = await hydratedSteps();
    const step = steps.find((s) => s.stepId === stepId);
    expect(step, `step "${stepId}" is missing from the recipe`).toBeDefined();

    const gates = (step!.behaviours ?? []).filter(
      (b) => b.type === "stepConditionalOn",
    );
    expect(
      gates,
      `step "${stepId}" lost its stepConditionalOn behaviour in hydration`,
    ).toHaveLength(1);
    expect(gates[0]).toMatchObject({
      type: "stepConditionalOn",
      targetStepId: "operating-restaurant",
      targetFieldId: "operating-restaurant",
      operator: "equal",
      value: "yes",
    });
  },
);

it("leaves every other step ungated, so the officer request always runs", async () => {
  const steps = await hydratedSteps();
  const ungated = steps
    .filter((s) => !GATED_STEP_IDS.includes(s.stepId))
    .filter((s) =>
      (s.behaviours ?? []).some((b) => b.type === "stepConditionalOn"),
    )
    .map((s) => s.stepId);
  expect(ungated).toEqual([]);
});
