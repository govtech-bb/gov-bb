import { fieldModule } from "../../editor/field-module";
import { shortAnswerField } from "./definition";
import { shortAnswerInsertion } from "./insertion";
import { ShortAnswerControls } from "./controls";
import { ShortAnswerPreview } from "./presentation";

export const ShortAnswerModule = () =>
  fieldModule({
    key: "field:short-answer",
    field: shortAnswerField,
    insertion: shortAnswerInsertion,
    Controls: ShortAnswerControls,
    Preview: ShortAnswerPreview,
  });
