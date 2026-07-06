import { FORM_CATEGORIES } from "./form-categories.generated";

export const FALLBACK_CATEGORY = "uncategorised";

/** Resolve a form's category slug from the generated map, or the fallback. */
export function categoryForForm(formId: string): string {
  return FORM_CATEGORIES[formId] ?? FALLBACK_CATEGORY;
}

export { FORM_CATEGORIES };
