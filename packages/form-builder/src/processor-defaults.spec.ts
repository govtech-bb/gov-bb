import { makeDefaultProcessor } from "./processor-defaults";
import { processorSchema } from "@govtech-bb/form-types";
import type { AuthorableProcessorType } from "./types";

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
  it.each<[AuthorableProcessorType, Record<string, unknown>]>([
    ["email", { recipientField: "applicant.email" }],
    ["webhook", { url: "https://example.gov.bb/hook" }],
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
  ])("a completed %s default parses through processorSchema", (type, fill) => {
    const base = makeDefaultProcessor(type);
    const parsed = processorSchema.safeParse({
      type,
      config: { ...base.config, ...fill },
    });
    expect(parsed.success).toBe(true);
  });
});
