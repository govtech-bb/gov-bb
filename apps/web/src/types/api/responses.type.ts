import { ServiceContract } from "@govtech-bb/form-types";
import { FormDraftResponseBody } from "./form-draft.type";

export interface ApiResponse {
  status: "success" | "failed";
  message: string;
  data: unknown;
  statusCode?: number;
}

export interface FormDefinitionResponse extends ApiResponse {
  data: ServiceContract;
}

export interface FromDraftResponse extends ApiResponse {
  data: FormDraftResponseBody;
}

export interface FormSubmissionResponse extends ApiResponse {
  data: FormDraftResponseBody;
}
