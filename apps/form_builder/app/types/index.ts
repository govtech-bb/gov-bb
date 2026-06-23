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

/** A postal address on an MDA contact (issue #607). */
export interface MdaContactAddress {
  line1: string;
  line2?: string;
  city: string;
  country?: string;
}

/**
 * A per-environment MDA contact directory entry (issue #607). Mirrors the
 * form_builder_api `GET/POST /builder/mda-contacts` contract: the public
 * contact fields (`title`/`telephone`/`email`/`address`) are surfaced to the
 * citizen, while `mdaEmail` is the private per-environment notification address
 * resolved server-side for the reserved `config.mdaEmail` recipient token.
 */
export interface MdaContact {
  id: string;
  label: string;
  title: string;
  telephone: string;
  email: string;
  address: MdaContactAddress | null;
  mdaEmail: string;
}

/** Request body for creating an MDA contact (the id is server-assigned). */
export interface CreateMdaContactInput {
  label: string;
  title: string;
  telephone: string;
  email: string;
  address?: MdaContactAddress;
  mdaEmail: string;
}
