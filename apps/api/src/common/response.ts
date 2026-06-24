import { HttpStatus } from "@nestjs/common";
import type { ApiResponseShape } from "@govtech-bb/form-types";

// ApiResponseShape now lives in @govtech-bb/form-types (the browser↔backend
// response envelope, single-sourced — #1399). Re-exported here so the api
// controllers/interceptor that import it from this module keep working.
export type { ApiResponseShape };

export interface ApiResponseOptions {
  message?: string;
  statusCode?: HttpStatus;
  meta?: Record<string, unknown>;
}

export class ApiResponse {
  static success<T>(
    data: T,
    options: ApiResponseOptions = {},
  ): ApiResponseShape<T> {
    const { message = "Success", statusCode = HttpStatus.OK, meta } = options;
    return {
      status: "success",
      message,
      data,
      statusCode,
      ...(meta && { meta }),
    };
  }

  static failed(options: ApiResponseOptions = {}): ApiResponseShape<null> {
    const {
      message = "An error occurred",
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR,
      meta,
    } = options;
    return {
      status: "failed",
      message,
      data: null,
      statusCode,
      ...(meta && { meta }),
    };
  }
}
