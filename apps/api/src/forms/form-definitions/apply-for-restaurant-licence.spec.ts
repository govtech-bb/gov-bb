import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  type Primitive,
} from "@govtech-bb/form-types";
import { validateField } from "@govtech-bb/form-validation";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// This recipe leans on FIELD-level behaviours: opening hours are one weekly
// `opening-hours` field whose format rule reaches the contract through
// applyFieldOverrides, and three other questions only appear for a particular
// answer. A change there would serve the hours with the "Day HH:MM - HH:MM"
// format unenforced and show the conditional questions to everyone.
// validate-recipes and recipe-invariants.spec.ts both read the file on disk,
// so neither can see that. This spec hydrates the real recipe and asserts the
// wiring survives.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-restaurant-licence.json",
);

type HydratedField = {
  fieldId: string;
  htmlType?: string;
  behaviours?: Record<string, unknown>[];
  validations?: Record<string, { value?: unknown; error?: string }>;
};

type HydratedStep = {
  stepId: string;
  behaviours?: Record<string, unknown>[];
  elements: HydratedField[];
};

async function hydratedStep(stepId: string): Promise<HydratedStep> {
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
  const step = hydrated.steps.find((s) => s.stepId === stepId);
  expect(step, `step "${stepId}" is missing from the recipe`).toBeDefined();
  return step! as unknown as HydratedStep;
}

async function hydratedFields(stepId: string): Promise<HydratedField[]> {
  return (await hydratedStep(stepId)).elements;
}

// The step is one weekly field: seven day rows, native time pickers, value
// entries shaped "Monday 09:00 - 17:00". The old shape (a days checkbox, a
// "same hours every day?" gate and seven gated per-day text fields) is gone —
// were any of it still served, the applicant would answer the question twice.
it("serves opening hours as the single weekly field", async () => {
  const fields = await hydratedFields("opening-hours");
  expect(fields.map((f) => f.fieldId)).toEqual(["opening-hours"]);
  expect(fields[0].htmlType).toBe("opening-hours");
});

// A restaurant that is never open cannot be licensed to open: the required
// rule is what rejects a week of "Not open" rows.
it("requires hours for at least one day", async () => {
  const fields = await hydratedFields("opening-hours");
  const field = fields.find((f) => f.fieldId === "opening-hours");
  expect(field, "opening-hours is missing").toBeDefined();

  const errors = validateField(field as unknown as Primitive, [], {});
  expect(errors).toEqual(["Add opening hours for at least one day"]);
});

// The renderer composes each entry from two native time pickers, so the
// pattern rule is the guard against a set of hours that was added but never
// completed — and it has to hold for EVERY entry the applicant adds, not just
// the first. Run the real validator over the hydrated field to prove both.
it.each([
  [["Monday 09:00 - 17:00"], true],
  [["Monday 11:00 - 15:00", "Monday 18:00 - 22:00"], true], // a second set of hours
  [["Friday 18:00 - 02:00"], true], // overnight service is a real answer
  [["Monday 00:00 - 23:59"], true], // open 24 hours, as the hint instructs
  [["Monday 00:00 - 00:00"], false], // the meaningless non-answer #2358 called out
  [["Monday 09:00 - 09:00"], false], // an equal open and close is never an answer
  [["Monday 09:00 -"], false], // added but never completed
  [["Monday 11:00 - 15:00", "Monday 18:00 -"], false], // ...which is still checked
  [["Monday 9am to 5pm"], false],
  [["Someday 09:00 - 17:00"], false],
])("validates %j as opening hours -> %s", async (entries, valid) => {
  const fields = await hydratedFields("opening-hours");
  const field = fields.find((f) => f.fieldId === "opening-hours");
  expect(field, "opening-hours is missing").toBeDefined();

  const errors = validateField(field as unknown as Primitive, entries, {});
  expect(errors, errors.join("; ")).toHaveLength(valid ? 0 : 1);
});

