import type { RecipeVisibility } from "@govtech-bb/form-types";
import type { BuilderFormSummary } from "../types";

/**
 * A published form's launch status as the builder shows it (#2875). The four
 * visibility levels are apps/api's *effective* visibility — a `service_status`
 * row set in Feature flagging wins, the recipe's `meta.visibility` is only the
 * fallback when there is no row — carried on `BuilderFormSummary.visibility`
 * from the authoring published index. `unavailable` is a published form the
 * index returned without a status (the proxy fell back to the public-only
 * list, e.g. no `RECIPE_PREVIEW_TOKEN`). The builder never derives a status
 * from the recipe or manifest it holds.
 */
export type FormStatus = RecipeVisibility | "unavailable";

export const FORM_STATUS_LABEL: Record<FormStatus, string> = {
  public: "Public",
  preview: "Preview",
  draft: "Draft",
  maintenance: "Maintenance",
  unavailable: "Status unavailable",
};

/** Where an author changes a form's status — never the builder itself. */
export const FORM_STATUS_HINT = "Set in the Feature flagging tool.";

/**
 * The status of one listed form, or `null` for an unpublished form (it has no
 * live status yet — the row is irrelevant until the recipe is deployed).
 */
export function formStatus(
  form: Pick<BuilderFormSummary, "isPublished" | "visibility"> | undefined,
): FormStatus | null {
  if (!form?.isPublished) return null;
  return form.visibility ?? "unavailable";
}

/**
 * The status of the form open in the editor, resolved against the forms list
 * the editor already fetches: `loading` while the list is in flight,
 * `unavailable` when the list failed, `null` when the form is not published.
 */
export function loadedFormStatus(
  formId: string,
  list: { forms: BuilderFormSummary[] | null; loadError: string | null },
): FormStatus | "loading" | null {
  if (list.forms === null) return list.loadError ? "unavailable" : "loading";
  return formStatus(list.forms.find((form) => form.formId === formId));
}
