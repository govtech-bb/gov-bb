import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// The `documents` step carries an either/or statutory-evidence gate: an
// applicant uploads their `embalmer-qualification`, or ticks
// `use-reference-letter` to swap it for `embalmer-evidence` instead. Both
// routes exist to prove eligibility for a FIRST licence — a renewing embalmer
// has already proven it once, and requiring either upload again blocked
// renewals on evidence they may not still hold (#2790). The sibling
// `apply-for-funeral-director-licence` recipe hit the identical defect and
// was fixed the same way in #2739: gate the statutory fields behind the
// `application-type` question asked earlier in the form, via a
// `fieldConditionalOn` with an explicit `targetStepId`. This is field-level
// wiring that only exists once the recipe is hydrated, so validate-recipes
// and recipe-invariants.spec.ts (which read the file on disk) can't see
// whether it survives a merge — and recipe-invariants' uniqueness check is
// scoped to a single step, so it can't see a second `application-type`
// reintroduced elsewhere in the form either.
//
// A Form Builder republish regenerates this recipe from builder state and can
// drop the same wiring again without any code change to notice it.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-funeral-embalmer-licence.json",
);

type HydratedField = {
  fieldId: string;
  htmlType?: string;
  options?: { value: string; label: string }[];
  behaviours?: Record<string, unknown>[];
  validations?: Record<string, { value?: unknown; error?: string }>;
};

type HydratedStep = { stepId: string; elements: HydratedField[] };

// `targetStepId` is load-bearing, not decoration: the client defaults an
// absent one to the field's OWN step, so without it this gate resolves
// against `documents`, finds no `application-type` there, and hides all
// three statutory fields from everyone — including the new applicants they
// exist for.
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

it("asks whether the licence is new or a renewal, before the documents step", async () => {
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
// else in the form would bind to the same answer key and silently overwrite
// it, and recipe-invariants' duplicate check is per-step, so nothing else
// fails.
it("asks the branch question exactly once in the whole form", async () => {
  const steps = await hydratedSteps();
  const occurrences = steps.flatMap((s) =>
    s.elements
      .filter((f) => f.fieldId === "application-type")
      .map(() => s.stepId),
  );
  expect(occurrences).toEqual(["application-type"]);
});

it("keeps the documents step's field order", async () => {
  expect((await documentFields()).map((f) => f.fieldId)).toEqual([
    "upload-id",
    "passport-photo",
    "embalmer-qualification",
    "use-reference-letter",
    "embalmer-evidence",
  ]);
});

it("keeps the ID and photograph uploads unconditional, so a renewal completes on those two alone", async () => {
  const fields = await documentFields();
  for (const fieldId of ["upload-id", "passport-photo"]) {
    const field = fields.find((f) => f.fieldId === fieldId)!;
    expect(field, `${fieldId} is missing`).toBeDefined();
    expect(field.validations?.required?.value).toBe(true);
    expect(field.behaviours ?? []).toEqual([]);
  }
});

// The 1984 regulations' experience tests are what qualify someone for a
// FIRST licence. A renewing embalmer has already met them, so requiring
// either the qualification or the reference-letter evidence again would
// block every renewal on proof they may not still hold.
it("shows the statutory evidence only for a new licence, keeping the either/or wiring", async () => {
  const fields = await documentFields();

  const qualification = fields.find(
    (f) => f.fieldId === "embalmer-qualification",
  )!;
  expect(qualification, "embalmer-qualification is missing").toBeDefined();
  expect(qualification.behaviours).toEqual([
    {
      type: "optionalIf",
      targetFieldId: "use-reference-letter",
      targetStepId: "documents",
      operator: "equal",
      value: true,
    },
    ...NEW_LICENCE_ONLY,
  ]);
  expect(qualification.validations?.required?.value).toBe(true);

  const referenceLetter = fields.find(
    (f) => f.fieldId === "use-reference-letter",
  )!;
  expect(referenceLetter, "use-reference-letter is missing").toBeDefined();
  expect(referenceLetter.behaviours).toEqual(NEW_LICENCE_ONLY);
  expect(referenceLetter.htmlType).toBe("show-hide");

  const evidence = fields.find((f) => f.fieldId === "embalmer-evidence")!;
  expect(evidence, "embalmer-evidence is missing").toBeDefined();
  expect(evidence.behaviours).toEqual([
    {
      type: "fieldConditionalOn",
      targetFieldId: "use-reference-letter",
      targetStepId: "documents",
      operator: "equal",
      value: true,
    },
    ...NEW_LICENCE_ONLY,
  ]);
  expect(evidence.validations?.required?.value).toBe(true);
});
