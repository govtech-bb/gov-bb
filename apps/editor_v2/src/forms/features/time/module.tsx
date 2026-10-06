import { fieldModule } from "../../editor/field-module";
import { timeField } from "./definition";
import { timeInsertion } from "./insertion";
import { TimeControls } from "./controls";
import { TimePreview } from "./presentation";

export const TimeModule = () =>
  fieldModule({
    field: timeField,
    insertion: timeInsertion,
    Controls: TimeControls,
    Preview: TimePreview,
  });
