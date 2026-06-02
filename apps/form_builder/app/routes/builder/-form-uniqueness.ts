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
