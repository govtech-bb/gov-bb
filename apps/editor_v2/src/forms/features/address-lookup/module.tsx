import { fieldModule } from "../../editor/field-module";
import { addressLookupField } from "./definition";
import { addressLookupInsertion } from "./insertion";
import { AddressLookupControls } from "./controls";

export const AddressLookupModule = () =>
  fieldModule({
    field: addressLookupField,
    insertion: addressLookupInsertion,
    Controls: AddressLookupControls,
  });
