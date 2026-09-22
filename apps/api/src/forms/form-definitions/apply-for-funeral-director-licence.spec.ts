import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// The `documents` step carries the statutory eligibility gate (#2475), and the
// `application-type` step carries the new/renewal branch (#2717) that keeps it
// off renewals. Both are field-level wiring that only exists once the recipe is
// hydrated: `letter-evidencing` takes its `required` rule from an override
// (`components/upload-document` ships none), and the two statutory questions
// are shown by a `fieldConditionalOn` reading `application-type` from an
// earlier step. validate-recipes and recipe-invariants.spec.ts read the file on
// disk, so neither can see whether that survives a merge — and the uniqueness
// check in recipe-invariants is scoped to a single step, so it cannot see a
// second `application-type` reintroduced elsewhere in the form either.
//
// It has been lost once already: #2583 added `letter-evidencing` with no
// `required` rule at all, so the upload rendered "(optional)" and an applicant
// could skip the evidence entirely — a gate with none of the effect. A Form
// Builder republish regenerates this recipe from builder state and can drop
// the same wiring again without any code change to notice it.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-funeral-director-licence.json",
);

type HydratedField = {
  fieldId: string;
  htmlType?: string;
  options?: { value: string; label: string }[];
  behaviours?: Record<string, unknown>[];
  validations?: Record<string, { value?: unknown; error?: string }>;
};

type HydratedStep = { stepId: string; elements: HydratedField[] };

// `targetStepId` is load-bearing, not decoration: the client defaults an absent
// one to the field's OWN step, so without it this gate resolves against
// `documents`, finds no `application-type` there, and hides both statutory
// questions from everyone — including the new applicants they exist for.
const NEW_LICENCE_ONLY = [
  {
    type: "fieldConditionalOn",
    targetFieldId: "application-type",
    targetStepId: "application-type",
    operator: "equal",
    value: "new",
  },
];

async function hydratedSteps(): Promise<HydratedStep[]> {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  // Every ref in this recipe is a builtin, so a miss is a bug in the recipe,
  // not a DB-backed custom component — fail loudly rather than returning null.
  const resolver: Resolver = async (ref) => {
    const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
    if (!entry) throw new Error(`unresolvable ref "${ref}"`);
    return entry;
  };
  const hydrated = await hydrateForm(recipe, resolver);
  return hydrated.steps as unknown as HydratedStep[];
}

async function stepFields(stepId: string): Promise<HydratedField[]> {
  const step = (await hydratedSteps()).find((s) => s.stepId === stepId);
  expect(step, `step "${stepId}" is missing from the recipe`).toBeDefined();
  return step!.elements;
}

const documentFields = () => stepFields("documents");

it("asks whether the licence is new or a renewal, before the statutory questions", async () => {
  const stepIds = (await hydratedSteps()).map((s) => s.stepId);
  expect(stepIds.indexOf("application-type")).toBeLessThan(
    stepIds.indexOf("documents"),
  );

  const type = (await stepFields("application-type")).find(
    (f) => f.fieldId === "application-type",
  )!;
  expect(type, "application-type is missing").toBeDefined();
  expect(type.htmlType).toBe("radio");
  expect(type.options?.map((o) => o.value)).toEqual(["new", "renewal"]);
  expect(type.validations?.required?.value).toBe(true);
  // Unconditional: the branch itself must always be asked.
  expect(type.behaviours ?? []).toEqual([]);
});

// The branch is one question asked once. A second `application-type` anywhere
// else in the form would bind to the same answer key and silently overwrite it,
// and recipe-invariants' duplicate check is per-step, so nothing else fails.
it("asks the branch question exactly once in the whole form", async () => {
  const steps = await hydratedSteps();
  const occurrences = steps.flatMap((s) =>
    s.elements
      .filter((f) => f.fieldId === "application-type")
      .map(() => s.stepId),
  );
  expect(occurrences).toEqual(["application-type"]);
});

it("keeps the statutory questions in the documents step", async () => {
  expect((await documentFields()).map((f) => f.fieldId)).toEqual([
    "passport-photo",
    "upload-scanned-id",
    "experience-route",
    "letter-evidencing",
  ]);
});

// The 1984 regulations' experience tests are what qualify someone for a FIRST
// licence. A renewing director has already met them, so requiring the letter
// again would block every January renewal on evidence they may not still hold.
it.each(["experience-route", "letter-evidencing"])(
  "shows %s only for a new licence, and requires it there",
  async (fieldId) => {
    const field = (await documentFields()).find((f) => f.fieldId === fieldId)!;
    expect(field, `${fieldId} is missing`).toBeDefined();
    expect(field.validations?.required?.value).toBe(true);
    expect(field.behaviours).toEqual(NEW_LICENCE_ONLY);
  },
);

// resolveOptionDisplay sends an option's LABEL, not its slug, to the MDA
// notification email and the CMS webhook, so the statutory test the applicant
// claimed has to be legible in the label itself. "prior to 1984" is the
// qualifier that separates the two routes — without it, three years of
// ordinary post-1984 office work reads as qualifying.
it("keeps the 1984 qualifier in the option label the officer receives", async () => {
  const route = (await documentFields()).find(
    (f) => f.fieldId === "experience-route",
  )!;
  const labels = route.options?.map((o) => o.label) ?? [];
  expect(labels).toHaveLength(2);
  expect(labels.some((l) => /1984/.test(l))).toBe(true);
});
