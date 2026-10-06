import { fieldModule } from "../../editor/field-module";
import { emailField } from "./definition";
import { emailInsertion } from "./insertion";
import { EmailControls } from "./controls";
import { EmailPreview } from "./presentation";

export const EmailModule = () =>
  fieldModule({
    field: emailField,
    insertion: emailInsertion,
    Controls: EmailControls,
    Preview: EmailPreview,
  });
