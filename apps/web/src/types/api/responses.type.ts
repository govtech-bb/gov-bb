import { FormDraftResponseBody } from "./form-draft.type";

export interface ApiResponse {
  status: "success" | "failed";
  message: string;
  data: unknown;
  statusCode?: number;
}

export interface FromDraftResponse extends ApiResponse {
  data: FormDraftResponseBody;
}
