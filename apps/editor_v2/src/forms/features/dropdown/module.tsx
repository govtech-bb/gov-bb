import { fieldModule } from "../../editor/field-module";
import { dropdownField } from "./definition";
import { dropdownInsertion } from "./insertion";
import { DropdownControls } from "./controls";

export const DropdownModule = () =>
  fieldModule({
    field: dropdownField,
    insertion: dropdownInsertion,
    Controls: DropdownControls,
  });
