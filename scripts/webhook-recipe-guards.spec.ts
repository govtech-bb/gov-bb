import { checkWebhookRecipe } from "./webhook-recipe-guards";

const STEPS = [
  { stepId: "applicant-details" },
  { stepId: "check-your-answers" },
  { stepId: "declaration" },
];

function recipe(webhookConfig: unknown) {
  return {
    steps: STEPS,
    processors: [{ type: "webhook", config: webhookConfig }],
  };
}

const VALID_MAPPING = {
  programmeCode: "BYAC",
  applicant: {
    name: [
      "applicant-details.applicant-first-name",
      "applicant-details.applicant-last-name",
    ],
    email: "applicant-details.applicant-email",
    phone: "applicant-details.applicant-phone",
  },
  excludeSteps: ["check-your-answers", "declaration"],
};

describe("checkWebhookRecipe", () => {
  it("accepts a well-formed mapping-only webhook", () => {
    expect(
      checkWebhookRecipe(recipe({ mapping: VALID_MAPPING }), "f.json"),
    ).toEqual([]);
  });

  it("ignores a generic (non-mapped) webhook", () => {
    expect(
      checkWebhookRecipe(
        recipe({ endpoint: { env: "SOME_URL" }, auth: { scheme: "none" } }),
        "f.json",
      ),
    ).toEqual([]);
  });

  it("rejects a mapped webhook that still declares endpoint/url", () => {
    const errors = checkWebhookRecipe(
      recipe({ endpoint: { env: "WEBHOOK_URL_X" }, mapping: VALID_MAPPING }),
      "f.json",
    );
    expect(errors.join("\n")).toMatch(/must not declare endpoint\/url/);
  });

  it("rejects a mapped webhook that still declares auth", () => {
    const errors = checkWebhookRecipe(
      recipe({
        auth: { scheme: "apiKey", header: "X-API-Key", secretEnv: "S" },
        mapping: VALID_MAPPING,
      }),
      "f.json",
    );
    expect(errors.join("\n")).toMatch(/must not declare auth/);
  });

  it("requires a non-empty programmeCode", () => {
    const errors = checkWebhookRecipe(
      recipe({ mapping: { ...VALID_MAPPING, programmeCode: "" } }),
      "f.json",
    );
    expect(errors.join("\n")).toMatch(/programmeCode is required/);
  });

  it("rejects an applicant path referencing an unknown step", () => {
    const errors = checkWebhookRecipe(
      recipe({
        mapping: {
          ...VALID_MAPPING,
          applicant: { ...VALID_MAPPING.applicant, email: "nope.field" },
        },
      }),
      "f.json",
    );
    expect(errors.join("\n")).toMatch(/references unknown step "nope"/);
  });

  it("rejects an excludeSteps entry that is not a step", () => {
    const errors = checkWebhookRecipe(
      recipe({ mapping: { ...VALID_MAPPING, excludeSteps: ["ghost-step"] } }),
      "f.json",
    );
    expect(errors.join("\n")).toMatch(
      /excludeSteps entry "ghost-step" is not a step/,
    );
  });
});
