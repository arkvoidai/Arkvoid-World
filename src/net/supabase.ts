import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  isPublicConfigReady,
} from '@/config/public';
import { createAppError, type AppError } from '@/net/errors';

export class ConfigError extends Error {
  constructor(
    message = 'Supabase URL and anon key must be configured in src/config/public.ts',
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

let supabaseInstance: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client.
 * Throws ConfigError if credentials are not configured.
 */
export function getSupabase(): SupabaseClient {
  if (!isPublicConfigReady()) {
    throw new ConfigError();
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'arkvoid.auth',
        flowType: 'pkce',
      },
      realtime: {
        eventsPerSecond: 10,
      },
    });
  }

  return supabaseInstance;
}

/**
 * Safe accessor that returns null instead of throwing if config is missing.
 */
export function getSupabaseSafe(): SupabaseClient | null {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

export function hasSupabase(): boolean {
  return isPublicConfigReady();
}

/**
 * Timeout helper for network requests (default 8 seconds).
 */
export async function withTimeout<T>(
  promiseOrFn: Promise<T> | (() => Promise<T>),
  ms = 8000,
): Promise<T> {
  const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;

  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(
        createAppError('NETWORK', 'Request timed out after 8 seconds.'),
      );
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(error: AppError): Result<T> {
  return { ok: false, error };
}
