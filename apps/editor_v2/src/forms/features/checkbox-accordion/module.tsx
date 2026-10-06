import { fieldModule } from "../../editor/field-module";
import { checkboxAccordionField } from "./definition";
import { checkboxAccordionInsertion } from "./insertion";
import { CheckboxAccordionControls } from "./controls";
import { GroupedChoices, CheckboxAccordionPreview } from "./presentation";

export const CheckboxAccordionModule = () =>
  fieldModule({
    field: checkboxAccordionField,
    insertion: checkboxAccordionInsertion,
    Controls: CheckboxAccordionControls,
    Preview: CheckboxAccordionPreview,
    Renderer: GroupedChoices,
  });
