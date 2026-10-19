import { CanvasDrawing, fieldModule } from "../../editor/field-module";
import { dateField } from "./definition";
import { dateInsertion } from "./insertion";
import { DateControls } from "./controls";
import { $dateParts } from "./presentation";

export const DateModule = () =>
  fieldModule({
    field: dateField,
    insertion: dateInsertion,
    Controls: DateControls,
    Preview: () => <CanvasDrawing draw={$dateParts} />,
  });
