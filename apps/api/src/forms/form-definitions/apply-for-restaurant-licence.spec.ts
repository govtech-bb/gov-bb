import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  type Primitive,
} from "@govtech-bb/form-types";
import { validateField } from "@govtech-bb/form-validation";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// This recipe leans entirely on FIELD-level behaviours: each day's opening
// hours are a gate plus a fieldArray on one text field, and three other
// questions only appear for a particular answer. Element behaviours and
// validations reach the served contract through applyFieldOverrides, so a change
// there would serve all seven hours fields at once (unrepeatable, and with the
// 09:00 - 17:00 format unenforced) and show the conditional questions to
// everyone. validate-recipes and recipe-invariants.spec.ts both read the file on
// disk, so neither can see that. This spec hydrates the real recipe and asserts
// the wiring survives.
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

async function hydratedFields(stepId: string): Promise<HydratedField[]> {
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
  return step!.elements as unknown as HydratedField[];
}

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

it.each(DAYS)(
  "shows %s's hours only when that day is selected and the hours differ, and lets them repeat",
  async (day) => {
    const fields = await hydratedFields("opening-hours");
    const field = fields.find((f) => f.fieldId === `${day}-hours`);
    expect(field, `${day}-hours is missing`).toBeDefined();
    // The two conditions AND together, so a per-day field appears only when
    // that day is ticked AND the applicant said the hours are not the same
    // every day. Were they OR'd, every ticked day would show its own field
    // alongside the shared one and the applicant would answer twice.
    expect(field!.behaviours).toEqual([
      expect.objectContaining({
        type: "fieldConditionalOn",
        targetFieldId: "opening-days",
        operator: "in",
        value: [day],
      }),
      expect.objectContaining({
        type: "fieldConditionalOn",
        targetFieldId: "same-hours-every-day",
        operator: "equal",
        value: "no",
      }),
      expect.objectContaining({ type: "fieldArray", min: 1, max: 3 }),
    ]);
  },
);

// The shared field is the other half of that gate: most restaurants keep one
// set of hours, so they answer once here instead of once per open day.
it("shows the shared hours only when the hours are the same every day", async () => {
  const fields = await hydratedFields("opening-hours");
  const field = fields.find((f) => f.fieldId === "everyday-hours");
  expect(field, "everyday-hours is missing").toBeDefined();
  expect(field!.behaviours).toEqual([
    expect.objectContaining({
      type: "fieldConditionalOn",
      targetFieldId: "same-hours-every-day",
      operator: "equal",
      value: "yes",
    }),
    expect.objectContaining({ type: "fieldArray", min: 1, max: 3 }),
  ]);
});

// The hours are free text, so "09:00 - 17:00" is only as good as the pattern
// rule — and it has to hold for EVERY entry the applicant adds, not just the
// first. Run the real validator over the hydrated field to prove both.
it.each([
  [["09:00 - 17:00"], true],
  [["9:00-17:00"], true], // a missing zero is a typing habit, not a different answer
  [["11:00 - 15:00", "18:00 - 22:00"], true], // a second set of hours
  [["11:00 - 15:00", "9am to 5pm"], false], // ...which is still checked
  [["24:00 - 25:00"], false],
  [["all day"], false],
])("validates %j as Monday's hours -> %s", async (entries, valid) => {
  const fields = await hydratedFields("opening-hours");
  const monday = fields.find((f) => f.fieldId === "monday-hours");
  expect(monday, "monday-hours is missing").toBeDefined();

  const errors = validateField(monday as unknown as Primitive, entries, {});
  expect(errors, errors.join("; ")).toHaveLength(valid ? 0 : 1);
});

// The shared field is a second copy of that rule. The table above proves what
// the rule accepts; this proves both fields are running the same one, so an
// applicant is not held to a different standard depending on which branch of
// the gate they took.
it("holds the shared hours to the same format rule as a per-day one", async () => {
  const fields = await hydratedFields("opening-hours");
  const patternOf = (fieldId: string) =>
    fields.find((f) => f.fieldId === fieldId)?.validations?.pattern?.value;

  expect(patternOf("everyday-hours")).toBeDefined();
  expect(patternOf("everyday-hours")).toBe(patternOf("monday-hours"));
});

// Each entry: the step holding the field, the gated field, and the answer that
// reveals it.
const GATED_FIELDS: [string, string, Record<string, unknown>][] = [
  [
    "about-application",
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
  ...(
    [
      "other-prep-location-business",
      "other-prep-location-address-1",
      "other-prep-location-address-2",
    ] as const
  ).map((fieldId): [string, string, Record<string, unknown>] => [
    "food-preparation",
    fieldId,
    {
      targetFieldId: "food-prep-location",
      operator: "in",
      value: ["commercial-kitchen", "another-location"],
    },
  ]),
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
  const fields = await hydratedFields("about-application");
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
  ["food-preparation", "other-prep-location-address-2"],
])("serves %s.%s as optional", async (stepId, fieldId) => {
  const fields = await hydratedFields(stepId);
  const field = fields.find((f) => f.fieldId === fieldId);
  expect(field, `${fieldId} is missing from ${stepId}`).toBeDefined();
  expect(field!.validations?.required?.value).toBe(false);
});
