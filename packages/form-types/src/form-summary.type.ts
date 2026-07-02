import type { RecipeVisibility } from "./service-contract.type";

/**
 * The two "a form in the list" contracts, single-sourced here so producer and
 * consumer can't drift and the same name can't describe two incompatible shapes
 * (issue #1403 / ARCH-01). They describe two distinct list endpoints:
 *
 * - `PublicFormSummary` — apps/api's public `/form-definitions` index.
 * - `BuilderFormSummary` — the authoring `/builder/forms` index produced by
 *   form_builder_api and consumed by form_builder.
 */

/**
 * One entry in apps/api's public `/form-definitions` index. Produced by
 * FormDefinitionsService and consumed by apps/forms (the list page) and, as a
 * `formId|title|version` subset, by form_builder_api's uniqueness backstop.
 */
export interface PublicFormSummary {
  formId: string;
  title: string;
  version: string;
  /**
   * Grouping category for the landing page — sourced from the form's
   * contactDetails.title (e.g. the owning ministry/department). Omitted by
   * the API when the recipe has no contactDetails; the landing page buckets
   * those under "Unknown".
   */
  category?: string;
  /**
   * The form's launch-gate visibility (#1835). Present only on the authoring
   * list (a valid preview token was supplied); omitted on the public index, so
   * the default no-token response is unchanged. Absent is treated as `public`.
   */
  visibility?: RecipeVisibility;
}

/**
 * One entry in the authoring `/builder/forms` index. Produced by
 * form_builder_api and consumed by form_builder (the Open/Forms list).
 */
export interface BuilderFormSummary {
  id: string;
  formId: string;
  title: string;
  version: string;
  isPublished: boolean;
  /**
   * The exact version present in the published index, when the form is
   * published. Distinct from `version` (the merged latest, which may be a
   * higher unpublished draft). The builder uses this to tell whether the
   * *loaded* version is the published one: editing a published version must
   * cut a new draft version rather than overwrite the immutable published row
   * in place (the API rejects that with "Cannot update a published recipe").
   * Undefined when the form is not published.
   */
  publishedVersion?: string;
  isDisabled?: boolean;
  /**
   * The form's launch-gate visibility (#1835), carried through from the
   * authoring published index. Non-public values (`preview`/`draft`/
   * `maintenance`) drive the picker's visibility badge so an operator can see
   * why a published form isn't on the public site. Absent means `public`.
   */
  visibility?: RecipeVisibility;
}
