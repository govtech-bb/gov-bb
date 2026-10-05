import { fieldModule } from "../../editor/field-module";
import { multipleChoiceField } from "./definition";
import { multipleChoiceInsertion } from "./insertion";
import { MultipleChoiceControls } from "./controls";
import { MultipleChoicePreview } from "./presentation";

export const MultipleChoiceModule = () =>
  fieldModule({
    field: multipleChoiceField,
    insertion: multipleChoiceInsertion,
    Controls: MultipleChoiceControls,
    Preview: MultipleChoicePreview,
  });
