import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { Response } from 'express';
import type { ApiResponseShape } from './response';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: ApiResponseShape<unknown>) => {
        if (data?.statusCode) {
          res.status(data.statusCode);
        }
        return data;
      }),
    );
  }
}
