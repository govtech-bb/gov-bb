export { AccountName } from "./account-name";
export { AccountNumber } from "./account-number";
export { AccountType } from "./account-type";
export { AdditionalDetails } from "./additional-details";
export { Address } from "./address";
export { Bank } from "./bank";
export { Confirmation } from "./confirmation";
export { ContactTelephone } from "./contact-number";
export { Country } from "./country";
export { GenericDate } from "./date";
export { DateOfBirth } from "./date-of-birth";
export { EmailAddress } from "./email";
export { FaxNumber } from "./fax-number";
export { FirstName } from "./first-name";
export { HomeTelephone } from "./home-telephone";
export { LastName } from "./last-name";
export { MiddleName } from "./middle-name";
export { MobileTelephone } from "./mobile-telephone";
export { Name } from "./name";
export { NationalIdNumber } from "./national-id";
export { NationalInsuranceNumber } from "./national-insurance-number";
export { Nationality } from "./nationality";
export { Parish } from "./parish";
export { PassportNumber } from "./passport-number";
export { Postcode } from "./post-code";
export { Relationship } from "./relationship";
export { Sex } from "./sex";
export { TamisNumber } from "./tamis-number";
export { Telephone } from "./telephone";
export { Town } from "./town";
export { UploadDocument } from "./upload-document";
export { WorkTelephone } from "./work-telephone";
export { Title } from "./title";
export { GenericText } from "./generic-text";
export { GenericTextarea } from "./generic-textarea";
export { GenericNumber } from "./generic-number";
export { GenericDateInput } from "./generic-date";
export { GenericTel } from "./generic-tel";
export { GenericEmail } from "./generic-email";
export { GenericCheckbox } from "./generic-checkbox";
export { GenericRadio } from "./generic-radio";
export { GenericFile } from "./generic-file";
export { GenericSelect } from "./generic-select";
export { ShowHide } from "./show-hide";

import { AccountName } from "./account-name";
import { AccountNumber } from "./account-number";
import { AccountType } from "./account-type";
import { AdditionalDetails } from "./additional-details";
import { Address } from "./address";
import { Bank } from "./bank";
import { Confirmation } from "./confirmation";
import { ContactTelephone } from "./contact-number";
import { Country } from "./country";
import { GenericDate } from "./date";
import { DateOfBirth } from "./date-of-birth";
import { EmailAddress } from "./email";
import { FaxNumber } from "./fax-number";
import { FirstName } from "./first-name";
import { HomeTelephone } from "./home-telephone";
import { LastName } from "./last-name";
import { MiddleName } from "./middle-name";
import { MobileTelephone } from "./mobile-telephone";
import { Name } from "./name";
import { NationalIdNumber } from "./national-id";
import { NationalInsuranceNumber } from "./national-insurance-number";
import { Nationality } from "./nationality";
import { Parish } from "./parish";
import { PassportNumber } from "./passport-number";
import { Postcode } from "./post-code";
import { Relationship } from "./relationship";
import { Sex } from "./sex";
import { TamisNumber } from "./tamis-number";
import { Telephone } from "./telephone";
import { Town } from "./town";
import { UploadDocument } from "./upload-document";
import { WorkTelephone } from "./work-telephone";
import { Title } from "./title";
import { GenericText } from "./generic-text";
import { GenericTextarea } from "./generic-textarea";
import { GenericNumber } from "./generic-number";
import { GenericDateInput } from "./generic-date";
import { GenericTel } from "./generic-tel";
import { GenericEmail } from "./generic-email";
import { GenericCheckbox } from "./generic-checkbox";
import { GenericRadio } from "./generic-radio";
import { GenericFile } from "./generic-file";
import { GenericSelect } from "./generic-select";
import { ShowHide } from "./show-hide";
import type { Primitive } from "@govtech-bb/form-types";

const PRIMITIVES = [
  GenericText,
  GenericTextarea,
  GenericNumber,
  GenericDateInput,
  GenericTel,
  GenericEmail,
  GenericCheckbox,
  GenericRadio,
  GenericFile,
  GenericSelect,
] as const satisfies Primitive[];

const ALL = [
  AccountName,
  AccountNumber,
  AccountType,
  AdditionalDetails,
  Address,
  Bank,
  Confirmation,
  ContactTelephone,
  Country,
  GenericDate,
  DateOfBirth,
  EmailAddress,
  FaxNumber,
  FirstName,
  HomeTelephone,
  LastName,
  MiddleName,
  MobileTelephone,
  Name,
  NationalIdNumber,
  NationalInsuranceNumber,
  Nationality,
  Parish,
  PassportNumber,
  Postcode,
  Relationship,
  Sex,
  TamisNumber,
  Telephone,
  Town,
  Title,
  UploadDocument,
  WorkTelephone,
  ShowHide,
  ...PRIMITIVES,
] as const satisfies Primitive[];

// Completeness guard: bump the literal type whenever you add a component to
// ALL, so a registered-but-unlisted component fails the build.
const _componentCount: 44 = ALL.length;

export const REGISTRY_COMPONENTS: Record<`components/${string}`, Primitive> =
  Object.fromEntries(ALL.map((c) => [`components/${c.fieldId}`, c]));

export const REGISTRY_PRIMITIVES: Record<`components/${string}`, Primitive> =
  Object.fromEntries(PRIMITIVES.map((c) => [`components/${c.fieldId}`, c]));
