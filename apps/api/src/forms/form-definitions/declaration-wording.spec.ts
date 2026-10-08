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

/** chat-feedback is a feedback survey, not an application. */
const EXEMPT = new Set(["chat-feedback"]);

/**
 * Service-specific acknowledgements kept beside the standard checkbox when
 * #2957 moved each form to it. Pinned so a builder or AI edit can't drop them
 * quietly; remove an entry only when the service no longer needs the clause.
 */
const ACKNOWLEDGEMENTS: Record<string, string> = {
  "apply-for-food-business-licence": "authority-confirmed",
  "apply-for-national-summer-camp-programme": "parent-guardian-confirmed",
  "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026":
    "parent-guardian-confirmed",
  "apply-for-temporary-restaurant-permit": "regulations-acknowledged",
  "bssee-form-b-defer-examination": "one-opportunity-acknowledged",
  "camp-director-application": "suitability-check-consent",
  "request-a-presidential-visit-for-a-centenarian": "request-terms-confirmed",
  "request-an-environmental-health-officer": "regulations-acknowledged",
  "youth-leadership-workshop-registration-2026": "responses-use-consent",
};

type Element = { ref?: string; fieldId?: string; overrides?: Element } & {
  options?: { label: string }[];
  validations?: { required?: { error?: string } };
};
type Step = { stepId: string; title: string; elements?: Element[] };

const declarations = fs
  .readdirSync(RECIPES_DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((file) => {
    const recipe = JSON.parse(
      fs.readFileSync(path.join(RECIPES_DIR, file), "utf8"),
    ) as { formId: string; steps: Step[] };
    return recipe.steps.flatMap((step) =>
      (step.elements ?? [])
        .map((el) => el.overrides ?? el)
        .filter((el) => el.fieldId === "declaration-confirmed")
        .map((el) => ({ formId: recipe.formId, step, el })),
    );
  })
  .filter(({ formId }) => !EXEMPT.has(formId));

describe("standard declaration wording (#2957)", () => {
  it("finds declarations to check", () => {
    expect(declarations.length).toBeGreaterThan(70);
  });

  it.each(declarations.map((d) => [d.formId, d] as const))(
    "%s uses the standard heading, checkbox and error",
    (_formId, { step, el }) => {
      expect({
        title: step.title,
        option: el.options?.map((o) => o.label),
        error: el.validations?.required?.error,
      }).toEqual({
        title: STANDARD.title,
        option: [STANDARD.option],
        error: STANDARD.error,
      });
    },
  );

  it.each(Object.entries(ACKNOWLEDGEMENTS))(
    "%s keeps its %s acknowledgement on the declaration step",
    (formId, fieldId) => {
      const step = declarations.find((d) => d.formId === formId)?.step;
      const ack = step?.elements?.find(
        (el) => (el.overrides ?? el).fieldId === fieldId,
      );
      expect(ack?.ref).toBe("components/confirmation");
      expect((ack?.overrides ?? ack)?.validations?.required).toBeDefined();
    },
  );
});
