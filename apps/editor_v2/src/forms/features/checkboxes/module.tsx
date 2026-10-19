import { fieldModule } from "../../editor/field-module";
import { checkboxesField } from "./definition";
import { checkboxesInsertion } from "./insertion";
import { CheckboxesControls } from "./controls";

export const CheckboxesModule = () =>
  fieldModule({
    field: checkboxesField,
    insertion: checkboxesInsertion,
    Controls: CheckboxesControls,
  });
