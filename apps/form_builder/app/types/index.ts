export interface FormDefinitionSummary {
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
}

// The MDA contact directory types are single-sourced in @govtech-bb/form-types
// (issue #1397 / DUP-04) so the builder client, the form_builder_api contract,
// and the database entity's address shape can't drift. Re-exported here so the
// builder's existing `../types/index` import paths keep working.
export type { MdaContact, CreateMdaContactInput } from "@govtech-bb/form-types";
