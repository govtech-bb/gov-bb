import { AddressLookupModule } from "./address-lookup";
import { CheckboxesModule } from "./checkboxes";
import { DateInputModule } from "./date-input";
import { EmailAddressModule } from "./email-address";
import { FileUploadModule } from "./file-upload";
import { GroupedCheckboxesModule } from "./grouped-checkboxes";
import { NumberModule } from "./number";
import { OpeningHoursModule } from "./opening-hours";
import { PhoneNumberModule } from "./phone-number";
import { RadiosModule } from "./radios";
import { SelectModule } from "./select";
import { TextareaModule } from "./textarea";
import { TextInputModule } from "./text-input";
import { TimeModule } from "./time";
import { YesOrNoModule } from "./yes-or-no";

/**
 * The form's answer types, each a file of its own made with defineField and fieldModule: add a new one here. They
 * install in this order, after the form's structure, logic and content.
 */
export const formFields = [
  TextInputModule(),
  YesOrNoModule(),
  FileUploadModule(),
  TextareaModule(),
  EmailAddressModule(),
  PhoneNumberModule(),
  NumberModule(),
  DateInputModule(),
  TimeModule(),
  RadiosModule(),
  CheckboxesModule(),
  SelectModule(),
  AddressLookupModule(),
  OpeningHoursModule(),
  GroupedCheckboxesModule(),
];
