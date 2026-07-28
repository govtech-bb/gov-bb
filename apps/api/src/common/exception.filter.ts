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
  // Populated only for non-HttpException Errors when NODE_ENV !== "production",
  // so operators can see the real failure in dev/staging without it leaking
  // through to prod responses.
  errorInfo?: { name: string; message: string };
}

function parseException(exception: unknown): ParsedError {
  if (!(exception instanceof HttpException)) {
    // Express/body-parser throw plain Errors carrying a client status (e.g.
    // PayloadTooLargeError with .status 413). Honour a 4xx status so the client
    // sees the real cause instead of a misleading 500.
    const rawStatus = (exception as { status?: unknown; statusCode?: unknown })
      ?.status;
    const rawStatusCode = (
      exception as { status?: unknown; statusCode?: unknown }
    )?.statusCode;
    const clientStatus =
      typeof rawStatus === "number"
        ? rawStatus
        : typeof rawStatusCode === "number"
          ? rawStatusCode
          : null;
    if (
      exception instanceof Error &&
      clientStatus !== null &&
      clientStatus >= 400 &&
      clientStatus < 500
    ) {
      return { statusCode: clientStatus, message: exception.message };
    }

    const base = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "An unexpected error occurred",
    };
    if (exception instanceof Error && process.env.NODE_ENV !== "production") {
      return {
        ...base,
        errorInfo: { name: exception.name, message: exception.message },
      };
    }
    return base;
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

    const { statusCode, message, errors, errorInfo } =
      parseException(exception);
    const metaParts: Record<string, unknown> = {};
    if (errors !== undefined) metaParts.errors = errors;
    if (errorInfo) metaParts.error = errorInfo;
    const meta = Object.keys(metaParts).length > 0 ? metaParts : undefined;

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

    // http.route must stay low-cardinality: use the matched route template and
    // collapse unmatched routes (e.g. scanner 404s) into a single "unmatched"
    // bucket. Using req.path here mints a new metric per unique URL.
    const route = req.route?.path ?? "unmatched";

    if (
      statusCode === HttpStatus.BAD_REQUEST &&
      exception instanceof HttpException
    ) {
      this.metricsService.recordValidationFailure(route);
    }
    this.metricsService.recordHttpError(statusCode, req.method, route);

    res
      .status(statusCode)
      .json(ApiResponse.failed({ message, statusCode, meta }));
  }
}
