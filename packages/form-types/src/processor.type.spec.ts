import { processorSchema, resolvedProcessorSchema } from "./processor.type";

describe("processorSchema (author-time)", () => {
  it("accepts email with literal recipientField + subject", () => {
    expect(
      processorSchema.safeParse({
        type: "email",
        config: { recipientField: "personal.email", subject: "Hi" },
      }).success,
    ).toBe(true);
  });

  it("accepts email with rule-resolved subject", () => {
    expect(
      processorSchema.safeParse({
        type: "email",
        config: {
          recipientField: "personal.email",
          subject: { cat: ["Hi ", { var: "values.applicant.name" }] },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts payment with JSONLogic-rule amount", () => {
    expect(
      processorSchema.safeParse({
        type: "payment",
        config: {
          provider: "ezpay",
          department: "civil-registry",
          paymentCode: "BIRTH-CERT",
          amount: {
            if: [
              { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
              0,
              25,
            ],
          },
          description: "Senior-tier fee",
          customerEmailPath: "personal.email",
          customerNamePath: "personal.full-name",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects payment whose customerEmailPath is a rule (paths are routing, not values)", () => {
    expect(
      processorSchema.safeParse({
        type: "payment",
        config: {
          provider: "ezpay",
          department: "civil-registry",
          paymentCode: "BIRTH-CERT",
          amount: 25,
          description: "x",
          customerEmailPath: { var: "values.x" },
          customerNamePath: "personal.name",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects payment processor missing customerEmailPath", () => {
    expect(
      processorSchema.safeParse({
        type: "payment",
        config: {
          provider: "ezpay",
          department: "education",
          paymentCode: "EDU-001",
          amount: 50,
          description: "School fees",
          customerNamePath: "personal.full-name",
        },
      }).success,
    ).toBe(false);
  });

  it("still accepts opencrvs and spreadsheet processors", () => {
    expect(
      processorSchema.safeParse({ type: "opencrvs", config: {} }).success,
    ).toBe(true);
    expect(
      processorSchema.safeParse({
        type: "spreadsheet",
        config: { sheetId: "abc" },
      }).success,
    ).toBe(true);
  });
});

describe("resolvedProcessorSchema (post-resolution)", () => {
  it("accepts payment with literal amount", () => {
    expect(
      resolvedProcessorSchema.safeParse({
        type: "payment",
        config: {
          provider: "ezpay",
          department: "civil-registry",
          paymentCode: "BIRTH-CERT",
          amount: 25,
          description: "x",
          customerEmailPath: "personal.email",
          customerNamePath: "personal.name",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects payment whose amount is still a JSONLogic rule", () => {
    expect(
      resolvedProcessorSchema.safeParse({
        type: "payment",
        config: {
          provider: "ezpay",
          department: "civil-registry",
          paymentCode: "BIRTH-CERT",
          amount: { var: "values.amt" },
          description: "x",
          customerEmailPath: "personal.email",
          customerNamePath: "personal.name",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects email whose subject is still a JSONLogic rule", () => {
    expect(
      resolvedProcessorSchema.safeParse({
        type: "email",
        config: {
          recipientField: "personal.email",
          subject: { cat: ["Hi ", { var: "values.x" }] },
        },
      }).success,
    ).toBe(false);
  });
});
