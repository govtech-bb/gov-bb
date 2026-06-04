import { formConfigBlobSchema, parseFormConfigBlob } from "./form-config.type";

const paymentProcessor = {
  type: "payment",
  config: {
    provider: "ezpay",
    department: "civil-registry",
    paymentCode: "BIRTH-CERT",
    amount: 50,
    description: "Birth certificate",
    customerEmailPath: "personal.email",
    customerNamePath: "personal.name",
  },
};

describe("formConfigBlobSchema", () => {
  it("accepts an empty blob (no processors key)", () => {
    expect(formConfigBlobSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a payment processor with literal config", () => {
    expect(
      formConfigBlobSchema.safeParse({ processors: [paymentProcessor] })
        .success,
    ).toBe(true);
  });

  it("accepts dynamic() fields in processor config (author schema)", () => {
    expect(
      formConfigBlobSchema.safeParse({
        processors: [
          {
            ...paymentProcessor,
            config: {
              ...paymentProcessor.config,
              amount: { var: "values.fees.total" },
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("preserves unknown future keys through parse (shared blob)", () => {
    const parsed = formConfigBlobSchema.parse({
      processors: [paymentProcessor],
      someFutureKey: { nested: true },
    });
    expect(parsed).toMatchObject({ someFutureKey: { nested: true } });
  });

  it("rejects a processors value that is not an array", () => {
    expect(
      formConfigBlobSchema.safeParse({ processors: paymentProcessor }).success,
    ).toBe(false);
  });

  it("rejects an invalid processor entry", () => {
    expect(
      formConfigBlobSchema.safeParse({
        processors: [
          { type: "payment", config: { provider: "ezpay" } }, // missing fields
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown processor type", () => {
    expect(
      formConfigBlobSchema.safeParse({
        processors: [{ type: "carrier-pigeon", config: {} }],
      }).success,
    ).toBe(false);
  });
});

describe("parseFormConfigBlob", () => {
  it("returns an empty blob for null (resolved miss — column is nullable)", () => {
    expect(parseFormConfigBlob(null)).toEqual({});
  });

  it("returns an empty blob for undefined", () => {
    expect(parseFormConfigBlob(undefined)).toEqual({});
  });

  it("returns the parsed blob for a valid value", () => {
    expect(parseFormConfigBlob({ processors: [paymentProcessor] })).toEqual({
      processors: [paymentProcessor],
    });
  });

  it("throws on an invalid blob (misconfiguration must fail loudly)", () => {
    expect(() => parseFormConfigBlob({ processors: "nope" })).toThrow();
  });

  it("throws on a non-object blob", () => {
    expect(() => parseFormConfigBlob("nope")).toThrow();
  });
});
