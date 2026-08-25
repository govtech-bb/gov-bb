import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// This recipe leans on four behaviours whose loss is SILENT: hydrateForm has to
// carry each one onto the served contract, and a dropped behaviour degrades to
// plausible-looking-but-wrong UI rather than an error. validate-recipes and
// recipe-invariants.spec.ts both read the file on disk, so neither can see it.
// The worst case is a step gate: `other-preparation-locations` must intersect
// the multi-select `preparation-location` with `in`, because `equal` silently
// never matches an array (#1713) and the off-site questions just stop being
// asked. Same shape of guard as
// request-an-environmental-health-officer.spec.ts.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-food-business-licence.json",
);

type HydratedField = {
  fieldId: string;
  variant?: string;
  content?: string;
  validations?: Record<string, unknown>;
  behaviours?: { type: string; [key: string]: unknown }[];
};

type HydratedStep = {
  stepId: string;
  behaviours?: { type: string; [key: string]: unknown }[];
  elements: HydratedField[];
};

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

async function field(stepId: string, fieldId: string): Promise<HydratedField> {
  const steps = await hydratedSteps();
  const step = steps.find((s) => s.stepId === stepId);
  expect(step, `step "${stepId}" is missing from the recipe`).toBeDefined();
  const found = step!.elements.find((e) => e.fieldId === fieldId);
  expect(found, `field "${fieldId}" is missing from "${stepId}"`).toBeDefined();
  return found!;
}

it("keeps the applicant's telephone repeatable, so several owners' numbers fit", async () => {
  const tel = await field("about-you", "your-telephone");

  expect(
    (tel.behaviours ?? []).filter((b) => b.type === "fieldArray"),
    "your-telephone lost its fieldArray in hydration — it renders as a single input",
  ).toEqual([
    {
      type: "fieldArray",
      min: 1,
      max: 4,
      addAnotherLabel: "Add another telephone number",
    },
  ]);
  // fieldArray only repeats the text-like renderers; `tel` is one of them.
  expect(tel).toMatchObject({ htmlType: "tel" });
});

// The designer pass dropped the "I do not have a floor plan" toggle and the
// Town and Country Planning application number that stood in for the upload, so
// the step is one optional document: the plan is invited, not demanded. Those
// two facts are coupled. The old `optionalIf` existed so the planning-number
// route stayed submittable; with no route left, making the upload required
// again would strand every applicant whose plans are still with Planning. So
// `required` may only come back alongside an alternative.
it("invites the floor plan without demanding it, now the stand-in is gone", async () => {
  const steps = await hydratedSteps();
  const step = steps.find((s) => s.stepId === "floor-plan");
  expect(step, "the floor-plan step is missing from the recipe").toBeDefined();

  expect(step!.elements.map((e) => e.fieldId)).toEqual(["floor-plan-upload"]);
  const required = (
    step!.elements[0].validations as
      | { required?: { value?: unknown } }
      | undefined
  )?.required?.value;
  expect(
    required,
    "floor-plan-upload is required again but nothing stands in for it — an applicant without a plan to hand cannot submit",
  ).not.toBe(true);
});

it("repeats the supplier step, gated on preparing food away from the business", async () => {
  const steps = await hydratedSteps();
  const step = steps.find((s) => s.stepId === "other-preparation-locations");
  expect(step, "the supplier step is missing from the recipe").toBeDefined();

  expect(step!.behaviours).toEqual([
    {
      type: "repeatable",
      min: 1,
      max: 5,
      addAnotherLabel:
        "Do you need to add another place where food or drink is prepared?",
      instanceLabel: "Place",
    },
    {
      type: "stepConditionalOn",
      targetStepId: "where-food-is-prepared",
      targetFieldId: "preparation-location",
      // `in` set-intersects against the multi-select checkbox array (#1713):
      // the step shows when EITHER off-site option is ticked.
      operator: "in",
      value: ["at-another-food-business", "at-another-location"],
    },
  ]);
});

// A designer pass added a second repeatable step asking the same establishment
// name and address as `other-preparation-locations`, gated with `equal` against
// the multi-select `preparation-location` — which cannot match (#1713), so it
// was either dead or a double-ask. One step owns these questions.
it("asks where food is prepared off-site in exactly one step", async () => {
  const steps = await hydratedSteps();
  const offSite = steps.filter((s) =>
    (s.behaviours ?? []).some(
      (b) =>
        b.type === "stepConditionalOn" &&
        b.targetFieldId === "preparation-location",
    ),
  );

  expect(offSite.map((s) => s.stepId)).toEqual(["other-preparation-locations"]);
});

it("shows the supplier-licence warning only once an off-site option is ticked", async () => {
  const warning = await field(
    "where-food-is-prepared",
    "supplier-licence-warning",
  );

  expect(warning).toMatchObject({
    htmlType: "content",
    variant: "warning",
    content:
      "It is your responsibility to make sure your suppliers have a valid food licence.",
  });
  expect(
    warning.behaviours,
    "the warning lost its conditional — it now shows to every applicant",
  ).toEqual([
    {
      type: "fieldConditionalOn",
      targetFieldId: "preparation-location",
      operator: "in",
      value: ["at-another-food-business", "at-another-location"],
    },
  ]);
});

it("reveals the vehicle registration number only for a mobile van", async () => {
  const reg = await field(
    "about-the-food-business",
    "vehicle-registration-number",
  );

  expect(reg.behaviours).toEqual([
    {
      type: "fieldConditionalOn",
      targetFieldId: "premises-type",
      operator: "equal",
      value: "mobile-van",
    },
  ]);
  // Rule 9b: registration numbers are text, never number inputs.
  expect(reg).toMatchObject({ htmlType: "text" });
});

