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
  /**
   * The form's application deadline (#1936), ISO-8601 with offset. Present when
   * the recipe sets `meta.closingDateTime`; used by the API's `/closed`
   * endpoint to decide which public forms have passed their deadline.
   */
  closingDateTime?: string;
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
  /**
   * A disabled override with no underlying draft or published recipe; the
   * picker renders it Enable-only and not openable (there is no recipe to load).
   */
  isOrphanOverride?: boolean;
  /**
   * The form has a `form_definitions` scratch row (#2411). Set by the builder's
   * `listForms` merge, not by form_builder_api — the merge prefers a draft row
   * over the published entry and then ORs `isPublished` back on, so by the time
   * the picker sees a row it can no longer tell the two apart.
   *
   * The picker needs the distinction because a row on a *published* form
   * shadows the committed recipe on every read path, so it offers a
   * working-copy delete only where there is actually a row to remove.
   */
  hasDraftRow?: boolean;
}
