export type WeatherKind = 'clear' | 'haze' | 'drizzle' | 'storm-approach' | 'snow';
export interface WeatherClimate { temperature: number; moisture: number; snowAllowed?: boolean }
export interface WeatherState {
  kind: WeatherKind; coverage: number; density: number; wetness: number;
  windStrength: number; fogMultiplier: number; keyLightMultiplier: number;
  precipitation: number; transition: number;
}
const PROFILE: Record<WeatherKind, Omit<WeatherState, 'kind' | 'transition'>> = {
  clear: { coverage: 0.18, density: 0.12, wetness: 0, windStrength: 0.32, fogMultiplier: 1, keyLightMultiplier: 1, precipitation: 0 },
  haze: { coverage: 0.42, density: 0.22, wetness: 0.05, windStrength: 0.24, fogMultiplier: 1.24, keyLightMultiplier: 0.88, precipitation: 0 },
  drizzle: { coverage: 0.70, density: 0.48, wetness: 0.55, windStrength: 0.50, fogMultiplier: 1.35, keyLightMultiplier: 0.78, precipitation: 0.32 },
  'storm-approach': { coverage: 0.88, density: 0.62, wetness: 0.30, windStrength: 0.90, fogMultiplier: 1.65, keyLightMultiplier: 0.62, precipitation: 0.08 },
  snow: { coverage: 0.82, density: 0.58, wetness: 0.20, windStrength: 0.62, fogMultiplier: 1.52, keyLightMultiplier: 0.76, precipitation: 0.52 },
};

function hash32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function roll(regionId: string, day: number, bucket: number): number {
  return hash32(regionId + ':' + day + ':' + bucket) / 0xffffffff;
}
function choose(regionId: string, day: number, bucket: number, climate: WeatherClimate): WeatherKind {
  const value = roll(regionId, day, bucket);
  if ((climate.snowAllowed ?? true) && climate.temperature < 0.28 && value > 0.79) return 'snow';
  if (climate.moisture > 0.7 && value > 0.86) return 'storm-approach';
  if (climate.moisture > 0.42 && value > 0.76) return 'drizzle';
  if (value > 0.68) return 'haze';
  return 'clear';
}
function smooth(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Deterministic three-world-hour weather selection with a 20-world-minute blend. */
export function weatherFor(regionId: string, worldDay: number, hour: number, climate: WeatherClimate): WeatherState {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const bucket = Math.floor(normalizedHour / 3);
  const minuteWithin = (normalizedHour - bucket * 3) * 60;
  const nextBucket = (bucket + 1) % 8;
  const nextDay = bucket === 7 ? worldDay + 1 : worldDay;
  const aKind = choose(regionId, worldDay, bucket, climate);
  const bKind = choose(regionId, nextDay, nextBucket, climate);
  const transition = smooth((minuteWithin - 160) / 20);
  const a = PROFILE[aKind], b = PROFILE[bKind];
  return {
    kind: transition < 0.5 ? aKind : bKind,
    coverage: mix(a.coverage, b.coverage, transition),
    density: mix(a.density, b.density, transition),
    wetness: mix(a.wetness, b.wetness, transition),
    windStrength: mix(a.windStrength, b.windStrength, transition),
    fogMultiplier: mix(a.fogMultiplier, b.fogMultiplier, transition),
    keyLightMultiplier: mix(a.keyLightMultiplier, b.keyLightMultiplier, transition),
    precipitation: mix(a.precipitation, b.precipitation, transition),
    transition,
  };
}

export function weatherVisibilityMeters(baseVisibility: number, fogMultiplier: number): number {
  return Math.max(150, baseVisibility / Math.max(0.1, fogMultiplier));
}

export class WeatherController {
  readonly state: WeatherState = {
    kind: 'clear', coverage: 0.18, density: 0.12, wetness: 0,
    windStrength: 0.32, fogMultiplier: 1, keyLightMultiplier: 1,
    precipitation: 0, transition: 0,
  };
  private lastMinute = -1;
  private override: WeatherKind | null = null;

  setWeather(kind: WeatherKind | null): void { this.override = kind; this.lastMinute = -1; }

  update(regionId: string, worldMinute: number, climate: WeatherClimate): WeatherState {
    const minute = Math.floor(worldMinute);
    if (minute === this.lastMinute) return this.state;
    this.lastMinute = minute;
    const hour = ((worldMinute / 60) % 24 + 24) % 24;
    const day = Math.floor(worldMinute / 1440);
    const next = this.override
      ? { kind: this.override, ...PROFILE[this.override], transition: 1 }
      : weatherFor(regionId, day, hour, climate);
    this.state.kind = next.kind;
    this.state.coverage = next.coverage;
    this.state.density = next.density;
    this.state.wetness = next.wetness;
    this.state.windStrength = next.windStrength;
    this.state.fogMultiplier = next.fogMultiplier;
    this.state.keyLightMultiplier = next.keyLightMultiplier;
    this.state.precipitation = next.precipitation;
    this.state.transition = next.transition;
    return this.state;
  }
}
