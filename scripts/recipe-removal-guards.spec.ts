import { checkRemovals } from "./recipe-removal-guards";

const FILE = "apps/api/src/forms/form-definitions/recipes/x.json";

const webhook = {
  type: "webhook",
  config: { mapping: { programmeCode: "P" } },
};
const mdaEmail = {
  type: "email",
  config: { recipientField: "catchment.mdaEmail" },
};
const applicantEmail = {
  type: "email",
  config: { recipientField: "applicant.email" },
};
const lookup = {
  ref: "components/address-lookup",
  overrides: { fieldId: "address", geocodeTargets: { parishFieldId: "p" } },
};
const plainLookup = { ref: "components/address-lookup" };
const address = { ref: "components/address" };

const recipe = (elements: unknown[], processors: unknown[], extra = {}) => ({
  formId: "x",
  steps: [{ stepId: "s", elements }],
  processors,
  ...extra,
});

describe("checkRemovals", () => {
  const full = recipe([lookup], [webhook, mdaEmail, applicantEmail], {
    catchmentRouting: { by: "parish" },
  });

  it("passes an unchanged recipe", () => {
    expect(checkRemovals(FILE, full, full)).toEqual([]);
  });

  it("passes an addition", () => {
    expect(checkRemovals(FILE, recipe([], []), full)).toEqual([]);
  });

  it.each([
    [
      "webhook processors",
      recipe([lookup], [mdaEmail, applicantEmail], {
        catchmentRouting: { by: "parish" },
      }),
    ],
    [
      "MDA-email processors",
      recipe([lookup], [webhook, applicantEmail], {
        catchmentRouting: { by: "parish" },
      }),
    ],
    [
      "catchment routing",
      recipe([lookup], [webhook, mdaEmail, applicantEmail]),
    ],
    [
      "geocode targets",
      recipe([plainLookup], [webhook, mdaEmail, applicantEmail], {
        catchmentRouting: { by: "parish" },
      }),
    ],
  ])("reports removed %s", (category, after) => {
    const errors = checkRemovals(FILE, full, after);
    expect(errors).toEqual([
      `${FILE}: removes ${category} (base had 1, this PR has 0). If this is deliberate, add the recipe-removal-override label.`,
    ]);
  });

  it("reports a downgraded address lookup", () => {
    const before = recipe([plainLookup], []);
    expect(checkRemovals(FILE, before, recipe([address], []))).toEqual([
      `${FILE}: removes address lookups (base had 1, this PR has 0). If this is deliberate, add the recipe-removal-override label.`,
    ]);
  });

  it("counts geocodeTargets inside a block's per-child overrides", () => {
    const block = (child: object) => ({
      ref: "blocks/home-address",
      overrides: { "address-line-1": child },
    });
    const before = recipe(
      [block({ geocodeTargets: { parishFieldId: "p" } })],
      [],
    );
    const after = recipe([block({ label: "Line 1" })], []);
    expect(checkRemovals(FILE, before, after)).toEqual([
      `${FILE}: removes geocode targets (base had 1, this PR has 0). If this is deliberate, add the recipe-removal-override label.`,
    ]);
  });

  it("does not throw on malformed recipes", () => {
    for (const bad of [
      null,
      42,
      "x",
      [],
      {},
      { processors: "no", steps: {} },
    ]) {
      expect(() => checkRemovals(FILE, bad, bad)).not.toThrow();
      expect(() => checkRemovals(FILE, full, bad)).not.toThrow();
    }
    expect(
      checkRemovals(FILE, { processors: [null, { type: "email" }] }, {}),
    ).toEqual([]);
  });
});
