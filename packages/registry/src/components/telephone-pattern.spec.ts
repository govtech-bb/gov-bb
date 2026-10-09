import { REGISTRY_COMPONENTS } from "./index";

// One pattern for telephone questions across forms (#2917).
const TELEPHONE_HINT =
  "For example, 421-1234 for a Barbados number or +1 876 210 1234 for a number outside Barbados.";

const TELEPHONE_REFS = [
  "components/telephone",
  "components/generic-tel",
  "components/mobile-telephone",
  "components/home-telephone",
  "components/work-telephone",
  "components/contact-telephone",
] as const;

describe("telephone pattern", () => {
  it.each(TELEPHONE_REFS)("%s uses the agreed hint", (ref) => {
    expect(REGISTRY_COMPONENTS[ref]).toMatchObject({ hint: TELEPHONE_HINT });
  });

  it.each([
    "components/telephone",
    "components/generic-tel",
    "components/contact-telephone",
  ] as const)('%s defaults to the label "Telephone number"', (ref) => {
    expect(REGISTRY_COMPONENTS[ref]).toMatchObject({
      label: "Telephone number",
    });
  });

  it.each(TELEPHONE_REFS)('%s says "Enter a valid telephone number"', (ref) => {
    expect(REGISTRY_COMPONENTS[ref]).toMatchObject({
      validations: { phone: { error: "Enter a valid telephone number" } },
    });
  });

  it.each(TELEPHONE_REFS)("%s names its label in any required error", (ref) => {
    const { label, validations } = REGISTRY_COMPONENTS[ref] as {
      label: string;
      validations?: { required?: { error?: string } };
    };
    if (validations?.required) {
      expect(validations.required.error).toBe(`${label} is required`);
    }
  });
});
