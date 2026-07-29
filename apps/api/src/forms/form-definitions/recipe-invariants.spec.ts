import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";

// Guards the invariants RecipeFileLoaderService relies on. Recipes are flat
// `recipes/{formId}.json` files (versioning retired, #1196); the loader parses
// each with serviceContractRecipeSchema and requires formId === filename. A
// recipe that violates an invariant is dropped at boot (logged, not served) —
// and refs only resolve later at serve time via RegistryService.hydrateForm,
// so an unresolvable ref is a serve-time failure. The CI build/test gate does
// NOT boot the API, so without this test a bad recipe ships and only fails in
// production. This spec re-creates those checks over the real files. See #2075,
// #222.
const RECIPES_ROOT = path.resolve(__dirname, "recipes");

// Loose structural views of a parsed recipe — the union of component/block
// elements doesn't narrow on a ref-prefix check, so we read fields defensively.
type Element = {
  ref: string;
  overrides?: { fieldId?: string } & Record<string, unknown>;
};
type Step = { stepId: string; elements?: Element[] };

type RecipeFile = { file: string; fileFormId: string; raw: unknown };

async function readRecipeFiles(): Promise<RecipeFile[]> {
  const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);
  return Promise.all(
    files.map(async (file) => ({
      file,
      fileFormId: file.replace(/\.json$/, ""),
      raw: JSON.parse(await fs.readFile(path.join(RECIPES_ROOT, file), "utf8")),
    })),
  );
}

// The *authored* fieldIds a recipe element introduces: a component that
// overrides its fieldId contributes `overrides.fieldId`; a block contributes
// its `overrides` keys (each a child fieldId). Elements that don't override
// (relying on the registry default fieldId) contribute nothing here — the
// duplicate check below therefore covers authored ids only, not registry
// defaults. Resolving defaults would mean expanding every ref against the
// registry, which is out of scope for this invariant guard.
function elementAuthoredFieldIds(el: Element): string[] {
  if (el.ref.startsWith("blocks/")) {
    return Object.keys(el.overrides ?? {});
  }
  const id = el.overrides?.fieldId;
  return id ? [id] : [];
}

// Re-creates the loader's boot invariants (schema + formId===filename) plus the
// serve-time ref-resolution check, and asserts id uniqueness. Returns a list of
// human-readable problems ([] means the recipe is sound). Factored out so the
// negative tests below can feed it deliberately-malformed recipes.
function checkRecipe(fileFormId: string, raw: unknown): string[] {
  const problems: string[] = [];

  const parsed = serviceContractRecipeSchema.safeParse(raw);
  if (!parsed.success) {
    problems.push(`${fileFormId}.json: schema validation failed`);
    return problems; // structural checks below need a valid shape
  }
  const recipe = parsed.data as unknown as { formId: string; steps: Step[] };

  if (recipe.formId !== fileFormId) {
    problems.push(
      `${fileFormId}.json: formId "${recipe.formId}" != filename "${fileFormId}"`,
    );
  }

  const seenStepIds = new Set<string>();
  for (const step of recipe.steps) {
    if (seenStepIds.has(step.stepId)) {
      problems.push(`${fileFormId}.json: duplicate stepId "${step.stepId}"`);
    }
    seenStepIds.add(step.stepId);

    const seenFieldIds = new Set<string>();
    for (const el of step.elements ?? []) {
      // Ref resolution against the builtin registry only. The production
      // resolver (RegistryService.resolve) also resolves DB-backed custom
      // components at serve time, which this spec can't see — no current recipe
      // uses one (the positive test passes), but if one is added this check
      // would flag it and need a builtin-namespace guard.
      if (!(el.ref in BUILTIN_REGISTRY)) {
        problems.push(
          `${fileFormId}.json: step "${step.stepId}" has unresolvable ref "${el.ref}"`,
        );
      }
      for (const fieldId of elementAuthoredFieldIds(el)) {
        if (seenFieldIds.has(fieldId)) {
          problems.push(
            `${fileFormId}.json: step "${step.stepId}" has duplicate fieldId "${fieldId}"`,
          );
        }
        seenFieldIds.add(fieldId);
      }
    }
  }

  return problems;
}

it("every recipe file parses, matches its filename, has unique stepIds and authored fieldIds, and resolves every ref", async () => {
  const recipes = await readRecipeFiles();

  // Guards against the regression this spec is fixing (#2075): if the scan ever
  // finds nothing again, the invariant checks below pass vacuously.
  expect(recipes.length).toBeGreaterThan(0);

  const problems = recipes.flatMap((r) => checkRecipe(r.fileFormId, r.raw));
  expect(problems).toEqual([]);
});

