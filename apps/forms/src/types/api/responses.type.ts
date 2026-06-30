import { ApiResponseShape, ServiceContract } from "@govtech-bb/form-types";
import { FormDraftResponseBody } from "./form-draft.type";
import { FormSubmissionResponseBody } from "./form-submission.type";

type FormSubmissionStatus =
  | "draft"
  | "submitted"
  | "pending_payment"
  | "processing"
  | "complete"
  | "error";

// Derived from the shared producer envelope (#1399) so `message`/`data` stay in
// lockstep with apps/api, while keeping the two browser-side deviations: the
// API echoes the submission's own status into the envelope `status` (hence the
// FormSubmissionStatus widening), and an older deploy may omit `statusCode`.
export interface ApiResponse extends Omit<
  ApiResponseShape<unknown>,
  "status" | "statusCode" | "meta"
> {
  status: ApiResponseShape<unknown>["status"] | FormSubmissionStatus;
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
