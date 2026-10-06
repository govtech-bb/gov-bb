import type { Settings } from "./settings";
import { autoId } from "./identities";

export * from "./closing";

export const VISIBILITY_VALUES = ["draft", "preview", "public", "maintenance"] as const;

export type Visibility = (typeof VISIBILITY_VALUES)[number];

export const MDA_EMAIL = "config.mdaEmail";

export const CONTACT_EMAIL = "contactDetails.email";

// SSB's builder's labels (service-setup.tsx 547, 702) and processor's default subjects (email.processor.ts 171, 176)
export const APPLICANT_LABEL = "Applicant confirmation";

export const DEPARTMENT_LABEL = "Department notification";

export const APPLICANT_SUBJECT = "Your form submission has been received";

export const departmentSubject = (title: string) =>
  `A new submission has been received for ${title || "this form"}`;

/** zod 4.4.3's email regex (zod/v4/core/regexes.js 31), which SSB's contactDetails.email runs. */
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+.-]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Diagnostic location for form metadata rather than a content block. */
export const FORM_SETTINGS = "form-settings";

/** SSB's contactDetails (service-contract.type.ts 36–48), as compiled. */
export type ContactDetails = {
  title?: string;
  telephoneNumber?: string;
  email?: string;
  address?: { line1: string; line2?: string; city: string; country?: string };
};

/** Stored contact fields remain optional until converter validation. */
export type StoredContact = {
  title?: string;
  telephoneNumber?: string;
  email?: string;
  address?: { line1?: string; line2?: string; city?: string; country?: string };
};

export type FormSettings = {
  formId?: string;
  description?: string;
  visibility?: Visibility;
  closingDateTime?: string;
  contactDetails?: StoredContact;
  applicantEmail?: { question: string; subject?: string };
  departmentEmail?: { off?: true; to?: typeof CONTACT_EMAIL; subject?: string };
};

/** SSB's email processor (processor.type.ts 53–59, 173–176), as the editor writes it. */
export type EmailProcessor = {
  type: "email";
  config: { recipientField: string; subject?: string; label: string };
};

/** The recipe's top-level keys besides title and steps (service-contract.type.ts 120–133), in SSB's order. */
export type ServiceContract = {
  formId: string;
  description?: string;
  contactDetails?: ContactDetails;
  processors: EmailProcessor[];
  meta: { visibility: Visibility; closingDateTime?: string };
};

export const autoFormId = (title: string) => autoId(title, "form", "form-");

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  // SAFETY: the object check permits dictionary access; each property stays unknown until its reader validates it.
  return value as Record<string, unknown>;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

const textFields = (value: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const kept = text(value[key]);

      return kept === undefined ? [] : [[key, kept]];
    }),
  );

/** Every reader drops malformed and blank settings, without trimming the author's text. */
export function formSettingsOf(settings: Settings): FormSettings {
  const value = record(settings.formSettings);
  const result: FormSettings = textFields(value, ["formId", "description", "closingDateTime"]);

  const visibility = VISIBILITY_VALUES.find((visibility) => visibility === value.visibility);

  if (visibility !== undefined) result.visibility = visibility;
  const contact = record(value.contactDetails);
  const details: StoredContact = textFields(contact, ["title", "telephoneNumber", "email"]);
  const address = textFields(record(contact.address), ["line1", "line2", "city", "country"]);

  if (Object.keys(address).length) details.address = address;

  if (Object.keys(details).length) result.contactDetails = details;
  const applicant = record(value.applicantEmail);
  const question = text(applicant.question);

  if (question) result.applicantEmail = { question, ...textFields(applicant, ["subject"]) };
  const department = record(value.departmentEmail);

  const email: FormSettings["departmentEmail"] = {
    ...(department.off === true && { off: true }),
    ...(department.to === CONTACT_EMAIL && { to: CONTACT_EMAIL }),
    ...textFields(department, ["subject"]),
  };

  if (Object.keys(email).length) result.departmentEmail = email;

  return result;
}

/** SSB's buildContactDetails: a partial address keeps its required blanks for preflight. */
export function contactOut(contact?: StoredContact): ContactDetails | undefined {
  const trim = (value: StoredContact | NonNullable<StoredContact["address"]>) =>
    Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ]),
    );

  const result: ContactDetails = textFields(trim(contact ?? {}), [
    "title",
    "telephoneNumber",
    "email",
  ]);

  const address = textFields(trim(contact?.address ?? {}), ["line1", "line2", "city", "country"]);

  if (Object.keys(address).length)
    result.address = {
      line1: address.line1 ?? "",
      ...(address.line2 && { line2: address.line2 }),
      city: address.city ?? "",
      ...(address.country && { country: address.country }),
    };

  return Object.keys(result).length ? result : undefined;
}
