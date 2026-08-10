import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResponseMeta, SuccessResponse } from './api-response';
import { PaginatedResult } from './paginated-result';

/**
 * Wraps every successful controller return value in the standard success
 * envelope. Errors never reach here — they are handled by AllExceptionsFilter.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((payload: unknown) => {
        const meta: ResponseMeta = {
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        };

        let data: unknown = payload;
        if (payload instanceof PaginatedResult) {
          data = payload.items;
          meta.page = payload.page;
          meta.limit = payload.limit;
          meta.total = payload.total;
          meta.hasMore = payload.hasMore;
        }

        return { success: true, data, meta };
      }),
    );
  }
}
