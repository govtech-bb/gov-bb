import { ServiceContract } from "@govtech-bb/form-types";
import { FormDraftResponseBody } from "./form-draft.type";

export interface ApiResponse {
  status: "success" | "failed";
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
  data: FormDraftResponseBody;
}
