export const COLORS = {
  pearl: '#FBFAF7',
  porcelain: '#F4F1EA',
  mist: '#ECE8F4',
  ink: '#17141F',
  ink2: '#4A4658',
  ink3: '#8A8598',
  line: 'rgba(23, 20, 31, 0.10)',
  lineStrong: 'rgba(23, 20, 31, 0.18)',
  orange: '#FF7A1A',
  orangeSoft: '#FFB27A',
  orangeGlow: 'rgba(255, 122, 26, 0.30)',
  purple: '#7C5CFF',
  lavender: '#B9A6FF',
  purpleGlow: 'rgba(124, 92, 255, 0.28)',
  gold: '#D8A24A',
  danger: '#C8553D',
} as const;

export const GRADIENTS = {
  aurora:
    'linear-gradient(135deg, #FF8A3D 0%, #FFB27A 28%, #C9B8FF 68%, #7C5CFF 100%)',
} as const;

export const SPACING = {
  4: '4px',
  8: '8px',
  12: '12px',
  16: '16px',
  20: '20px',
  24: '24px',
  32: '32px',
  48: '48px',
  64: '64px',
} as const;

export const RADII = {
  field: '14px',
  card: '22px',
  sheet: '28px',
  panel: '28px',
  full: '9999px',
} as const;

export const SHADOWS = {
  violetSoft:
    '0 1px 2px rgba(60, 40, 120, 0.04), 0 4px 12px rgba(60, 40, 120, 0.06), 0 12px 32px rgba(60, 40, 120, 0.07)',
  violetLayered:
    '0 1px 2px rgba(60, 40, 120, 0.06), 0 8px 24px rgba(60, 40, 120, 0.08), 0 24px 64px rgba(60, 40, 120, 0.10)',
  orangeLight:
    '0 1px 2px rgba(60, 40, 120, 0.05), 0 8px 24px rgba(255, 122, 26, 0.30), 0 20px 48px rgba(124, 92, 255, 0.16)',
} as const;

export const Z_INDEX = {
  world: 0,
  hud: 10,
  prompt: 20,
  sheet: 30,
  modal: 40,
  toast: 50,
  system: 60,
} as const;

export const TYPOGRAPHY = {
  fontSans:
    "'Geist Variable', 'Geist Fallback', -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono: "'Geist Mono Variable', ui-monospace, SFMono-Regular, monospace",
  fontSerif: "'Instrument Serif', 'Instrument Serif Fallback', Georgia, serif",
  scale: {
    display: 'clamp(2.5rem, 5vw + 1rem, 4.5rem)',
    title: 'clamp(1.5rem, 2.2vw + 0.8rem, 2.125rem)',
    heading: 'clamp(1.125rem, 1vw + 0.85rem, 1.3125rem)',
    body: '1rem',
    label: 'clamp(0.6875rem, 0.25vw + 0.625rem, 0.75rem)',
  },
} as const;

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexToRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}