// Each entry: the step holding the field, the gated field, and the answer that
// reveals it.
const GATED_FIELDS: [string, string, Record<string, unknown>][] = [
  [
    "about-applicant",
    "relationship-other",
    {
      targetFieldId: "relationship-to-restaurant",
      operator: "equal",
      value: "something-else",
    },
  ],
  [
    "about-restaurant",
    "restaurant-expected-start-date",
    {
      targetFieldId: "restaurant-already-open",
      operator: "equal",
      value: "no",
    },
  ],
  [
    "about-restaurant",
    "property-use-other",
    {
      targetFieldId: "property-use",
      operator: "equal",
      value: "something-else",
    },
  ],
];

it.each(GATED_FIELDS)(
  "gates %s.%s behind the answer that needs it",
  async (stepId, fieldId, gate) => {
    const fields = await hydratedFields(stepId);
    const field = fields.find((f) => f.fieldId === fieldId);
    expect(field, `${fieldId} is missing from ${stepId}`).toBeDefined();
    expect(field!.behaviours).toEqual([
      expect.objectContaining({ type: "fieldConditionalOn", ...gate }),
    ]);
  },
);

// Six options on a radio is a Rule 8 violation, and the two controls are
// nothing alike to use — six stacked radios versus one dropdown. The ref is the
// only thing that decides which renders, so pin the served type rather than the
// ref spelling.
it("serves the relationship question as a dropdown, not six radios", async () => {
  const fields = await hydratedFields("about-applicant");
  const field = fields.find((f) => f.fieldId === "relationship-to-restaurant");
  expect(field, "relationship-to-restaurant is missing").toBeDefined();
  expect(field!.htmlType).toBe("select");
});

// `components/address` ships `required: true`, so a second address line is
// mandatory unless the recipe overrides it — and the override only counts once
// hydration has merged it over the registry default. Reading the recipe file
// alone would miss a merge that dropped it.
it.each([
  ["about-you", "your-address-line-2"],
  ["applicant-details", "applicant-address-line-2"],
  ["about-restaurant", "restaurant-address-line-2"],
  ["location-food-drink-prepared", "other-establishment-address-2"],
])("serves %s.%s as optional", async (stepId, fieldId) => {
  const fields = await hydratedFields(stepId);
  const field = fields.find((f) => f.fieldId === fieldId);
  expect(field, `${fieldId} is missing from ${stepId}`).toBeDefined();
  expect(field!.validations?.required?.value).toBe(false);
});

// The three off-site address questions used to sit in `food-preparation`, each
// with its own fieldConditionalOn. They are now one repeatable step, so the gate
// that used to be per-field is the step's — and a step gate is invisible to
// GATED_FIELDS above. `another-location` belongs in the gate alongside
// `commercial-kitchen`: ADR 0068 keeps "the addresses where food is prepared
// elsewhere" on the form, and dropping it leaves that answer asking nothing.
it("gates the off-site address step on both away-from-restaurant answers", async () => {
  const step = await hydratedStep("location-food-drink-prepared");

  expect(step.behaviours).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "stepConditionalOn",
        targetStepId: "food-preparation",
        targetFieldId: "food-prep-location",
        operator: "in",
        value: ["commercial-kitchen", "another-location"],
      }),
      expect.objectContaining({ type: "repeatable" }),
    ]),
  );

  // An establishment is not a person: `components/name` would enforce the
  // person-name pattern and reject "KFC #4".
  expect(step.elements.map((e) => e.fieldId)).toEqual([
    "other-establishment-name",
    "other-establishment-address-1",
    "other-establishment-address-2",
    "other-establishment-parish",
  ]);
  const name = step.elements.find(
    (e) => e.fieldId === "other-establishment-name",
  );
  expect(name!.htmlType).toBe("text");
  expect(name!.validations?.pattern).toBeUndefined();
});

// `components/show-hide` is only ever a gate for something else, so a toggle
// with nothing conditioned on it is dead config and the field it should reveal
// is always on screen.
it("reveals the planning tracking number only when the toggle is on", async () => {
  const fields = await hydratedFields("floor-plan");
  const tracking = fields.find((f) => f.fieldId === "tracking-number-instead");
  expect(tracking, "tracking-number-instead is missing").toBeDefined();

  expect(tracking!.behaviours).toEqual([
    expect.objectContaining({
      type: "fieldConditionalOn",
      targetFieldId: "building-plan-number",
      operator: "equal",
      value: true,
    }),
  ]);
});
