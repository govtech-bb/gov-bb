import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { ApiResponse } from "./response";
import { MetricsService } from "../telemetry/metrics.service";

interface ParsedError {
  statusCode: number;
  message: string;
  errors?: unknown;
}

function parseException(exception: unknown): ParsedError {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "An unexpected error occurred",
    };
  }

  const statusCode = exception.getStatus();
  const response = exception.getResponse();

  if (typeof response === "string") {
    return { statusCode, message: response };
  }

  const body = response as Record<string, unknown>;
  const rawMessage = body["message"];
  const fieldErrors = body["errors"];

  // AppError.unprocessable: { errors: { fieldId: string[] } }
  if (fieldErrors !== undefined) {
    return { statusCode, message: "Validation failed", errors: fieldErrors };
  }

  // ValidationPipe (class-validator): { message: string[] }
  if (Array.isArray(rawMessage)) {
    return { statusCode, message: "Validation failed", errors: rawMessage };
  }

  if (typeof rawMessage === "string") {
    return { statusCode, message: rawMessage };
  }

  return { statusCode, message: exception.message };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly metricsService: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { statusCode, message, errors } = parseException(exception);
    const meta = errors !== undefined ? { errors } : undefined;

    this.logger.error(`${req.method} ${req.url} ${statusCode} — ${message}`);
    if (errors) {
      this.logger.error(`Validation errors: ${JSON.stringify(errors)}`);
    }

    const span = trace.getActiveSpan();
    if (span) {
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.recordException(
        exception instanceof Error ? exception : new Error(message),
      );
      span.setAttributes({ "http.status_code": statusCode });
    }

    if (
      statusCode === HttpStatus.BAD_REQUEST &&
      exception instanceof HttpException
    ) {
      this.metricsService.recordValidationFailure(req.path);
    }
    this.metricsService.recordHttpError(statusCode, req.method, req.path);

    res
      .status(statusCode)
      .json(ApiResponse.failed({ message, statusCode, meta }));
  }
}
