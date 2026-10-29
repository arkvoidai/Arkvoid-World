import { ERROR_MESSAGES, POSTGRES_ERROR_MESSAGES } from '@/config/copy';

export type AppErrorCode =
  | 'NETWORK'
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'SERVER'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  message: string;
  postgresException?: string;
  raw?: unknown;
}

const POSTGRES_EXCEPTION_TO_CODE: Record<string, AppErrorCode> = {
  not_authenticated: 'AUTH_EXPIRED',
  bad_name: 'VALIDATION',
  bad_leaning: 'VALIDATION',
  bad_form: 'VALIDATION',
  no_character: 'VALIDATION',
  rate_limited: 'RATE_LIMITED',
  bad_area: 'VALIDATION',
  bad_pos: 'VALIDATION',
  bad_duration: 'VALIDATION',
  bad_kind: 'VALIDATION',
  bad_message: 'VALIDATION',
  bad_reason: 'VALIDATION',
};

export function createAppError(
  code: AppErrorCode,
  customMessage?: string,
  raw?: unknown,
  postgresException?: string,
): AppError {
  return {
    code,
    message: customMessage || ERROR_MESSAGES[code],
    postgresException,
    raw,
  };
}

export function isAppError(val: unknown): val is AppError {
  return (
    typeof val === 'object' &&
    val !== null &&
    'code' in val &&
    'message' in val &&
    typeof (val as AppError).code === 'string'
  );
}

/**
 * Maps any unknown caught error (FetchError, PostgrestError, AuthError, DOMException, Timeout)
 * to a typed AppError using the Arkvoid calm copy constitution.
 */
export function mapError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (!error) {
    return createAppError('UNKNOWN');
  }

  const errObj = error as Record<string, unknown>;
  const msg = typeof errObj.message === 'string' ? errObj.message : String(error);
  const details = typeof errObj.details === 'string' ? errObj.details : '';
  const hint = typeof errObj.hint === 'string' ? errObj.hint : '';
  const combined = `${msg} ${details} ${hint}`.toLowerCase();

  // 1. Check exact Postgres custom exception names
  for (const [pgException, targetCode] of Object.entries(POSTGRES_EXCEPTION_TO_CODE)) {
    if (combined.includes(pgException.toLowerCase())) {
      const calmMsg = POSTGRES_ERROR_MESSAGES[pgException] || ERROR_MESSAGES[targetCode];
      return createAppError(targetCode, calmMsg, error, pgException);
    }
  }

  // 2. Network & Timeout errors
  const name = typeof errObj.name === 'string' ? errObj.name : '';
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    combined.includes('timeout') ||
    combined.includes('network') ||
    combined.includes('failed to fetch') ||
    combined.includes('connection wavered') ||
    combined.includes('fetch failed') ||
    combined.includes('econnrefused')
  ) {
    return createAppError('NETWORK', ERROR_MESSAGES.NETWORK, error);
  }

  // 3. Auth expired & invalid refresh tokens
  const status = typeof errObj.status === 'number' ? errObj.status : Number(errObj.code) || 0;
  if (
    status === 401 ||
    combined.includes('jwt') ||
    combined.includes('refresh_token_not_found') ||
    combined.includes('invalid refresh token') ||
    combined.includes('session from cookies has expired') ||
    combined.includes('user not found') ||
    combined.includes('unauthorized')
  ) {
    return createAppError('AUTH_EXPIRED', ERROR_MESSAGES.AUTH_EXPIRED, error);
  }

  // 4. Rate limiting (429)
  if (
    status === 429 ||
    combined.includes('too many requests') ||
    combined.includes('rate limit') ||
    combined.includes('over_email_send_rate_limit')
  ) {
    return createAppError('RATE_LIMITED', ERROR_MESSAGES.RATE_LIMITED, error);
  }

  // 5. Forbidden / Permission denied (403)
  if (
    status === 403 ||
    combined.includes('permission denied') ||
    combined.includes('forbidden') ||
    combined.includes('rls')
  ) {
    return createAppError('FORBIDDEN', ERROR_MESSAGES.FORBIDDEN, error);
  }

  // 6. Server errors (500-504)
  if (status >= 500 && status < 600) {
    return createAppError('SERVER', ERROR_MESSAGES.SERVER, error);
  }

  return createAppError('UNKNOWN', ERROR_MESSAGES.UNKNOWN, error);
}
