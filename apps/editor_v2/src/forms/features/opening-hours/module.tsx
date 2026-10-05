import { fieldModule } from "../../editor/field-module";
import { openingHoursField } from "./definition";
import { openingHoursInsertion } from "./insertion";
import { OpeningHoursControls } from "./controls";
import { OpeningHours, OpeningHoursPreview } from "./presentation";

export const OpeningHoursModule = () =>
  fieldModule({
    field: openingHoursField,
    insertion: openingHoursInsertion,
    Controls: OpeningHoursControls,
    Preview: OpeningHoursPreview,
    Renderer: OpeningHours,
  });