it("drops the steps Environmental Health covers at inspection", async () => {
  const steps = await hydratedSteps();
  const stepIds = steps.map((s) => s.stepId);

  expect(stepIds).not.toContain("food-and-drink");
  expect(stepIds).not.toContain("cooking-and-keeping-food");
  expect(stepIds).not.toContain("rubbish-and-food-waste");
});

it("lets several medical certificates be uploaded at once, and does not demand them", async () => {
  const certs = await field(
    "people-working-at-the-food-business",
    "medical-certificates-upload",
  );

  // A dropped `multiple` degrades silently: the field still renders and still
  // accepts a file, so the applicant uploads one certificate for a whole staff
  // and nothing anywhere reports the other files were never askable for.
  expect(
    certs,
    "medical-certificates-upload lost `multiple` — only one certificate can be attached",
  ).toMatchObject({ multiple: true });

  // The start page tells applicants they may bring certificates to the
  // inspection instead, so requiring them here would contradict it.
  expect(certs.validations).not.toHaveProperty("required");
});

it("requires the staff list as a document, not a headcount", async () => {
  const list = await field(
    "people-working-at-the-food-business",
    "staff-list-upload",
  );
  expect(list.validations).toMatchObject({ required: { value: true } });

  // The sex-split headcounts sit alongside it rather than instead of it: ADR
  // 0068 keeps "staff numbers by sex, which fix the restroom provision the
  // premises must meet" on the form. An earlier version of this guard asserted
  // the opposite and cited the same ADR; it only kept passing because the
  // fields came back under different ids (`male-staff-count`, not
  // `number-of-male-staff`).
  const steps = await hydratedSteps();
  const people = steps.find(
    (s) => s.stepId === "people-working-at-the-food-business",
  );
  const fieldIds = people!.elements.map((e) => e.fieldId);
  expect(fieldIds).toContain("male-staff-count");
  expect(fieldIds).toContain("female-staff-count");
});

// The catchment half of the recipe. A wrong path here is the worst kind of
// silent failure: geometry never resolves, so `catchment.mdaEmail` finds no
// recipient and the polyclinic that has to inspect the premises is never told —
// once per submission, at runtime, with nothing red anywhere. Assert the paths
// name fields the recipe actually has.
describe("Environmental Health routing", () => {
  async function recipe(): Promise<{
    processors: { type: string; config: Record<string, never> }[];
    catchmentRouting: { coordinatesField: string; parishField: string };
  }> {
    return JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  }

  it("routes both the case and the notification to the serving polyclinic", async () => {
    const { processors } = await recipe();

    const webhook = processors.find((p) => p.type === "webhook");
    expect(webhook?.config).toMatchObject({
      mapping: {
        // MOH-FBL-2608-… — the prefix is minted from these two, and a
        // reference is immutable once issued.
        mdaCode: "MOH",
        programmeShortCode: "FBL",
        programmeCode: "FOOD_BUSINESS_LICENCE",
      },
    });

    const recipients = processors
      .filter((p) => p.type === "email")
      .map((p) => (p.config as { recipientField?: string }).recipientField);
    expect(recipients).toContain("about-you.your-email");
    expect(recipients).toContain("catchment.mdaEmail");
  });

  it("points catchmentRouting at fields the recipe actually has", async () => {
    const { catchmentRouting } = await recipe();
    const steps = await hydratedSteps();

    for (const path of [
      catchmentRouting.coordinatesField,
      catchmentRouting.parishField,
    ]) {
      const [stepId, fieldId] = path.split(".");
      const step = steps.find((s) => s.stepId === stepId);
      expect(
        step,
        `catchmentRouting names missing step "${stepId}"`,
      ).toBeDefined();
      expect(
        step!.elements.map((e) => e.fieldId),
        `catchmentRouting names missing field "${path}"`,
      ).toContain(fieldId);
    }
  });

  // The coordinate only ever gets written by the address lookup, so the
  // geocode target and the hidden field have to stay in step.
  it("writes the coordinate the routing reads from the address lookup", async () => {
    const { catchmentRouting } = await recipe();
    const lookup = await field(
      "about-the-food-business",
      "business-location-address-line-1",
    );

    expect(
      (lookup as { geocodeTargets?: { coordinatesFieldId?: string } })
        .geocodeTargets?.coordinatesFieldId,
    ).toBe(catchmentRouting.coordinatesField.split(".")[1]);
  });
});

// A `fieldConditionalOn` that names a field on ANOTHER step must say so with
// `targetStepId`. The client defaults an absent `targetStepId` to the field's
// own step (`checkConditionalOn` in apps/forms), so a cross-step condition
// without it resolves against `applicant-details.completing-for` — which never
// exists — and the field is hidden for everyone. The API's evaluator falls back
// to a flat whole-form lookup instead, so the two sides disagree: the renderer
// never asks the question while the server still counts it as required.
it("points applicant-type at the step `completing-for` actually lives on", async () => {
  const applicantType = await field("applicant-details", "applicant-type");

  expect(
    applicantType.behaviours,
    "applicant-type's conditional lost its targetStepId — the question is never asked when someone applies on another's behalf",
  ).toEqual([
    {
      type: "fieldConditionalOn",
      targetStepId: "about-you",
      targetFieldId: "completing-for",
      operator: "equal",
      value: "someone-else",
    },
  ]);
});
