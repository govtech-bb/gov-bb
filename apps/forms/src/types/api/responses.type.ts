import { ServiceContract } from "@govtech-bb/form-types";
import { FormDraftResponseBody } from "./form-draft.type";
import { FormSubmissionResponseBody } from "./form-submission.type";

type FormSubmissionStatus =
  | "draft"
  | "submitted"
  | "pending_payment"
  | "processing"
  | "complete"
  | "error";

export interface ApiResponse {
  status: "success" | "failed" | FormSubmissionStatus;
  message: string;
  data: unknown;
  statusCode?: number;
}

export interface FormDefinitionSummary {
  formId: string;
  title: string;
}

export interface FormDefinitionResponse extends ApiResponse {
  data: ServiceContract;
}

export interface FormDefinitionsListResponse extends ApiResponse {
  data: FormDefinitionSummary[];
}

export interface FormDraftResponse extends ApiResponse {
  data: FormDraftResponseBody;
}

export interface FormSubmissionResponse extends ApiResponse {
  data: FormSubmissionResponseBody;
  meta?: {
    deferred?: {
      paymentUrl: string;
      paymentId: string;
      amount: number;
      description: string;
    };
  };
}
