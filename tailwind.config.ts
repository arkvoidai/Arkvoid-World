import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px',
      },
      colors: {
        pearl: '#FBFAF7',
        porcelain: '#F4F1EA',
        mist: '#ECE8F4',
        ink: {
          DEFAULT: '#17141F',
          2: '#4A4658',
          3: '#8A8598',
        },
        line: {
          DEFAULT: 'rgba(23, 20, 31, 0.10)',
          strong: 'rgba(23, 20, 31, 0.18)',
        },
        orange: {
          DEFAULT: '#FF7A1A',
          soft: '#FFB27A',
          glow: 'rgba(255, 122, 26, 0.30)',
        },
        purple: {
          DEFAULT: '#7C5CFF',
          glow: 'rgba(124, 92, 255, 0.28)',
        },
        lavender: '#B9A6FF',
        gold: '#D8A24A',
        danger: '#C8553D',
        surface: 'rgba(255, 255, 255, 0.92)',
        muted: '#8A8598',
      },
      borderRadius: {
        field: '14px',
        card: '22px',
        sheet: '28px',
        panel: '28px',
        full: '9999px',
        pill: '9999px',
      },
      boxShadow: {
        'violet-soft':
          '0 1px 2px rgba(60, 40, 120, 0.04), 0 4px 12px rgba(60, 40, 120, 0.06), 0 12px 32px rgba(60, 40, 120, 0.07)',
        'violet-layered':
          '0 1px 2px rgba(60, 40, 120, 0.06), 0 8px 24px rgba(60, 40, 120, 0.08), 0 24px 64px rgba(60, 40, 120, 0.10)',
        'orange-light':
          '0 1px 2px rgba(60, 40, 120, 0.05), 0 8px 24px rgba(255, 122, 26, 0.30), 0 20px 48px rgba(124, 92, 255, 0.16)',
        glass:
          '0 1px 2px rgba(60, 40, 120, 0.04), 0 8px 24px rgba(60, 40, 120, 0.08), 0 20px 48px rgba(60, 40, 120, 0.06)',
      },
      backdropBlur: {
        glass: '20px',
      },
      backgroundImage: {
        aurora:
          'linear-gradient(135deg, #FF8A3D 0%, #FFB27A 28%, #C9B8FF 68%, #7C5CFF 100%)',
      },
      fontFamily: {
        sans: [
          "'Geist Variable'",
          "'Geist Fallback'",
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          "'Geist Mono Variable'",
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
        serif: [
          "'Instrument Serif'",
          "'Instrument Serif Fallback'",
          'Georgia',
          'serif',
        ],
      },
      fontSize: {
        display: [
          'clamp(2.5rem, 5vw + 1rem, 4.5rem)',
          { lineHeight: '1.08', letterSpacing: '-0.02em', fontWeight: '500' },
        ],
        title: [
          'clamp(1.5rem, 2.2vw + 0.8rem, 2.125rem)',
          { lineHeight: '1.18', letterSpacing: '-0.02em', fontWeight: '500' },
        ],
        heading: [
          'clamp(1.125rem, 1vw + 0.85rem, 1.3125rem)',
          { lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: '500' },
        ],
        body: ['1rem', { lineHeight: '1.5', fontWeight: '400' }],
        label: [
          'clamp(0.6875rem, 0.25vw + 0.625rem, 0.75rem)',
          { lineHeight: '1.35', letterSpacing: '0.14em', fontWeight: '500' },
        ],
      },
      zIndex: {
        world: '0',
        hud: '10',
        prompt: '20',
        sheet: '30',
        modal: '40',
        toast: '50',
        system: '60',
      },
    },
  },
  plugins: [],
};

export default config;
