import { PaginationMeta } from './pagination';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: PaginationMeta;
}

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, message };
}

export function paginatedResponse<T>(
  data: T,
  meta: PaginationMeta,
): ApiResponse<T> {
  return { success: true, data, meta };
}

export function errorResponse(
  message: string,
  code: string,
  details?: unknown,
): ApiResponse<never> {
  return {
    success: false,
    error: { code, message, details },
  };
}
