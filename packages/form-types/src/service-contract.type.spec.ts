import {
  contactDetailsSchema,
  serviceContractSchema,
} from "./service-contract.type";

describe("contactDetailsSchema", () => {
  const validFull = {
    title: "Registration Department",
    telephoneNumber: "(246) 535-8300",
    email: "registrationdept@barbados.gov.bb",
    address: {
      line1: "Supreme Court Complex",
      line2: "Whitepark Road",
      city: "St. Michael",
      country: "Barbados",
    },
  };

  it("accepts a full valid contact details object", () => {
    expect(contactDetailsSchema.safeParse(validFull).success).toBe(true);
  });

  it("accepts contact details without address", () => {
    const { address: _a, ...noAddress } = validFull;
    expect(contactDetailsSchema.safeParse(noAddress).success).toBe(true);
  });

  it("accepts contact details with address missing optional fields", () => {
    const partial = {
      ...validFull,
      address: { line1: "Cheapside", city: "Bridgetown" },
    };
    expect(contactDetailsSchema.safeParse(partial).success).toBe(true);
  });

  it("rejects missing title", () => {
    const { title: _t, ...noTitle } = validFull;
    expect(contactDetailsSchema.safeParse(noTitle).success).toBe(false);
  });

  it("rejects missing telephoneNumber", () => {
    const { telephoneNumber: _p, ...noPhone } = validFull;
    expect(contactDetailsSchema.safeParse(noPhone).success).toBe(false);
  });

  it("rejects missing email", () => {
    const { email: _e, ...noEmail } = validFull;
    expect(contactDetailsSchema.safeParse(noEmail).success).toBe(false);
  });

  it("rejects invalid email format", () => {
    expect(
      contactDetailsSchema.safeParse({ ...validFull, email: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("rejects empty string title", () => {
    expect(
      contactDetailsSchema.safeParse({ ...validFull, title: "" }).success,
    ).toBe(false);
  });

  it("rejects empty string telephoneNumber", () => {
    expect(
      contactDetailsSchema.safeParse({ ...validFull, telephoneNumber: "" })
        .success,
    ).toBe(false);
  });
});

describe("serviceContractSchema with contactDetails", () => {
  const baseContract = {
    formId: "test-form",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [],
  };

  it("accepts a contract without contactDetails", () => {
    expect(serviceContractSchema.safeParse(baseContract).success).toBe(true);
  });

  it("accepts a contract with valid contactDetails", () => {
    const withContact = {
      ...baseContract,
      contactDetails: {
        title: "Post Office",
        telephoneNumber: "(246) 535-0200",
        email: "customerservice@post.gov.bb",
      },
    };
    expect(serviceContractSchema.safeParse(withContact).success).toBe(true);
  });

  it("rejects a contract with invalid contactDetails", () => {
    const withBadContact = {
      ...baseContract,
      contactDetails: { title: "Post Office" }, // missing telephoneNumber and email
    };
    expect(serviceContractSchema.safeParse(withBadContact).success).toBe(false);
  });
});
