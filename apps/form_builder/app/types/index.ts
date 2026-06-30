// The form-list and MDA contact directory types are single-sourced in
// @govtech-bb/form-types (BuilderFormSummary #1403 / ARCH-01; MdaContact #1397 /
// DUP-04) so the builder client, the form_builder_api contract, and the database
// entity's shapes can't drift. Re-exported here so the builder's existing
// `../types/index` import paths keep working.
export type {
  BuilderFormSummary,
  MdaContact,
  CreateMdaContactInput,
} from "@govtech-bb/form-types";
