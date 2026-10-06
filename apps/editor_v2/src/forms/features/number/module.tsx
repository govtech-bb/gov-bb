import { fieldModule } from "../../editor/field-module";
import { numberField } from "./definition";
import { numberInsertion } from "./insertion";
import { NumberControls } from "./controls";
import { NumberPreview } from "./presentation";

export const NumberModule = () =>
  fieldModule({
    field: numberField,
    insertion: numberInsertion,
    Controls: NumberControls,
    Preview: NumberPreview,
  });
