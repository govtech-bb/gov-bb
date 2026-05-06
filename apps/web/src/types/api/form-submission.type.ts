import { FormValues } from "../field-mapper.type";

type stepId = string;

export interface FormSubmissionBody {
  formId: string;
  formVersion: string;
  draftId?: string;
  values: Record<stepId, FormValues>;
}

export interface FormSubmissionResponseBody extends FormSubmissionBody {
  id: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  status: string;
  meta: unknown;
  submittedAt: string;
}
