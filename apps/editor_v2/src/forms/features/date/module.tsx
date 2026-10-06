import { fieldModule } from "../../editor/field-module";
import { dateField } from "./definition";
import { dateInsertion } from "./insertion";
import { DateControls } from "./controls";
import { DatePreview } from "./presentation";

export const DateModule = () =>
  fieldModule({
    field: dateField,
    insertion: dateInsertion,
    Controls: DateControls,
    Preview: DatePreview,
  });
