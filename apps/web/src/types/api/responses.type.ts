import { ServiceContract } from "@govtech-bb/form-types";
import { FormDraftResponseBody } from "./form-draft.type";

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

export interface FormDefinitionResponse extends ApiResponse {
  data: ServiceContract;
}

export interface FormDraftResponse extends ApiResponse {
  data: FormDraftResponseBody;
}

export interface FormSubmissionResponse extends ApiResponse {
  data: FormDraftResponseBody;
}
