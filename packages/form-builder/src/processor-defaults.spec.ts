import { makeDefaultProcessor } from "./processor-defaults";
import { processorSchema } from "@govtech-bb/form-types";
import type { AuthorableProcessorPreset } from "./types";

describe("makeDefaultProcessor", () => {
  it("seeds an email processor with an empty recipientField to fill in", () => {
    expect(makeDefaultProcessor("email")).toEqual({
      type: "email",
      config: { recipientField: "" },
    });
  });

  it("seeds a webhook with method/signatureHeader/timeoutMs defaults, an empty url, and NO secret", () => {
    const processor = makeDefaultProcessor("webhook");
    expect(processor).toEqual({
      type: "webhook",
      config: {
        url: "",
        method: "POST",
        signatureHeader: "X-Webhook-Signature",
        timeoutMs: 10000,
      },
    });
    // secret is never seeded — deployed recipes are committed to git (issue #255).
    expect(Object.keys(processor.config)).not.toContain("secret");
  });

  it("seeds a CaMS preset as a mapped webhook with no url, endpoint or auth (#2684)", () => {
    expect(makeDefaultProcessor("webhook-cams")).toEqual({
      type: "webhook",
      config: {
        method: "POST",
        signatureHeader: "X-Webhook-Signature",
        timeoutMs: 10000,
        mapping: {
          programmeCode: "",
          applicant: { name: [], email: "", phone: "" },
          excludeSteps: [
            "check-your-answers",
            "declaration",
            "submission-confirmation",
          ],
          groupByStep: true,
        },
      },
    });
  });

  it("seeds a spreadsheet processor with an empty config record", () => {
    expect(makeDefaultProcessor("spreadsheet")).toEqual({
      type: "spreadsheet",
      config: {},
    });
  });

  it("seeds an opencrvs processor with an empty config record", () => {
    expect(makeDefaultProcessor("opencrvs")).toEqual({
      type: "opencrvs",
      config: {},
    });
  });

  it("seeds a payment processor with provider fixed to ezpay and blank path/amount fields (#716)", () => {
    expect(makeDefaultProcessor("payment")).toEqual({
      type: "payment",
      config: {
        provider: "ezpay",
        department: "",
        paymentCode: "",
        amount: 0,
        description: "",
        customerEmailPath: "",
        customerNamePath: "",
      },
    });
  });

  // Guards against typo'd/stray keys: a default completed with its required
  // fields must parse cleanly through the author-time processorSchema, proving
  // every seeded key is a real schema key with a valid default value.
  it.each<[AuthorableProcessorPreset, Record<string, unknown>]>([
    ["email", { recipientField: "applicant.email" }],
    ["webhook", { url: "https://example.gov.bb/hook" }],
    [
      "webhook-cams",
      {
        mapping: {
          programmeCode: "RESTAURANT_LICENCE",
          applicant: {
            name: ["applicant.firstName", "applicant.lastName"],
            email: "applicant.email",
            phone: "applicant.phone",
          },
          excludeSteps: ["check-your-answers"],
          groupByStep: true,
        },
      },
    ],
    ["spreadsheet", {}],
    ["opencrvs", {}],
    [
      "payment",
      {
        department: "Treasury",
        paymentCode: "FEE-001",
        description: "Application fee",
        customerEmailPath: "applicant.email",
        customerNamePath: "applicant.fullName",
      },
    ],
  ])(
    "a completed %s default parses through processorSchema",
    (preset, fill) => {
      const base = makeDefaultProcessor(preset);
      const parsed = processorSchema.safeParse({
        type: base.type,
        config: { ...base.config, ...fill },
      });
      expect(parsed.success).toBe(true);
    },
  );
});
