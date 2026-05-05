import { processorSchema } from "./processor.type";

describe("processorSchema", () => {
  it("accepts a payment processor with required config fields", () => {
    const result = processorSchema.safeParse({
      type: "payment",
      config: {
        provider: "ezpay",
        department: "education",
        paymentCode: "EDU-001",
        amount: 50,
        description: "School fees",
        customerEmailPath: "personal.email",
        customerNamePath: "personal.full-name",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects payment processor missing customerEmailPath", () => {
    const result = processorSchema.safeParse({
      type: "payment",
      config: {
        provider: "ezpay",
        department: "education",
        paymentCode: "EDU-001",
        amount: 50,
        description: "School fees",
        customerNamePath: "personal.full-name",
      },
    });
    expect(result.success).toBe(false);
  });

  it("still accepts email, opencrvs, and spreadsheet processors", () => {
    expect(
      processorSchema.safeParse({ type: "email", config: { to: "x@y.z" } })
        .success,
    ).toBe(true);
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
