/** Existing registry formats, retained unchanged until entries migrate to the Form registry. */
type Format = {
  name: string;
  pattern: string;
  mask?: string;
  message: (subject: string) => string;
};

export const FORMATS: Record<
  "personName" | "nationalId" | "nationalInsurance" | "postcode" | "tamis",
  Format
> = {
  personName: {
    name: "Person name",
    pattern: "^\\s*\\p{L}(?:[\\p{L}\\p{M}\\s'’.-]*[\\p{L}\\p{M}.])?\\s*$",
    message: (subject) =>
      `${subject} must contain only letters, spaces, hyphens, apostrophes, or periods`,
  },
  nationalId: {
    name: "National ID",
    pattern: "^\\d{6}-\\d{4}$",
    mask: "999999-9999",
    message: () => "Enter a valid National ID number (for example, 900314-0052)",
  },
  nationalInsurance: {
    name: "National Insurance",
    pattern: "^\\d{6}$",
    mask: "999999",
    message: () => "Enter a valid National Insurance number (for example, 123456)",
  },
  postcode: {
    name: "Barbados postcode",
    pattern: "^[Bb]{2} ?\\d{5}$",
    message: () => "Enter a valid postcode (for example, BB17004)",
  },
  tamis: {
    name: "Digits only",
    pattern: "^\\d+$",
    message: () => "Enter a valid TAMIS number (digits only)",
  },
};

export const formatOf = (settings: { pattern?: unknown }) =>
  Object.values(FORMATS).find((format) => format.pattern === settings.pattern);
