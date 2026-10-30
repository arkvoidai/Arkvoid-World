import { Component, Suspense, lazy, useState, type ErrorInfo, type ReactNode } from 'react';
import { getMissingPublicConfig } from '@/config/public';
import { SetupScreen } from '@/screens/SetupScreen';
import { WorldLoadingScreen } from '@/ui/WorldLoadingScreen';
import { AccountSheet } from '@/ui/AccountSheet';
import { Logo } from '@/ui/Logo';
import { useAuthStore } from '@/state/auth';

// Resilient dynamic import that retries on transient network or dev server rebuild glitches
function lazyWithRetry<P extends object>(
  factory: () => Promise<{ default: React.ComponentType<P> }>,
  retries = 3,
  intervalMs = 400,
): React.LazyExoticComponent<React.ComponentType<P>> {
  return lazy(() => {
    return new Promise<{ default: React.ComponentType<P> }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then(resolve)
          .catch((error) => {
            if (remaining <= 0) {
              reject(error);
              return;
            }
            setTimeout(() => attempt(remaining - 1), intervalMs);
          });
      };
      attempt(retries);
    });
  });
}

const WorldHost = lazyWithRetry(() => import('@/app/WorldHost'));

const DesignKitScreen =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_KIT === '1'
    ? lazyWithRetry(() => import('@/screens/DesignKitScreen'))
    : null;

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: unknown): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Arkvoid uncaught error:', error, errorInfo);
  }

  handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="fixed inset-0 flex flex-col items-center justify-center bg-pearl p-6 font-sans text-xs text-ink">
          <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface p-6 text-center shadow-glass backdrop-blur-glass max-w-sm">
            <Logo size={36} />
            <p className="font-serif text-sm text-ink">The world requires a fresh breath.</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-pill border border-orange/40 bg-orange/15 px-4 py-2 font-medium text-ink transition-colors hover:bg-orange/25"
            >
              Re-enter World
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function PearlBootScreen() {
  return <WorldLoadingScreen className="fixed inset-0 z-[80]" />;
}

export default function App() {
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;

  const [accountOpen, setAccountOpen] = useState(() => Boolean(params?.get('account') === '1'));
  const sessionFailedMessage = useAuthStore((s) => s.sessionFailedMessage);

  const showKit = Boolean(params?.get('kit') === '1' && DesignKitScreen);
  if (showKit && DesignKitScreen) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PearlBootScreen />}>
          <DesignKitScreen />
        </Suspense>
      </ErrorBoundary>
    );
  }

  const showSetup =
    Boolean(params?.get('setup') === '1') &&
    getMissingPublicConfig().length > 0;
  if (showSetup) {
    return <SetupScreen />;
  }

  const debug = Boolean(params?.get('debug') === '1');
  const probe = Boolean(params?.get('probe') === '1');
  const assets = Boolean(params?.get('assets') === '1');
  const leakTest = Boolean(params?.get('leak') === '1');
  const reviewShots = Boolean(params?.get('shots') === '1');
  const benchmark = Boolean(params?.get('bench') === '1');
  const audit = Boolean(params?.get('audit') === '1');
  const actors = Boolean(params?.get('actors') === '1');
  const form = params?.get('form') ?? undefined;
  const leaning = params?.get('leaning') ?? undefined;

  return (
    <ErrorBoundary>
      <Suspense fallback={<PearlBootScreen />}>
        <WorldHost
          debug={debug}
          probe={probe}
          assets={assets}
          leakTest={leakTest}
          reviewShots={reviewShots}
          benchmark={benchmark}
          audit={audit}
          actors={actors}
          form={form}
          leaning={leaning}
        />
        <AccountSheet
          open={accountOpen || Boolean(sessionFailedMessage)}
          onClose={() => setAccountOpen(false)}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
