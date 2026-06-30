import type { FormDefinitionSummary } from "../../types/index";

/**
 * Client-side mirror of the API's form-level uniqueness checks (issue #545):
 * a form's `formId` (on create) and `title` must be unique. This gives the
 * editor immediate feedback before submit; the API (`POST`/`PUT /builder/forms`)
 * re-checks on save.
 *
 * `forms` is the already-fetched list (latest version per formId, drafts +
 * published merged) from `useFormsList`, so this catches collisions against
 * published forms too — which the API check (drafts-only) currently does not.
 * `loadedFromId` is the id of the form currently open — `null` for a brand-new
 * form — and excludes the form from colliding with itself (a version bump or a
 * rename that keeps its own title).
 */

/** Same normalization as the API's `normalizeTitle`: trimmed + lowercased. */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export interface FormUniquenessResult {
  /** Set when a *new* form reuses an existing formId, else null. */
  idError: string | null;
  /** Set when the title collides with another form's latest title, else null. */
  titleError: string | null;
}

export function checkFormUniqueness(
  forms: FormDefinitionSummary[],
  draft: { formId: string; title: string },
  loadedFromId: string | null,
): FormUniquenessResult {
  // A formId collision only matters when the id differs from the form we're
  // editing — i.e. a brand-new form, or one whose id field was changed to an
  // id that already belongs to another form. Keeping the same id is a new
  // version, which is allowed.
  const idIsForOtherForm = draft.formId !== "" && draft.formId !== loadedFromId;
  const idError =
    idIsForOtherForm && forms.some((f) => f.formId === draft.formId)
      ? `A form with the ID "${draft.formId}" already exists. Choose a different ID.`
      : null;

  const normalizedTitle = normalizeTitle(draft.title);
  const titleCollision =
    normalizedTitle === ""
      ? undefined
      : forms.find(
          (f) =>
            f.formId !== loadedFromId &&
            normalizeTitle(f.title) === normalizedTitle,
        );
  const titleError = titleCollision
    ? `A form titled "${draft.title.trim()}" already exists. Choose a different title.`
    : null;

  return { idError, titleError };
}

/**
 * Client-side mirror of the API's re-key published guard (issue #674): a
 * published form's ID can't be changed, because published forms live upstream
 * and aren't ours to move. This gives the editor immediate feedback at save
 * time instead of only surfacing the API's 409.
 *
 * A re-key is a *loaded* form whose `formId` field has been changed to a new,
 * non-empty value. An empty new id is left to the id-required check, and an
 * unchanged id is a new version (not a re-key). Returns an error string to
 * surface, or `null` when the save isn't a blocked re-key.
 */
export function checkRekeyPublished(
  forms: FormDefinitionSummary[],
  draft: { formId: string },
  loadedFromId: string | null,
): string | null {
  const isRekey =
    loadedFromId !== null &&
    draft.formId !== "" &&
    draft.formId !== loadedFromId;
  if (!isRekey) return null;
  const loaded = forms.find((f) => f.formId === loadedFromId);
  return loaded?.isPublished
    ? "Cannot change the ID of a published form."
    : null;
}
