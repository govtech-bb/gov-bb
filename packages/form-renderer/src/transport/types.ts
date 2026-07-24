import type {
  FormMeta,
  FormValuesByStep,
  UploadedFile,
  FormSubmissionResponse,
} from "../types";

export interface SubmitArgs {
  formMeta: FormMeta;
  valuesBySteps: FormValuesByStep;
  previewToken?: string;
}

export interface UploadArgs {
  file: File;
  formId: string;
  stepId: string;
  fieldId: string;
  previewToken?: string;
  draftToken?: string;
}

export interface FormTransport {
  submit(args: SubmitArgs): Promise<FormSubmissionResponse>;
  uploadFile(args: UploadArgs): Promise<UploadedFile>;
}
