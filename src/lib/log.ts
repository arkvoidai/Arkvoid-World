export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  isProduction?: boolean;
  sink?: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export interface Logger {
  debug: (message: string, ...meta: unknown[]) => void;
  info: (message: string, ...meta: unknown[]) => void;
  warn: (message: string, ...meta: unknown[]) => void;
  error: (message: string, ...meta: unknown[]) => void;
}

function resolveIsProduction(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return Boolean(import.meta.env.PROD);
    }
  } catch {
    // Fallback for non-Vite runtime environments
  }
  return process.env.NODE_ENV === 'production';
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const isProd = options.isProduction ?? resolveIsProduction();
  const sink = options.sink ?? console;

  return {
    debug(message: string, ...meta: unknown[]): void {
      if (!isProd) {
        sink.debug(`[debug] ${message}`, ...meta);
      }
    },
    info(message: string, ...meta: unknown[]): void {
      if (!isProd) {
        sink.info(`[info] ${message}`, ...meta);
      }
    },
    warn(message: string, ...meta: unknown[]): void {
      if (!isProd) {
        sink.warn(`[warn] ${message}`, ...meta);
      }
    },
    error(message: string, ...meta: unknown[]): void {
      sink.error(`[error] ${message}`, ...meta);
    },
  };
}

export const log: Logger = createLogger();
