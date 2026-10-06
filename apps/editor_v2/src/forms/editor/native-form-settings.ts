import type { FormSettings, ContactDetails } from "../core/form-settings";
import type { NativeNodeData } from "./native-state";

type FormData = NonNullable<NativeNodeData["form"]>;

export function nativeFormSettings(native: FormData): FormSettings {
  const { settings } = native,
    department = settings.notifications?.department,
    applicant = settings.notifications?.applicant;

  return {
    formId: native.id,
    visibility: settings.visibility,
    ...(typeof native.description === "string" && { description: native.description }),
    ...(settings.contact && { contactDetails: settings.contact }),
    ...(settings.closingDateTime !== undefined && { closingDateTime: settings.closingDateTime }),
    ...(department && {
      departmentEmail: {
        ...(!department.enabled && { off: true as const }),
        ...("contact" in department.recipient && { to: "contactDetails.email" as const }),
        ...(department.subject !== undefined && { subject: department.subject }),
      },
    }),
    ...(applicant?.enabled && {
      applicantEmail: {
        question: applicant.recipient.answer,
        ...(applicant.subject !== undefined && { subject: applicant.subject }),
      },
    }),
  };
}

export function applyNativeFormSettings(native: FormData, patch: Partial<FormSettings>): FormData {
  const form = structuredClone(native);

  if ("formId" in patch) form.id = patch.formId ?? "";

  if ("description" in patch) {
    if (patch.description === undefined) delete form.description;
    else form.description = patch.description;
  }

  if ("visibility" in patch) form.settings.visibility = patch.visibility!;

  if ("closingDateTime" in patch) {
    if (patch.closingDateTime === undefined) delete form.settings.closingDateTime;
    else form.settings.closingDateTime = patch.closingDateTime;
  }

  if ("contactDetails" in patch) {
    if (patch.contactDetails === undefined) delete form.settings.contact;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- StoredContact allows an unfinished address while published contact requires line1 and city; keep those edits for validateFormDefinition at export.
    else form.settings.contact = structuredClone(patch.contactDetails) as ContactDetails;
  }

  if ("applicantEmail" in patch) {
    const value = patch.applicantEmail;
    form.settings.notifications = { ...form.settings.notifications };

    if (!value) delete form.settings.notifications.applicant;
    else
      form.settings.notifications.applicant = {
        enabled: true,
        recipient: { answer: value.question },
        ...(value.subject !== undefined && { subject: value.subject }),
      };
  }

  if ("departmentEmail" in patch) {
    const value = patch.departmentEmail;
    form.settings.notifications = {
      ...form.settings.notifications,
      department: {
        enabled: !value?.off,
        recipient:
          value?.to === "contactDetails.email"
            ? { contact: "email" }
            : { context: "departmentEmail" },
        ...(value?.subject !== undefined && { subject: value.subject }),
      },
    };
  }

  return form;
}
