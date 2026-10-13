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
const email = (recipientField: string) => ({
  type: "email",
  config: { recipientField },
});
const removal = (category: string) =>
  `${FILE}: removes ${category} (base had 1, this change has 0). If this is deliberate, a PR can carry the recipe-removal-override label.`;

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
      "MDA delivery emails",
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
      `${FILE}: removes ${category} (base had 1, this change has 0). If this is deliberate, a PR can carry the recipe-removal-override label.`,
    ]);
  });

  it("reports a downgraded address lookup", () => {
    const before = recipe([plainLookup], []);
    expect(checkRemovals(FILE, before, recipe([address], []))).toEqual([
      `${FILE}: removes address lookups (base had 1, this change has 0). If this is deliberate, a PR can carry the recipe-removal-override label.`,
    ]);
  });

  it.each([
    ["a literal address (exit-survey shape)", "survey@gov.bb"],
    ["a contactDetails address", "contactDetails.email"],
  ])("reports a dropped MDA delivery email to %s", (_what, field) => {
    expect(
      checkRemovals(FILE, recipe([], [email(field)]), recipe([], [])),
    ).toEqual([removal("MDA delivery emails")]);
  });

  it("ignores a dropped applicant email", () => {
    const before = recipe([], [email("applicant.email")]);
    expect(checkRemovals(FILE, before, recipe([], []))).toEqual([]);
  });

  it("passes switching config.mdaEmail to a literal address", () => {
    const before = recipe([], [email("config.mdaEmail")]);
    const after = recipe([], [email("mda@gov.bb")]);
    expect(checkRemovals(FILE, before, after)).toEqual([]);
  });

  it("treats an emptied catchmentRouting or geocodeTargets as removed", () => {
    const before = recipe([lookup], [], { catchmentRouting: { by: "parish" } });
    const after = recipe(
      [{ ...lookup, overrides: { fieldId: "address", geocodeTargets: {} } }],
      [],
      { catchmentRouting: null },
    );
    expect(checkRemovals(FILE, before, after)).toEqual([
      removal("catchment routing"),
      removal("geocode targets"),
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
      `${FILE}: removes geocode targets (base had 1, this change has 0). If this is deliberate, a PR can carry the recipe-removal-override label.`,
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
