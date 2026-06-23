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
  /**
   * Grouping category for the landing page — sourced from the form's
   * contactDetails.title (e.g. the owning ministry/department). Omitted by
   * the API when the recipe has no contactDetails; the landing page buckets
   * those under "Unknown".
   */
  category?: string;
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
