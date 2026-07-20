import { categoryForForm } from "@govtech-bb/content/form-categories";

/** The category slug for a form id (legacy-parity event payloads need it). */
export function formCategory(formId: string): string {
  return categoryForForm(formId);
}
