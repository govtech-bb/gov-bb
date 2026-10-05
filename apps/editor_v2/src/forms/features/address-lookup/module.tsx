import { fieldModule } from "../../editor/field-module";
import { addressLookupField } from "./definition";
import { addressLookupInsertion } from "./insertion";
import { AddressLookupControls } from "./controls";
import { AddressLookupPreview } from "./presentation";

export const AddressLookupModule = () =>
  fieldModule({
    field: addressLookupField,
    insertion: addressLookupInsertion,
    Controls: AddressLookupControls,
    Preview: AddressLookupPreview,
  });
