import { HttpStatus } from '@nestjs/common';

export interface ApiResponseShape<T> {
  status: 'success' | 'failed';
  message: string;
  data: T;
  statusCode: number;
  meta?: Record<string, unknown>;
}

export interface ApiResponseOptions {
  message?: string;
  statusCode?: HttpStatus;
  meta?: Record<string, unknown>;
}

export class ApiResponse {
  static success<T>(data: T, options: ApiResponseOptions = {}): ApiResponseShape<T> {
    const { message = 'Success', statusCode = HttpStatus.OK, meta } = options;
    return { status: 'success', message, data, statusCode, ...(meta && { meta }) };
  }

  static failed(options: ApiResponseOptions = {}): ApiResponseShape<null> {
    const { message = 'An error occurred', statusCode = HttpStatus.INTERNAL_SERVER_ERROR, meta } = options;
    return { status: 'failed', message, data: null, statusCode, ...(meta && { meta }) };
  }
}
