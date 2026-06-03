import {
  CONTACT_DETAILS_PREFIX,
  CONFIG_RECIPIENT_PREFIX,
  classifyRecipientField,
} from "./recipient-field";

describe("classifyRecipientField", () => {
  it("classifies an address (contains @) as a literal", () => {
    expect(classifyRecipientField("testing@govtech.bb")).toBe("literal");
  });

  it("classifies a contactDetails.* path as a contact recipient", () => {
    expect(classifyRecipientField(`${CONTACT_DETAILS_PREFIX}email`)).toBe(
      "contact",
    );
    expect(classifyRecipientField("contactDetails.email")).toBe("contact");
  });

  it("classifies a config.* token as a config recipient", () => {
    expect(classifyRecipientField(`${CONFIG_RECIPIENT_PREFIX}mdaEmail`)).toBe(
      "config",
    );
    expect(classifyRecipientField("config.mdaEmail")).toBe("config");
  });

  it("classifies a stepId.fieldId data path as a submitted recipient", () => {
    expect(classifyRecipientField("applicant-details.email")).toBe("submitted");
  });

  it("checks the literal case first — an address starting with a prefix word is still literal", () => {
    // Contrived, but proves '@' wins: this can never be a real prefix match
    // because the prefixes contain no '@'.
    expect(classifyRecipientField("config.team@govtech.bb")).toBe("literal");
  });
});
