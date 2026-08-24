import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// `webhook-recipe-guards.ts` checks that a mapping's applicant paths are
// well-formed and name a real *step*, but says so explicitly: field-level
// existence needs registry-ref expansion, which the lint does not do. So a
// typo in the field half of a path — or a bare `components/email` whose
// registry fieldId is not what the recipe assumed — passes every existing gate
// and then sends the case system a blank name, email or phone. The applicant
// path is also dropped from `form_data`, so the answer reaches CaMS nowhere at
// all; nothing goes red. Hydrate every mapped recipe and resolve the paths.
const RECIPES_DIR = path.resolve(__dirname, "recipes");

const resolver: Resolver = async (ref) => {
  const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
  if (!entry) throw new Error(`unresolvable ref "${ref}"`);
  return entry;
};

interface MappedRecipe {
  formId: string;
  applicantPaths: string[];
  fieldIdsByStep: Map<string, Set<string>>;
}

async function mappedRecipes(): Promise<MappedRecipe[]> {
  const files = (await fs.readdir(RECIPES_DIR)).filter((f) =>
    f.endsWith(".json"),
  );
  const mapped: MappedRecipe[] = [];

  for (const file of files.sort()) {
    const raw = JSON.parse(
      await fs.readFile(path.join(RECIPES_DIR, file), "utf8"),
    );
    const recipe = serviceContractRecipeSchema.parse(raw);
    const webhook = recipe.processors?.find((p) => p.type === "webhook");
    const mapping =
      webhook?.type === "webhook" ? webhook.config.mapping : undefined;
    if (!mapping) continue;

    const { name, email, phone } = mapping.applicant;
    const hydrated = await hydrateForm(recipe, resolver);
    mapped.push({
      formId: recipe.formId,
      applicantPaths: [...(Array.isArray(name) ? name : [name]), email, phone],
      fieldIdsByStep: new Map(
        hydrated.steps.map((step) => [
          step.stepId,
          new Set(
            step.elements
              .map((e) => (e as { fieldId?: string }).fieldId)
              .filter((id): id is string => Boolean(id)),
          ),
        ]),
      ),
    });
  }
  return mapped;
}

it("resolves every mapped webhook's applicant paths to real hydrated fields", async () => {
  const recipes = await mappedRecipes();
  // A rename that drops the last mapped webhook would otherwise pass vacuously.
  expect(recipes.length).toBeGreaterThan(0);

  const unresolved = recipes.flatMap(
    ({ formId, applicantPaths, fieldIdsByStep }) =>
      applicantPaths
        .filter((p) => {
          const dot = p.indexOf(".");
          const fieldIds = fieldIdsByStep.get(p.slice(0, dot));
          return !fieldIds?.has(p.slice(dot + 1));
        })
        .map((p) => `${formId}: ${p}`),
  );

  expect(unresolved).toEqual([]);
});
