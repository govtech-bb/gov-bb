import { fieldModule } from "../../editor/field-module";
import { emailField } from "./definition";
import { emailInsertion } from "./insertion";
import { EmailControls } from "./controls";

export const EmailModule = () =>
  fieldModule({
    field: emailField,
    insertion: emailInsertion,
    Controls: EmailControls,
  });
