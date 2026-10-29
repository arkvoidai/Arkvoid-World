import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase, hasSupabase } from '@/net/supabase';
import { mapError, createAppError, type AppError } from '@/net/errors';
import { getCaptchaToken } from '@/net/captcha';
import { deleteMyData as apiDeleteMyData } from '@/net/api';

export type AuthStatus = 'loading' | 'signed-out' | 'guest' | 'member';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  isGuest: boolean;
  error: AppError | null;

  // Rate limiting / cooldown state
  emailCooldownSeconds: number;
  isLockedOut: boolean;
  failedAttempts: number;

  // Recovery message
  sessionFailedMessage: string | null;

  // Actions
  init: () => Promise<void>;
  signInGuest: (captchaToken?: string) => Promise<boolean>;
  sendEmailCode: (email: string, captchaToken?: string) => Promise<boolean>;
  verifyEmailCode: (email: string, token: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  upgradeGuestWithEmail: (email: string) => Promise<boolean>;
  linkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteMyData: () => Promise<boolean>;
  clearError: () => void;
  resetGuestState: () => void;
}

let emailCooldownTimer: ReturnType<typeof setInterval> | null = null;
let lockoutTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

function cleanOAuthUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;

    // Check if OAuth code/tokens exist in URL
    if (url.searchParams.has('code')) {
      url.searchParams.delete('code');
      changed = true;
    }
    if (url.hash.includes('access_token=') || url.hash.includes('error=')) {
      url.hash = '';
      changed = true;
    }

    if (changed) {
      window.history.replaceState(null, '', url.pathname + (url.search ? url.search : ''));
    }
  } catch {
    // Non-critical
  }
}

function clearArkvoidStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('arkvoid.')) {
        keysToRemove.push(key);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Local storage access may be restricted
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  session: null,
  isGuest: false,
  error: null,
  emailCooldownSeconds: 0,
  isLockedOut: false,
  failedAttempts: 0,
  sessionFailedMessage: null,

  clearError: () => set({ error: null }),

  resetGuestState: () => {
    clearArkvoidStorage();
    set({
      status: 'signed-out',
      user: null,
      session: null,
      isGuest: false,
      error: null,
      sessionFailedMessage: null,
    });
  },

  init: async () => {
    if (isInitialized) return;
    isInitialized = true;

    if (!hasSupabase()) {
      set({ status: 'signed-out', user: null, session: null, isGuest: false });
      return;
    }

    try {
      const supabase = getSupabase();

      // Clean OAuth query/hash after initial page arrival
      cleanOAuthUrl();

      // 1. Get initial session
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        set({
          status: 'signed-out',
          user: null,
          session: null,
          isGuest: false,
          error: mapError(error),
        });
      } else if (session?.user) {
        const isGuest = session.user.is_anonymous ?? false;
        set({
          status: isGuest ? 'guest' : 'member',
          user: session.user,
          session,
          isGuest,
          error: null,
        });
      } else {
        set({ status: 'signed-out', user: null, session: null, isGuest: false });
      }

      // 2. Subscribe to auth state changes
      supabase.auth.onAuthStateChange((event, newSession) => {
        cleanOAuthUrl();
        if (newSession?.user) {
          const isGuest = newSession.user.is_anonymous ?? false;
          set({
            status: isGuest ? 'guest' : 'member',
            user: newSession.user,
            session: newSession,
            isGuest,
            error: null,
            sessionFailedMessage: null,
          });
        } else if (event === 'SIGNED_OUT') {
          set({
            status: 'signed-out',
            user: null,
            session: null,
            isGuest: false,
          });
        }
      });

      // 3. Two-tab sync via window storage event
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', async (e) => {
          if (e.key === 'arkvoid.auth') {
            try {
              const { data: { session: syncedSession } } = await supabase.auth.getSession();
              if (syncedSession?.user) {
                const isGuest = syncedSession.user.is_anonymous ?? false;
                set({
                  status: isGuest ? 'guest' : 'member',
                  user: syncedSession.user,
                  session: syncedSession,
                  isGuest,
                });
              } else {
                set({
                  status: 'signed-out',
                  user: null,
                  session: null,
                  isGuest: false,
                });
              }
            } catch {
              // Ignore
            }
          }
        });

        // 4. Token refresh on tab visibility
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible' && hasSupabase()) {
            try {
              const { data: { session: refreshed }, error: refreshErr } =
                await supabase.auth.getSession();

              if (refreshErr || !refreshed) {
                const current = get();
                if (current.isGuest) {
                  // Offer start again as new guest
                  set({
                    status: 'signed-out',
                    user: null,
                    session: null,
                    isGuest: false,
                    sessionFailedMessage:
                      'Your guest session could not be renewed. You can start fresh with a new guest account.',
                  });
                }
              }
            } catch {
              // Ignore background refresh errors
            }
          }
        });
      }
    } catch (e) {
      set({
        status: 'signed-out',
        user: null,
        session: null,
        isGuest: false,
        error: mapError(e),
      });
    }
  },

  signInGuest: async (captchaTokenParam?: string) => {
    if (!hasSupabase()) {
      set({
        error: createAppError(
          'VALIDATION',
          'Supabase is not configured. Add credentials in src/config/public.ts.',
        ),
      });
      return false;
    }

    set({ error: null });
    try {
      const captchaToken = captchaTokenParam || (await getCaptchaToken('guest_signup'));
      const supabase = getSupabase();

      const { data, error } = await supabase.auth.signInAnonymously({
        options: captchaToken ? { captchaToken } : undefined,
      });

      if (error) {
        set({ error: mapError(error) });
        return false;
      }

      if (data.session?.user) {
        set({
          status: 'guest',
          user: data.session.user,
          session: data.session,
          isGuest: true,
          error: null,
          sessionFailedMessage: null,
        });
        return true;
      }
      return false;
    } catch (e) {
      set({ error: mapError(e) });
      return false;
    }
  },

  sendEmailCode: async (email: string, captchaTokenParam?: string) => {
    const state = get();
    if (state.isLockedOut) {
      set({
        error: createAppError('RATE_LIMITED', 'Please wait before requesting another code.'),
      });
      return false;
    }
    if (state.emailCooldownSeconds > 0) {
      set({
        error: createAppError(
          'RATE_LIMITED',
          `Please wait ${state.emailCooldownSeconds} seconds before requesting a new code.`,
        ),
      });
      return false;
    }

    if (!email || !email.includes('@')) {
      set({
        error: createAppError('VALIDATION', 'Please enter a valid email address.'),
      });
      return false;
    }

    if (!hasSupabase()) {
      set({
        error: createAppError('VALIDATION', 'Supabase credentials are not configured.'),
      });
      return false;
    }

    try {
      const captchaToken = captchaTokenParam || (await getCaptchaToken('email_otp'));
      const supabase = getSupabase();

      // If user is currently a guest, use updateUser({ email }) to preserve their user_id
      if (state.isGuest && state.user) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) {
          set({ error: mapError(error) });
          return false;
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            captchaToken,
            shouldCreateUser: true,
          },
        });
        if (error) {
          set({ error: mapError(error) });
          return false;
        }
      }

      // Track attempts: 5 attempts triggers 60s lockout
      const nextAttempts = state.failedAttempts + 1;
      const willLockout = nextAttempts >= 5;

      // Start 30s cooldown
      let cooldown = 30;
      set({
        emailCooldownSeconds: cooldown,
        failedAttempts: willLockout ? 0 : nextAttempts,
        isLockedOut: willLockout,
        error: null,
      });

      if (emailCooldownTimer) clearInterval(emailCooldownTimer);
      emailCooldownTimer = setInterval(() => {
        cooldown--;
        if (cooldown <= 0) {
          if (emailCooldownTimer) clearInterval(emailCooldownTimer);
          set({ emailCooldownSeconds: 0 });
        } else {
          set({ emailCooldownSeconds: cooldown });
        }
      }, 1000);

      if (willLockout) {
        if (lockoutTimer) clearTimeout(lockoutTimer);
        lockoutTimer = setTimeout(() => {
          set({ isLockedOut: false });
        }, 60000);
      }

      return true;
    } catch (e) {
      set({ error: mapError(e) });
      return false;
    }
  },

  verifyEmailCode: async (email: string, token: string) => {
    if (!token || token.trim().length !== 6) {
      set({
        error: createAppError('VALIDATION', 'Please enter the 6-digit code.'),
      });
      return false;
    }

    if (!hasSupabase()) {
      set({
        error: createAppError('VALIDATION', 'Supabase credentials are not configured.'),
      });
      return false;
    }

    set({ error: null });
    try {
      const supabase = getSupabase();
      const state = get();

      // If upgrading an anonymous user
      const otpType = state.isGuest ? 'email_change' : 'email';

      let { data, error } = await supabase.auth.verifyOtp({
        email,
        token: token.trim(),
        type: otpType,
      });

      // If email_change fails, try standard 'email' or 'signup'
      if (error && state.isGuest) {
        const retry1 = await supabase.auth.verifyOtp({
          email,
          token: token.trim(),
          type: 'email',
        });
        if (!retry1.error) {
          data = retry1.data;
          error = null;
        }
      }

      if (error) {
        set({ error: mapError(error) });
        return false;
      }

      if (data.session?.user) {
        set({
          status: 'member',
          user: data.session.user,
          session: data.session,
          isGuest: false,
          error: null,
          failedAttempts: 0,
        });
        return true;
      }
      return false;
    } catch (e) {
      set({ error: mapError(e) });
      return false;
    }
  },

  upgradeGuestWithEmail: async (email: string) => {
    return get().sendEmailCode(email);
  },

  signInWithGoogle: async () => {
    if (!hasSupabase()) {
      set({
        error: createAppError('VALIDATION', 'Supabase credentials are not configured.'),
      });
      return;
    }

    try {
      const supabase = getSupabase();
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });
      if (error) {
        set({ error: mapError(error) });
      }
    } catch (e) {
      set({ error: mapError(e) });
    }
  },

  linkGoogle: async () => {
    if (!hasSupabase()) {
      set({
        error: createAppError('VALIDATION', 'Supabase credentials are not configured.'),
      });
      return;
    }

    try {
      const supabase = getSupabase();
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo,
        },
      });
      if (error) {
        set({ error: mapError(error) });
      }
    } catch (e) {
      set({ error: mapError(e) });
    }
  },

  signOut: async () => {
    if (!hasSupabase()) {
      clearArkvoidStorage();
      set({ status: 'signed-out', user: null, session: null, isGuest: false });
      return;
    }

    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch {
      // Ignore
    } finally {
      clearArkvoidStorage();
      set({
        status: 'signed-out',
        user: null,
        session: null,
        isGuest: false,
        error: null,
      });
    }
  },

  deleteMyData: async () => {
    if (!hasSupabase()) {
      return false;
    }

    set({ error: null });
    try {
      const res = await apiDeleteMyData();
      if (!res.ok) {
        set({ error: res.error });
        return false;
      }

      await get().signOut();
      return true;
    } catch (e) {
      set({ error: mapError(e) });
      return false;
    }
  },
}));
