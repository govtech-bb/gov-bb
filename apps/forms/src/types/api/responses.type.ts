import {
  ApiResponseShape,
  ServiceContract,
  type PublicFormSummary,
} from "@govtech-bb/form-types";
import { FormDraftResponseBody } from "./form-draft.type";
import { FormSubmissionResponseBody } from "./form-submission.type";

// The public form-list contract is single-sourced in @govtech-bb/form-types
// (#1403 / ARCH-01) so this consumer can't drift from apps/api's producer — in
// particular it now carries the `version` the API returns, which the old local
// copy silently dropped. Re-exported so existing `@forms/types` paths keep working.
export type { PublicFormSummary };

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

export interface FormDefinitionResponse extends ApiResponse {
  data: ServiceContract;
}

export interface FormDefinitionsListResponse extends ApiResponse {
  data: PublicFormSummary[];
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
