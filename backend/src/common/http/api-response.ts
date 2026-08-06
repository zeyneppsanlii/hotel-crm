/**
 * The single response envelope every endpoint returns. A consumer can write one
 * success path and one error path instead of guessing each endpoint's shape.
 */

export interface ResponseMeta {
  timestamp: string;
  requestId?: string;
  // Present only on paginated responses.
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorResponse {
  success: false;
  error: ApiError;
  meta: ResponseMeta;
}
