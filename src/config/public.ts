/**
 * Public Supabase configuration.
 * Both SUPABASE_URL and SUPABASE_ANON_KEY are public by design.
 * Security is enforced through Row Level Security (RLS) policies and Edge Functions.
 *
 * Founder setup:
 * 1. Supabase -> Project Settings -> API: copy Project URL & anon key into SUPABASE_URL & SUPABASE_ANON_KEY below.
 * 2. Optional anti-bot: Authentication -> Attack protection -> Turnstile site key into TURNSTILE_SITE_KEY.
 */
export const SUPABASE_URL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';

export const SUPABASE_ANON_KEY: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';

export const TURNSTILE_SITE_KEY: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURNSTILE_SITE_KEY) || '';

export type MissingConfigKey = 'SUPABASE_URL' | 'SUPABASE_ANON_KEY';

export function getMissingPublicConfig(
  url: string = SUPABASE_URL,
  anonKey: string = SUPABASE_ANON_KEY,
): MissingConfigKey[] {
  const missing: MissingConfigKey[] = [];
  if (!url.trim()) {
    missing.push('SUPABASE_URL');
  }
  if (!anonKey.trim()) {
    missing.push('SUPABASE_ANON_KEY');
  }
  return missing;
}

export function isPublicConfigReady(
  url: string = SUPABASE_URL,
  anonKey: string = SUPABASE_ANON_KEY,
): boolean {
  return getMissingPublicConfig(url, anonKey).length === 0;
}
