import { checkWebhookDestinations } from "./webhook-recipe-guards";

const STEPS = [{ stepId: "applicant" }, { stepId: "contact" }];

function recipe(config: Record<string, unknown>) {
  return {
    steps: STEPS,
    processors: [{ type: "webhook", config }],
  };
}

const OK_MAPPING = {
  programmeCode: "BYAC",
  applicant: {
    name: ["applicant.first", "applicant.last"],
    email: "contact.email",
    phone: "contact.phone",
  },
  excludeSteps: [],
};

describe("checkWebhookDestinations", () => {
  it("passes a conforming per-form webhook", () => {
    const errors = checkWebhookDestinations(
      recipe({
        endpoint: { env: "WEBHOOK_URL_BYAC" },
        auth: {
          scheme: "apiKey",
          header: "X-API-Key",
          secretEnv: "WEBHOOK_SECRET_BYAC",
        },
        mapping: OK_MAPPING,
      }),
      "byac.json",
    );
    expect(errors).toEqual([]);
  });

  it("flags a non-conforming endpoint env name", () => {
    const errors = checkWebhookDestinations(
      recipe({ endpoint: { env: "WEBHOOK_URL" }, mapping: OK_MAPPING }),
      "byac.json",
    );
    expect(errors.some((e) => /WEBHOOK_URL_<TOKEN>/.test(e))).toBe(true);
  });

  it("flags mismatched URL/secret tokens (cross-wired secret)", () => {
    const errors = checkWebhookDestinations(
      recipe({
        endpoint: { env: "WEBHOOK_URL_BYAC" },
        auth: {
          scheme: "apiKey",
          header: "X-API-Key",
          secretEnv: "WEBHOOK_SECRET_HEALTH",
        },
        mapping: OK_MAPPING,
      }),
      "byac.json",
    );
    expect(errors.some((e) => /must match/.test(e))).toBe(true);
  });

  it("flags an applicant path referencing an unknown step", () => {
    const errors = checkWebhookDestinations(
      recipe({
        endpoint: { env: "WEBHOOK_URL_BYAC" },
        auth: {
          scheme: "apiKey",
          header: "X-API-Key",
          secretEnv: "WEBHOOK_SECRET_BYAC",
        },
        mapping: {
          ...OK_MAPPING,
          applicant: { ...OK_MAPPING.applicant, email: "nope.email" },
        },
      }),
      "byac.json",
    );
    expect(errors.some((e) => /unknown step "nope"/.test(e))).toBe(true);
  });

  it("flags a malformed applicant path", () => {
    const errors = checkWebhookDestinations(
      recipe({
        endpoint: { env: "WEBHOOK_URL_BYAC" },
        auth: {
          scheme: "apiKey",
          header: "X-API-Key",
          secretEnv: "WEBHOOK_SECRET_BYAC",
        },
        mapping: {
          ...OK_MAPPING,
          applicant: { ...OK_MAPPING.applicant, phone: "no-dot" },
        },
      }),
      "byac.json",
    );
    expect(errors.some((e) => /"stepId.fieldId"/.test(e))).toBe(true);
  });

  it("flags an excludeSteps entry that is not a step", () => {
    const errors = checkWebhookDestinations(
      recipe({
        endpoint: { env: "WEBHOOK_URL_BYAC" },
        auth: {
          scheme: "apiKey",
          header: "X-API-Key",
          secretEnv: "WEBHOOK_SECRET_BYAC",
        },
        mapping: { ...OK_MAPPING, excludeSteps: ["ghost"] },
      }),
      "byac.json",
    );
    expect(errors.some((e) => /excludeSteps entry "ghost"/.test(e))).toBe(true);
  });

  it("ignores non-webhook processors", () => {
    expect(
      checkWebhookDestinations(
        { steps: STEPS, processors: [{ type: "email", config: {} }] },
        "x.json",
      ),
    ).toEqual([]);
  });
});
