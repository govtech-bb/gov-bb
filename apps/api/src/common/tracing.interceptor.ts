import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { Request, Response } from "express";

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const span = trace.getActiveSpan();

    if (span) {
      span.setAttributes({
        "http.method": req.method,
        "http.route": req.route?.path ?? req.path,
        "http.url": req.url,
      });
    }

    return next.handle().pipe(
      tap(() => {
        if (span) {
          span.setAttributes({ "http.status_code": res.statusCode });
          span.setStatus({ code: SpanStatusCode.OK });
        }
      }),
    );
  }
}
