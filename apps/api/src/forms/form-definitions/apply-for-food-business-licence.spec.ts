import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// This recipe leans on four behaviours whose loss is SILENT: hydrateForm has to
// carry each one onto the served contract, and a dropped behaviour degrades to
// plausible-looking-but-wrong UI rather than an error. validate-recipes and
// recipe-invariants.spec.ts both read the file on disk, so neither can see it.
// The worst case is the floor-plan `optionalIf`: without it the upload stays
// hard-required next to its "I do not have a floor plan" toggle, and anyone
// taking the planning-number route can never submit. Same shape of guard as
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

it("relaxes the floor-plan upload when the planning-number route is taken", async () => {
  const upload = await field("floor-plan", "floor-plan-upload");

  // Required on its own, so the upload is the default path...
  expect(upload.validations).toMatchObject({ required: { value: true } });
  // ...but relaxed by the toggle, or the alternative route cannot submit.
  expect(
    (upload.behaviours ?? []).filter((b) => b.type === "optionalIf"),
    "floor-plan-upload lost its optionalIf — the planning-number route is unsubmittable",
  ).toEqual([
    {
      type: "optionalIf",
      targetFieldId: "no-floor-plan-toggle",
      operator: "equal",
      value: true,
    },
  ]);

  const alternative = await field("floor-plan", "planning-application-number");
  expect(alternative.behaviours).toEqual([
    {
      type: "fieldConditionalOn",
      targetFieldId: "no-floor-plan-toggle",
      operator: "equal",
      value: true,
    },
  ]);
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

  // The sex-split headcounts these replaced asked for something reg. 10(1)
  // leaves to the Medical Officer of Health at inspection (ADR 0068).
  const steps = await hydratedSteps();
  const people = steps.find(
    (s) => s.stepId === "people-working-at-the-food-business",
  );
  const fieldIds = people!.elements.map((e) => e.fieldId);
  expect(fieldIds).not.toContain("number-of-male-staff");
  expect(fieldIds).not.toContain("number-of-female-staff");
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
