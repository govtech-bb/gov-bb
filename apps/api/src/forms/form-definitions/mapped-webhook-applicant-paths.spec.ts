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
  /** `catchmentRouting`'s two paths, when the recipe routes by catchment. */
  routingPaths: string[];
  /** `"stepId.fieldId"` of every coordinate field an address lookup writes. */
  geocodedCoordinateFields: string[];
  /** The hydrated `catchmentRouting.parishField` element, when the recipe routes. */
  parishElement?: {
    behaviours?: { type: string }[];
    validations?: { required?: { value?: boolean } };
  };
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
    const routing = recipe.catchmentRouting;
    const hydrated = await hydrateForm(recipe, resolver);
    mapped.push({
      formId: recipe.formId,
      applicantPaths: [...(Array.isArray(name) ? name : [name]), email, phone],
      routingPaths: routing
        ? [routing.coordinatesField, routing.parishField]
        : [],
      geocodedCoordinateFields: hydrated.steps.flatMap((step) =>
        step.elements
          .map(
            (e) =>
              (e as { geocodeTargets?: { coordinatesFieldId?: string } })
                .geocodeTargets?.coordinatesFieldId,
          )
          .filter((id): id is string => Boolean(id))
          .map((id) => `${step.stepId}.${id}`),
      ),
      parishElement: routing
        ? (hydrated.steps
            .find(
              (step) =>
                step.stepId ===
                routing.parishField.slice(0, routing.parishField.indexOf(".")),
            )
            ?.elements.find(
              (e) =>
                (e as { fieldId?: string }).fieldId ===
                routing.parishField.slice(routing.parishField.indexOf(".") + 1),
            ) as MappedRecipe["parishElement"])
        : undefined,
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

function unresolvedIn(
  recipes: MappedRecipe[],
  pick: (recipe: MappedRecipe) => string[],
): string[] {
  return recipes.flatMap((recipe) =>
    pick(recipe)
      .filter((p) => {
        const dot = p.indexOf(".");
        const fieldIds = recipe.fieldIdsByStep.get(p.slice(0, dot));
        return !fieldIds?.has(p.slice(dot + 1));
      })
      .map((p) => `${recipe.formId}: ${p}`),
  );
}

it("resolves every mapped webhook's applicant paths to real hydrated fields", async () => {
  const recipes = await mappedRecipes();
  // A rename that drops the last mapped webhook would otherwise pass vacuously.
  expect(recipes.length).toBeGreaterThan(0);

  expect(unresolvedIn(recipes, (r) => r.applicantPaths)).toEqual([]);
});

// The same silent failure one step further along: a `catchmentRouting` path
// naming no real field resolves no polyclinic, so `catchment.mdaEmail` finds no
// recipient and the composed per-polyclinic programme code falls back to the
// bare one — a queue the CMS does not have. Both are runtime-only, and a bare
// registry ref makes it easy to get wrong: `components/parish` with no override
// hydrates to fieldId "parish", not the name the step's siblings suggest.
it("resolves every catchmentRouting path to a real hydrated field", async () => {
  const routed = (await mappedRecipes()).filter(
    (r) => r.routingPaths.length > 0,
  );
  expect(routed.length).toBeGreaterThan(0);

  expect(unresolvedIn(routed, (r) => r.routingPaths)).toEqual([]);
});

// The coordinate only ever gets written by an address lookup's `geocodeTargets`,
// so the two halves have to name the same field. They are declared in different
// places — a step element and a top-level block — and a mismatch is invisible:
// the routing reads a field nothing populates, falls back to parish, and the
// coordinate precision the block exists for is silently gone. Same coupling
// `apply-for-food-business-licence.spec.ts` guards for its one form.
it("has an address lookup writing each catchmentRouting coordinate field", async () => {
  const routed = (await mappedRecipes()).filter(
    (r) => r.routingPaths.length > 0,
  );

  const orphaned = routed
    .filter((r) => !r.geocodedCoordinateFields.includes(r.routingPaths[0]))
    .map(
      (r) =>
        `${r.formId}: ${r.routingPaths[0]} is written by no address lookup ` +
        `(lookups write: ${r.geocodedCoordinateFields.join(", ") || "nothing"})`,
    );

  expect(orphaned).toEqual([]);
});

// The polyclinic name, the CMS programme code and the MDA inbox all come from
// the resolved catchment, and the parish is the only field the citizen is
// guaranteed to be able to answer — the coordinate is written by an address
// lookup, which a free-typed address or a /geocode outage skips. So a routed
// recipe whose parish field is gated behind an answer has a branch that routes
// nowhere: `apply-for-hair-salon-licence` hid it behind the "building" branch,
// and every vehicle-based application landed on "your local polyclinic" with no
// polyclinic to send the MDA copy to.
it("keeps every catchmentRouting parish field unconditional and required", async () => {
  const routed = (await mappedRecipes()).filter(
    (r) => r.routingPaths.length > 0,
  );
  expect(routed.length).toBeGreaterThan(0);

  const ungated = routed
    .filter((r) => {
      const gated = (r.parishElement?.behaviours ?? []).some(
        (b) => b.type === "fieldConditionalOn",
      );
      const required = r.parishElement?.validations?.required?.value !== false;
      return gated || !required;
    })
    .map((r) => `${r.formId}: ${r.routingPaths[1]}`);

  expect(ungated).toEqual([]);
});
