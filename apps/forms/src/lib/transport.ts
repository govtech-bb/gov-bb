import type { FormTransport } from "@govtech-bb/form-renderer";
import { postFormSubmission } from "./api/forms";
import { uploadFile } from "./api/files";

// The package's renderer talks to the backend through this transport so the
// same components can run in a different host (e.g. the landing app) that
// supplies its own implementation. Here it delegates to the app's existing API
// helpers. `postFormSubmission` takes positional args; `uploadFile` already
// takes the exact UploadArgs object shape, so it passes straight through.
export const formTransport: FormTransport = {
  submit: ({ formMeta, valuesBySteps, previewToken }) =>
    postFormSubmission(formMeta, valuesBySteps, previewToken),
  uploadFile: (args) => uploadFile(args),
};
