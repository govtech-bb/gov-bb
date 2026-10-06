import { fieldModule } from "../../editor/field-module";
import { fileUploadField } from "./definition";
import { fileUploadInsertion } from "./insertion";
import { FileUploadControls } from "./controls";
import { FileUploadPreview, FileUpload } from "./presentation";

export const FileUploadModule = () =>
  fieldModule({
    field: fileUploadField,
    insertion: fileUploadInsertion,
    Controls: FileUploadControls,
    Preview: FileUploadPreview,
    Renderer: FileUpload,
  });
