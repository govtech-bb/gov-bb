/**
 * The MDA/department contact directory entry (issue #607) — the single source
 * for the shape shared across the form builder client, the form_builder_api
 * `/builder/mda-contacts` contract, and the `@govtech-bb/database` entity's
 * address column. Distinct from `contactDetails` (the recipe subset in
 * service-contract.type), which is deliberately all-optional: a directory entry
 * is authored once with its fields **required**, whereas the recipe may copy
 * only a partial public subset.
 */

/** A postal address on an MDA contact. */
export interface MdaContactAddress {
  line1: string;
  line2?: string;
  city: string;
  country?: string;
}

/**
 * A per-environment MDA contact directory entry. The public contact fields
 * (`title`/`telephone`/`email`/`address`) are surfaced to the citizen, while
 * `mdaEmail` is the private per-environment notification address resolved
 * server-side for the reserved `config.mdaEmail` recipient token.
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
