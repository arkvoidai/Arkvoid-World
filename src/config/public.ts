/**
 * Public Supabase configuration.
 * Both SUPABASE_URL and SUPABASE_ANON_KEY are public by design.
 * Security is enforced through Row Level Security (RLS) policies and Edge Functions.
 */
export const SUPABASE_URL: string = '';
export const SUPABASE_ANON_KEY: string = '';

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
