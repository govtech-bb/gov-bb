import { fieldModule } from "../../editor/field-module";
import { phoneField } from "./definition";
import { phoneInsertion } from "./insertion";
import { PhoneControls } from "./controls";

export const PhoneModule = () =>
  fieldModule({
    field: phoneField,
    insertion: phoneInsertion,
    Controls: PhoneControls,
  });
