import { TURNSTILE_SITE_KEY } from '@/config/public';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: (err: unknown) => void;
          action?: string;
          size?: 'normal' | 'flexible' | 'compact' | 'invisible';
        },
      ) => string;
      reset: (widgetId: string) => void;
      execute: (container?: string | HTMLElement, options?: Record<string, unknown>) => void;
    };
  }
}

let turnstileScriptLoaded = false;
let turnstileLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (turnstileScriptLoaded && window.turnstile) {
    return Promise.resolve();
  }
  if (turnstileLoadPromise) {
    return turnstileLoadPromise;
  }
  turnstileLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      turnstileScriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Turnstile anti-bot script'));
    };
    document.head.appendChild(script);
  });
  return turnstileLoadPromise;
}

/**
 * Returns a Turnstile anti-bot token if a site key is configured, or undefined if off.
 */
export async function getCaptchaToken(action = 'auth'): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY.trim()) {
    return undefined;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    await loadTurnstileScript();
    if (!window.turnstile) {
      return undefined;
    }

    return await new Promise<string>((resolve, reject) => {
      const container = document.createElement('div');
      container.style.display = 'none';
      document.body.appendChild(container);

      const timer = window.setTimeout(() => {
        container.remove();
        reject(new Error('Turnstile token request timed out'));
      }, 7000);

      try {
        window.turnstile?.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          size: 'invisible',
          callback: (token) => {
            window.clearTimeout(timer);
            container.remove();
            resolve(token);
          },
          'error-callback': (err) => {
            window.clearTimeout(timer);
            container.remove();
            reject(err);
          },
        });
      } catch (err) {
        window.clearTimeout(timer);
        container.remove();
        reject(err);
      }
    });
  } catch (err) {
    console.warn('Captcha token acquisition bypassed or failed:', err);
    return undefined;
  }
}
