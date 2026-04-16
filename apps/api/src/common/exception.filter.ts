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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly metricsService: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? ((exception.getResponse() as any)?.message ?? exception.message)
        : "An unexpected error occurred";

    this.logger.error(`${req.method} ${req.url} ${statusCode} - ${message}`);

    const span = trace.getActiveSpan();
    if (span) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(message) });
      span.recordException(
        exception instanceof Error ? exception : new Error(String(message)),
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

    res.status(statusCode).json(ApiResponse.failed({ message, statusCode }));
  }
}
