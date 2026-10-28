import * as fs from "node:fs";
import * as path from "node:path";

// Every form ends on the standard declaration agreed on #2920 and recorded on
// #2957. Before that, 45 recipes carried a long sentence that bundled consent
// to verification and a false-information warning into every form by default,
// and ~30 more drifted into their own wording. A service with a genuine need
// for something extra keeps it in a SEPARATE element on the declaration step
// (see request-an-environmental-health-officer), never inside this checkbox —
// so the checkbox itself can be checked exactly.
const RECIPES_DIR = path.resolve(__dirname, "recipes");

const STANDARD = {
  title: "Confirm and submit your application",
  option:
    "I confirm that the information I have provided is true and correct to the best of my knowledge.",
  error: "You must confirm the declaration to continue.",
};

/** Forms that do not use the standard declaration, each with its reason. */
const EXEMPT: Record<string, string> = {
  "chat-feedback":
    "Feedback survey. The chat confirms the declaration automatically (ADR 0049).",
  "apply-for-swimming-pool-licence":
    "Environmental Health's content review asked for a 'Your agreement' step with full name and date (#2856 B12), pending a decision on the standard EH agreement.",
  "national-id-application":
    "Not moved yet: uses the shared blocks/applicant-declaration block, see #2992.",
};

/**
 * Service-specific acknowledgements kept beside the standard checkbox when
 * #2957 moved each form to it. Pinned so a builder or AI edit can't drop them
 * quietly; remove an entry only when the service no longer needs the clause.
 */
const ACKNOWLEDGEMENTS: Record<string, string[]> = {
  "apply-for-food-business-licence": ["authority-confirmed"],
  "apply-for-national-summer-camp-programme": ["parent-guardian-confirmed"],
  "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026":
    ["parent-guardian-confirmed"],
  "apply-for-temporary-restaurant-permit": [
    "regulations-acknowledged",
    "overtime-costs-acknowledged",
  ],
  "bssee-form-b-defer-examination": ["one-opportunity-acknowledged"],
  "camp-director-application": ["suitability-check-consent"],
  "national-summer-camp-2025-registration": ["camp-rules-agreed"],
  "request-a-presidential-visit-for-a-centenarian": ["request-terms-confirmed"],
  "request-an-environmental-health-officer": [
    "regulations-acknowledged",
    "overtime-costs-acknowledged",
  ],
  "youth-leadership-workshop-registration-2026": ["responses-use-consent"],
};

/** Forms with no declaration step at all, each with its reason. */
const NO_DECLARATION: Record<string, string> = {
  "driver-licence-renewal":
    "Stub recipe with no processors, not a live application.",
  "exit-survey": "Feedback survey, not an application.",
};

type Element = { ref?: string; fieldId?: string; overrides?: Element } & {
  options?: { label: string }[];
  validations?: { required?: { error?: string } };
};
type Step = { stepId: string; title: string; elements?: Element[] };

const recipes = fs
  .readdirSync(RECIPES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map(
    (file) =>
      JSON.parse(fs.readFileSync(path.join(RECIPES_DIR, file), "utf8")) as {
        formId: string;
        steps: Step[];
      },
  );

const declarationSteps = recipes
  .filter(({ formId }) => !(formId in EXEMPT))
  .flatMap((recipe) =>
    recipe.steps
      .filter((step) => step.stepId === "declaration")
      .map((step) => ({ formId: recipe.formId, step })),
  );

const fieldsOf = (step: Step) =>
  (step.elements ?? []).map((el) => ({ el, field: el.overrides ?? el }));

describe("standard declaration wording (#2957)", () => {
  it("finds declarations to check", () => {
    expect(declarationSteps.length).toBeGreaterThan(80);
  });

  it.each(Object.keys({ ...EXEMPT, ...NO_DECLARATION }))(
    "%s is still a recipe, so its exemption isn't stale",
    (formId) => {
      expect(recipes.map((r) => r.formId)).toContain(formId);
    },
  );

  it.each(
    recipes
      .filter(({ formId }) => !(formId in EXEMPT))
      .map((r) => [r.formId, r] as const),
  )("%s has exactly one declaration step", (formId, recipe) => {
    expect(
      recipe.steps.filter((step) => step.stepId === "declaration").length,
    ).toBe(formId in NO_DECLARATION ? 0 : 1);
  });

  it("keeps declaration-confirmed on the declaration step", () => {
    const offStep = recipes.flatMap((recipe) =>
      recipe.steps
        .filter((step) => step.stepId !== "declaration")
        .filter((step) =>
          fieldsOf(step).some(
            ({ field }) => field.fieldId === "declaration-confirmed",
          ),
        )
        .map((step) => `${recipe.formId}/${step.stepId}`),
    );
    expect(offStep).toEqual([]);
  });

  it.each(declarationSteps.map((d) => [d.formId, d] as const))(
    "%s uses the standard heading, checkbox and error",
    (_formId, { step }) => {
      const el = fieldsOf(step).find(
        ({ field }) => field.fieldId === "declaration-confirmed",
      )?.field;
      expect(el).toBeDefined(); // fails for an empty step or a different fieldId
      expect({
        title: step.title,
        option: el?.options?.map((o) => o.label),
        error: el?.validations?.required?.error,
      }).toEqual({
        title: STANDARD.title,
        option: [STANDARD.option],
        error: STANDARD.error,
      });
    },
  );

  it.each(declarationSteps.map((d) => [d.formId, d] as const))(
    "%s has nothing else on the declaration step unless listed",
    (formId, { step }) => {
      expect(
        fieldsOf(step)
          .map(({ field }) => field.fieldId)
          .sort(),
      ).toEqual(
        ["declaration-confirmed", ...(ACKNOWLEDGEMENTS[formId] ?? [])].sort(),
      );
    },
  );

  it.each(
    Object.entries(ACKNOWLEDGEMENTS).flatMap(([formId, ids]) =>
      ids.map((fieldId) => [formId, fieldId] as const),
    ),
  )(
    "%s keeps its %s acknowledgement on the declaration step",
    (formId, fieldId) => {
      const step = declarationSteps.find((d) => d.formId === formId)?.step;
      const ack =
        step && fieldsOf(step).find(({ field }) => field.fieldId === fieldId);
      expect(ack?.el.ref).toBe("components/confirmation");
      expect(ack?.field.validations?.required).toBeDefined();
    },
  );
});
