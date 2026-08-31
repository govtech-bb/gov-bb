import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import {
  interpolateConfirmationMarkdown,
  resolveConditionalMarkdown,
} from "@govtech-bb/form-conditions";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// The confirmation copy follows two answers (#2068): whether an inspection is
// certain, and whether submitting this form raised an officer request. Both are
// step-level recipe properties, and a step-level property hydrateForm does not
// carry through is dropped SILENTLY from the served contract — the body would
// then render its `{token}`s unfilled. validate-recipes and
// recipe-invariants.spec.ts only read the file on disk, so neither can see
// that. This spec hydrates the real recipe and asserts the branches survive.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-temporary-restaurant-permit.json",
);

async function confirmationStep() {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  const resolver: Resolver = async (ref) => {
    const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
    if (!entry) throw new Error(`unresolvable ref "${ref}"`);
    return entry;
  };
  const hydrated = await hydrateForm(recipe, resolver);
  const step = hydrated.steps.find(
    (s) => s.stepId === "submission-confirmation",
  );
  if (!step) throw new Error("no submission-confirmation step");
  return step;
}

const valuesFor = (hasFoodLicence?: string, isOrganiser?: string) => ({
  ...(hasFoodLicence !== undefined
    ? { "food-safety": { "has-food-licence": hasFoodLicence } }
    : {}),
  ...(isOrganiser !== undefined
    ? { "event-organiser": { "is-organiser": isOrganiser } }
    : {}),
});

const WILL_INSPECT = "**will** inspect where your food is prepared";
const MAY_INSPECT = "**may** arrange an inspection";
const OFFICER_REQUESTED = "we have requested an Environmental Health Officer";

it("carries conditionalMarkdown through hydration into the served step", async () => {
  const step = await confirmationStep();
  expect(step.conditionalMarkdown).toBeDefined();
  expect(step.conditionalMarkdown?.map((s) => s.token)).toEqual([
    "inspection",
    "officerRequest",
  ]);
  // Every declared token must actually appear in the body, or its copy is dead.
  for (const segment of step.conditionalMarkdown ?? []) {
    expect(step.markdownContent).toContain(`{${segment.token}}`);
  }
});

// The has-food-licence x is-organiser matrix on the email/page copy itself.
it.each([
  ["no", "yes", true, true],
  ["no", "no", true, false],
  ["yes", "yes", false, true],
  ["yes", "no", false, false],
] as const)(
  "has-food-licence=%s is-organiser=%s -> will-inspect=%s officer-requested=%s",
  async (hasFoodLicence, isOrganiser, willInspect, officerRequested) => {
    const step = await confirmationStep();
    const resolved =
      resolveConditionalMarkdown(
        step,
        valuesFor(hasFoodLicence, isOrganiser),
      ) ?? "";

    expect(resolved.includes(WILL_INSPECT)).toBe(willInspect);
    expect(resolved.includes(MAY_INSPECT)).toBe(!willInspect);
    // #2200: the officer attend/overtime/invoice lines are organiser-only —
    // a vendor must never be told an officer was requested for them.
    expect(resolved.includes(OFFICER_REQUESTED)).toBe(officerRequested);

    for (const segment of step.conditionalMarkdown ?? []) {
      expect(resolved).not.toContain(`{${segment.token}}`);
    }
  },
);

it("falls back to the neutral passages when neither answer is present", async () => {
  // The confirmation page's refresh path: the draft is cleared on submit, so a
  // reload resolves with no answers and must still read sensibly.
  const step = await confirmationStep();
  const resolved = resolveConditionalMarkdown(step, {}) ?? "";

  expect(resolved).toContain(MAY_INSPECT);
  expect(resolved).not.toContain(WILL_INSPECT);
  expect(resolved).not.toContain(OFFICER_REQUESTED);
});

it("leaves the data tokens for the interpolator, and none survive both passes", async () => {
  // Segments resolve first, so the body's `{polyclinic}` / `{landingUrl}` are
  // still intact afterwards and are filled by the shared interpolator.
  const step = await confirmationStep();
  const resolved = resolveConditionalMarkdown(step, valuesFor("no", "yes"));
  expect(resolved).toContain("{polyclinic}");

  const final =
    interpolateConfirmationMarkdown(resolved, {
      polyclinic: "Maurice Byer Polyclinic",
      landingUrl: "https://sandbox.example.gov.bb",
    }) ?? "";

  expect(final).toContain("Maurice Byer Polyclinic");
  expect(final).toContain("https://sandbox.example.gov.bb/business-trade/");
  // No unresolved placeholder may reach an applicant on either surface.
  expect(final).not.toMatch(/\{[a-zA-Z][a-zA-Z0-9]*\}/);
});
