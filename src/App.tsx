import { Suspense, lazy } from 'react';
import { getMissingPublicConfig } from '@/config/public';
import { SetupScreen } from '@/screens/SetupScreen';
import { Logo } from '@/ui/Logo';

const WorldHost = lazy(() => import('@/app/WorldHost'));

const DesignKitScreen =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_KIT === '1'
    ? lazy(() => import('@/screens/DesignKitScreen'))
    : null;

function PearlBootScreen() {
  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-pearl">
      <Logo size={42} />
    </main>
  );
}

export default function App() {
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;

  const showKit = Boolean(params?.get('kit') === '1' && DesignKitScreen);
  if (showKit && DesignKitScreen) {
    return (
      <Suspense fallback={<PearlBootScreen />}>
        <DesignKitScreen />
      </Suspense>
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

  return (
    <Suspense fallback={<PearlBootScreen />}>
      <WorldHost
        debug={debug}
        probe={probe}
        assets={assets}
        leakTest={leakTest}
        reviewShots={reviewShots}
      />
    </Suspense>
  );
}

