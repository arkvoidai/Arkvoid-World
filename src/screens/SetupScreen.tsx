import { getMissingPublicConfig, type MissingConfigKey } from '@/config/public';
import { ArkvoidMark } from '@/ui/ArkvoidMark';

interface SetupScreenProps {
  missingKeys?: MissingConfigKey[];
}

export function SetupScreen({
  missingKeys = getMissingPublicConfig(),
}: SetupScreenProps) {
  return (
    <main
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{
        backgroundColor: '#FBFAF7',
        backgroundImage:
          'radial-gradient(circle at 46% 48%, rgba(255, 178, 122, 0.18) 0%, rgba(185, 166, 255, 0.14) 38%, rgba(251, 250, 247, 0) 72%)',
        color: '#17141F',
      }}
    >
      <div
        className="flex flex-col items-center gap-5 rounded-3xl px-8 py-7"
        style={{
          backgroundColor: 'rgba(244, 241, 234, 0.78)',
          border: '1px solid rgba(23, 20, 31, 0.10)',
          boxShadow: '0 20px 50px -12px rgba(74, 70, 88, 0.08)',
        }}
      >
        <ArkvoidMark />
        <div className="flex flex-col items-center gap-1.5 text-center">
          {missingKeys.map((key) => (
            <code
              key={key}
              className="text-xs tracking-wide"
              style={{
                fontFamily: "'Geist Mono Variable', monospace",
                color: '#4A4658',
              }}
            >
              {key}
            </code>
          ))}
        </div>
      </div>
    </main>
  );
}
