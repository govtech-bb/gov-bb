import { FormValues } from "../field-mapper.type";

export interface FormDraft {
  draftId: string;
  formId: string;
  version: string;
  values: FormValues;
  lastActiveStep: string;
}

export interface FormDraftResponseBody {
  id: string;
  createdAt: string;
  updatedAt: string;
  draftId: string;
  formId: string;
  formVersion: string;
  values: FormValues;
  lastActiveStep: string;
  status: string;
  lastActiveAt: string;
}