// A required National ID field next to a "use passport number instead" show-hide
// toggle must relax its required validation when the toggle is on (optionalIf),
// or a citizen without a National ID can never submit. See #761.
it("recipes pair passport show-hide toggles with optionalIf on the National ID field", async () => {
  type Behaviour = { type: string; targetFieldId?: string };
  type OverrideEl = {
    ref?: string;
    overrides?: {
      fieldId?: string;
      label?: string;
      hint?: string;
      behaviours?: Behaviour[];
      validations?: { required?: { value?: boolean } };
    };
  };
  type OverrideStep = { stepId: string; elements?: OverrideEl[] };

  const recipes = await readRecipeFiles();
  expect(recipes.length).toBeGreaterThan(0);

  const problems: string[] = [];

  for (const { fileFormId, raw } of recipes) {
    const recipe = serviceContractRecipeSchema.parse(raw) as unknown as {
      steps: OverrideStep[];
    };

    for (const step of recipe.steps) {
      const elements = step.elements ?? [];
      const passportToggleIds = elements
        .filter(
          (e) =>
            e.ref === "components/show-hide" &&
            /passport/i.test(
              `${e.overrides?.label ?? ""} ${e.overrides?.hint ?? ""}`,
            ),
        )
        .map((e) => e.overrides?.fieldId)
        .filter((id): id is string => Boolean(id));
      if (passportToggleIds.length === 0) continue;

      for (const e of elements) {
        if (e.ref !== "components/national-id-number") continue;
        if (e.overrides?.validations?.required?.value !== true) continue;
        const optionalIfTargets = (e.overrides?.behaviours ?? [])
          .filter((b) => b.type === "optionalIf")
          .map((b) => b.targetFieldId);
        if (
          !optionalIfTargets.some((t) => t && passportToggleIds.includes(t))
        ) {
          problems.push(
            `${fileFormId}.json: step "${step.stepId}" field "${e.overrides?.fieldId}" is required next to passport toggle(s) [${passportToggleIds.join(", ")}] but has no optionalIf targeting one`,
          );
        }
      }
    }
  }

  expect(problems).toEqual([]);
});

// Proves the net actually catches malformed recipes (#2075 acceptance criteria)
// without polluting the real recipes/ set: each synthetic recipe is a mutation
// of a real, valid one, and asserts the *specific* problem is reported so a
// case can't pass for the wrong reason.
describe("checkRecipe rejects malformed recipes", () => {
  let base: RecipeFile;
  beforeAll(async () => {
    const recipes = await readRecipeFiles();
    // Pick a recipe that actually has steps rather than relying on readdir
    // ordering — the mutation cases below index into steps.
    base =
      recipes.find((r) => {
        const steps = (r.raw as { steps?: unknown[] }).steps;
        return Array.isArray(steps) && steps.length > 0;
      }) ?? recipes[0];
  });
  const clone = () => structuredClone(base.raw) as Record<string, unknown>;

  it("passes the untouched real recipe", () => {
    expect(checkRecipe(base.fileFormId, base.raw)).toEqual([]);
  });

  it("fails on a schema violation (missing required field)", () => {
    const r = clone();
    delete r.title;
    expect(
      checkRecipe(base.fileFormId, r).some((p) =>
        p.includes("schema validation failed"),
      ),
    ).toBe(true);
  });

  it("fails on a filename / formId mismatch", () => {
    expect(
      checkRecipe("a-different-name", clone()).some((p) =>
        p.includes("!= filename"),
      ),
    ).toBe(true);
  });

  it("fails on an unresolvable ref", () => {
    const r = clone() as { steps: Step[] };
    r.steps[0].elements = [
      ...(r.steps[0].elements ?? []),
      { ref: "components/this-component-does-not-exist" },
    ];
    expect(
      checkRecipe(base.fileFormId, r).some((p) =>
        p.includes("unresolvable ref"),
      ),
    ).toBe(true);
  });

  it("fails on a duplicate stepId", () => {
    const r = clone() as { steps: Step[] };
    r.steps = [...r.steps, structuredClone(r.steps[0])];
    expect(
      checkRecipe(base.fileFormId, r).some((p) =>
        p.includes("duplicate stepId"),
      ),
    ).toBe(true);
  });

  it("fails on a duplicate fieldId within a step", () => {
    const r = clone() as { steps: Step[] };
    // Find a step with an authored component fieldId and duplicate that element.
    const step = r.steps.find((s) =>
      (s.elements ?? []).some(
        (e) => e.ref.startsWith("components/") && e.overrides?.fieldId,
      ),
    );
    expect(step).toBeDefined();
    const dup = step!.elements!.find(
      (e) => e.ref.startsWith("components/") && e.overrides?.fieldId,
    )!;
    step!.elements = [...step!.elements!, structuredClone(dup)];
    expect(
      checkRecipe(base.fileFormId, r).some((p) =>
        p.includes("duplicate fieldId"),
      ),
    ).toBe(true);
  });
});
