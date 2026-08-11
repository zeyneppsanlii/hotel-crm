import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorResponse } from './api-response';

interface ResolvedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Turns EVERY thrown error into the standard error envelope. No raw NestJS error
 * or stack trace ever leaks to the client; unexpected errors are logged (with
 * stack + requestId) and reported to the client as a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { status, code, message, details } = this.resolve(exception);

    const line = `[${req.requestId ?? '-'}] ${req.method} ${req.url} -> ${status} ${code}`;
    if (status >= 500) {
      // Real bug: log the full stack for debugging, but never send it to the client.
      this.logger.error(
        line,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${line}: ${message}`);
    }

    const body: ErrorResponse = {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    };
    if (req.requestId) {
      res.setHeader('x-request-id', req.requestId);
    }
    res.status(status).json(body);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let code = this.codeForStatus(status);
      let message = exception.message;
      let details: unknown;

      if (typeof response === 'object' && response !== null) {
        const r = response as { message?: unknown };
        if (Array.isArray(r.message)) {
          // class-validator produces an array of messages.
          code = 'VALIDATION_ERROR';
          message = 'Validation failed';
          details = r.message;
        } else if (typeof r.message === 'string') {
          message = r.message;
        }
      }
      return { status, code, message, details };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    // Unknown/unexpected — do not leak internals.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }

  private mapPrismaError(
    error: Prisma.PrismaClientKnownRequestError,
  ): ResolvedError {
    switch (error.code) {
      case 'P2002': // unique constraint violation
        return {
          status: HttpStatus.CONFLICT,
          code: 'DUPLICATE_RESOURCE',
          message: 'A resource with these values already exists',
          details: error.meta,
        };
      case 'P2025': // record required but not found
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
          details: error.meta,
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: `DB_${error.code}`,
          message: 'Database request error',
        };
    }
  }

  private codeForStatus(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
    };
    return codes[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
  }
}
