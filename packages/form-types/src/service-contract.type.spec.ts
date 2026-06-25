import {
  contactDetailsSchema,
  dateTimeFormatSchema,
  getRecipeVisibility,
  recipeMetaSchema,
  serviceContractRecipeSchema,
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

  it("accepts missing title (now optional, issue #607)", () => {
    const { title: _t, ...noTitle } = validFull;
    expect(contactDetailsSchema.safeParse(noTitle).success).toBe(true);
  });

  it("accepts missing telephoneNumber (now optional, issue #607)", () => {
    const { telephoneNumber: _p, ...noPhone } = validFull;
    expect(contactDetailsSchema.safeParse(noPhone).success).toBe(true);
  });

  it("accepts missing email (now optional, issue #607)", () => {
    const { email: _e, ...noEmail } = validFull;
    expect(contactDetailsSchema.safeParse(noEmail).success).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(contactDetailsSchema.safeParse({}).success).toBe(true);
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

describe("dateTimeFormatSchema", () => {
  it("accepts UTC datetime", () => {
    expect(dateTimeFormatSchema.safeParse("2026-01-01T00:00:00Z").success).toBe(
      true,
    );
  });

  it("accepts datetime with timezone offset", () => {
    expect(
      dateTimeFormatSchema.safeParse("2026-01-01T00:00:00+05:30").success,
    ).toBe(true);
  });

  it("accepts datetime with milliseconds and Z", () => {
    expect(
      dateTimeFormatSchema.safeParse("2026-01-01T00:00:00.000Z").success,
    ).toBe(true);
  });

  it("rejects a date-only string", () => {
    expect(dateTimeFormatSchema.safeParse("2026-01-01").success).toBe(false);
  });

  it("rejects a plain string", () => {
    expect(dateTimeFormatSchema.safeParse("not-a-date").success).toBe(false);
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

  it("accepts a contract with a partial contactDetails (issue #607)", () => {
    const withPartialContact = {
      ...baseContract,
      contactDetails: { title: "Post Office" }, // telephoneNumber/email now optional
    };
    expect(serviceContractSchema.safeParse(withPartialContact).success).toBe(
      true,
    );
  });

  it("rejects a contract with malformed contactDetails", () => {
    const withBadContact = {
      ...baseContract,
      contactDetails: { email: "not-an-email" }, // present-but-invalid email
    };
    expect(serviceContractSchema.safeParse(withBadContact).success).toBe(false);
  });

  it("rejects an empty formId", () => {
    expect(
      serviceContractSchema.safeParse({ ...baseContract, formId: "" }).success,
    ).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(
      serviceContractSchema.safeParse({ ...baseContract, title: "" }).success,
    ).toBe(false);
  });

  it.each(["1-foo", "foo-", "foo--bar", "Foo"])(
    "rejects a malformed formId %p",
    (formId) => {
      expect(
        serviceContractSchema.safeParse({ ...baseContract, formId }).success,
      ).toBe(false);
    },
  );

  it("accepts a valid kebab formId with a non-empty title", () => {
    expect(serviceContractSchema.safeParse(baseContract).success).toBe(true);
  });

  it("accepts a contract without a version (now optional, #1196)", () => {
    const { version: _v, ...noVersion } = baseContract;
    expect(serviceContractSchema.safeParse(noVersion).success).toBe(true);
  });

  it("still rejects a present-but-malformed version", () => {
    expect(
      serviceContractSchema.safeParse({ ...baseContract, version: "1.0" })
        .success,
    ).toBe(false);
  });
});

describe("serviceContractRecipeSchema", () => {
  const baseRecipe = {
    formId: "test-form",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [],
  };

  it("accepts a recipe with no steps", () => {
    expect(serviceContractRecipeSchema.safeParse(baseRecipe).success).toBe(
      true,
    );
  });

  it("accepts a recipe step with component ref elements", () => {
    const recipe = {
      ...baseRecipe,
      steps: [
        {
          stepId: "step-1",
          title: "Step One",
          elements: [{ ref: "components/first-name" }],
        },
      ],
    };
    expect(serviceContractRecipeSchema.safeParse(recipe).success).toBe(true);
  });

  it("rejects a recipe step containing plain primitive elements", () => {
    const recipe = {
      ...baseRecipe,
      steps: [
        {
          stepId: "step-1",
          title: "Step One",
          elements: [
            { fieldId: "first-name", htmlType: "text", label: "Name" },
          ],
        },
      ],
    };
    expect(serviceContractRecipeSchema.safeParse(recipe).success).toBe(false);
  });

  it("rejects missing formId", () => {
    const { formId: _f, ...noFormId } = baseRecipe;
    expect(serviceContractRecipeSchema.safeParse(noFormId).success).toBe(false);
  });

  it("rejects an empty formId", () => {
    expect(
      serviceContractRecipeSchema.safeParse({ ...baseRecipe, formId: "" })
        .success,
    ).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(
      serviceContractRecipeSchema.safeParse({ ...baseRecipe, title: "" })
        .success,
    ).toBe(false);
  });

  it.each(["1-foo", "foo-", "foo--bar", "Foo"])(
    "rejects a malformed formId %p",
    (formId) => {
      expect(
        serviceContractRecipeSchema.safeParse({ ...baseRecipe, formId })
          .success,
      ).toBe(false);
    },
  );

  it("accepts a valid kebab formId with a non-empty title", () => {
    expect(serviceContractRecipeSchema.safeParse(baseRecipe).success).toBe(
      true,
    );
  });

  it("rejects malformed createdAt", () => {
    expect(
      serviceContractRecipeSchema.safeParse({
        ...baseRecipe,
        createdAt: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("accepts a recipe without a version (now optional, #1196)", () => {
    const { version: _v, ...noVersion } = baseRecipe;
    expect(serviceContractRecipeSchema.safeParse(noVersion).success).toBe(true);
  });

  it("still rejects a present-but-malformed version", () => {
    expect(
      serviceContractRecipeSchema.safeParse({ ...baseRecipe, version: "1.0" })
        .success,
    ).toBe(false);
  });

  it("accepts a recipe with meta.visibility (#1646)", () => {
    const recipe = { ...baseRecipe, meta: { visibility: "preview" } };
    expect(serviceContractRecipeSchema.safeParse(recipe).success).toBe(true);
  });

  it("rejects a recipe with an unknown visibility value", () => {
    const recipe = { ...baseRecipe, meta: { visibility: "secret" } };
    expect(serviceContractRecipeSchema.safeParse(recipe).success).toBe(false);
  });
});

describe("recipeMetaSchema (#1646)", () => {
  it("defaults visibility to public when meta is present but empty", () => {
    const parsed = recipeMetaSchema.parse({});
    expect(parsed.visibility).toBe("public");
  });

  it("accepts each visibility level", () => {
    for (const visibility of ["public", "preview", "draft"]) {
      expect(recipeMetaSchema.safeParse({ visibility }).success).toBe(true);
    }
  });
});

describe("getRecipeVisibility (#1646)", () => {
  it("returns public when the recipe carries no meta", () => {
    expect(getRecipeVisibility({})).toBe("public");
  });

  it("returns public when meta is present but has no visibility", () => {
    expect(getRecipeVisibility({ meta: {} as never })).toBe("public");
  });

  it("returns the explicit visibility when set", () => {
    expect(getRecipeVisibility({ meta: { visibility: "preview" } })).toBe(
      "preview",
    );
    expect(getRecipeVisibility({ meta: { visibility: "draft" } })).toBe(
      "draft",
    );
  });
});
