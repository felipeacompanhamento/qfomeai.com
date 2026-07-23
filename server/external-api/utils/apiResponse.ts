import { Response } from 'express';
import { ApiErrorCode, ApiErrorResponse, ApiSuccessResponse } from '../types/externalApi.js';

/**
 * Sends a standardized success JSON response.
 */
export function sendApiSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  requestId: string = 'unknown'
): Response {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const responseBody: ApiSuccessResponse<T> = {
    success: true,
    data,
    requestId,
  };

  return res.status(statusCode).json(responseBody);
}

/**
 * Sends a standardized error JSON response.
 */
export function sendApiError(
  res: Response,
  code: ApiErrorCode,
  message: string,
  statusCode: number = 400,
  requestId: string = 'unknown'
): Response {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const responseBody: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
    requestId,
  };

  return res.status(statusCode).json(responseBody);
}
