/**
 * The uniform response envelope every apps/api endpoint returns (built by the
 * ApiResponse factory and ResponseInterceptor). Single-sourced here so the
 * producer (apps/api) and the browser consumer (apps/forms) share one
 * definition of the wire contract (#1399).
 *
 * apps/forms derives its own envelope from this — see `ApiResponse` in
 * apps/forms responses.type.ts — to widen `status` with the submission-status
 * union and relax `statusCode` to optional.
 */
export interface ApiResponseShape<T> {
  status: "success" | "failed";
  message: string;
  data: T;
  statusCode: number;
  meta?: Record<string, unknown>;
}
