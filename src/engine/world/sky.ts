import * as THREE from 'three';

export interface SkyKeySpec {
  hour: number;
  name: 'DAWN' | 'MORNING' | 'NOON' | 'GOLDEN' | 'DUSK' | 'LATE_DUSK' | 'NIGHT';
  sunElevation: number; // degrees
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  key: string;
  keyIntensity: number;
  fill: string;
  fillIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  exposure: number;
  stars: number;
}

/**
 * Arkvoid Time-of-Day Table v2 (7 key phases across the 24-hour cycle)
 */
export const SKY_KEYS_V2: readonly SkyKeySpec[] = [
  {
    hour: 2.0,
    name: 'NIGHT',
    sunElevation: -44, // Moon is at +44°
    turbidity: 2.0,
    rayleigh: 0.5,
    mie: 0.002,
    mieG: 0.90,
    key: '#9AB8E0',
    keyIntensity: 0.45,
    fill: '#241D3B',
    fillIntensity: 0.25,
    hemiSky: '#18152B',
    hemiGround: '#0D0A17',
    hemiIntensity: 0.20,
    fog: '#161226',
    fogNear: 30,
    fogFar: 300,
    exposure: 1.05,
    stars: 1.0,
  },
  {
    hour: 6.5,
    name: 'DAWN',
    sunElevation: 4.0,
    turbidity: 4.0,
    rayleigh: 3.0,
    mie: 0.015,
    mieG: 0.82,
    key: '#FF8A3D',
    keyIntensity: 2.2,
    fill: '#4A3A7C',
    fillIntensity: 0.55,
    hemiSky: '#FF9E66',
    hemiGround: '#302040',
    hemiIntensity: 0.40,
    fog: '#B07888',
    fogNear: 40,
    fogFar: 380,
    exposure: 0.95,
    stars: 0.05,
  },
  {
    hour: 9.5,
    name: 'MORNING',
    sunElevation: 28.0,
    turbidity: 2.5,
    rayleigh: 1.2,
    mie: 0.005,
    mieG: 0.88,
    key: '#FFF1DB',
    keyIntensity: 2.6,
    fill: '#50658A',
    fillIntensity: 0.50,
    hemiSky: '#8EB2E0',
    hemiGround: '#444038',
    hemiIntensity: 0.60,
    fog: '#AFC4DD',
    fogNear: 70,
    fogFar: 550,
    exposure: 0.90,
    stars: 0.0,
  },
  {
    hour: 12.0,
    name: 'NOON',
    sunElevation: 62.0,
    turbidity: 2.0,
    rayleigh: 0.8,
    mie: 0.003,
    mieG: 0.90,
    key: '#FFF9F0',
    keyIntensity: 2.8,
    fill: '#6A8AB5',
    fillIntensity: 0.55,
    hemiSky: '#A8C8F0',
    hemiGround: '#4A463E',
    hemiIntensity: 0.65,
    fog: '#BCD0E8',
    fogNear: 90,
    fogFar: 700,
    exposure: 0.85,
    stars: 0.0,
  },
  {
    hour: 16.5,
    name: 'GOLDEN', // THE HERO HOUR
    sunElevation: 14.0,
    turbidity: 3.5,
    rayleigh: 2.2,
    mie: 0.012,
    mieG: 0.84,
    key: '#FFAE42',
    keyIntensity: 2.9,
    fill: '#432E6A',
    fillIntensity: 0.60,
    hemiSky: '#E89A6A',
    hemiGround: '#2E2038',
    hemiIntensity: 0.48,
    fog: '#C48278',
    fogNear: 45,
    fogFar: 420,
    exposure: 0.92,
    stars: 0.0,
  },
  {
    hour: 18.3,
    name: 'DUSK',
    sunElevation: 1.0,
    turbidity: 5.0,
    rayleigh: 4.0,
    mie: 0.022,
    mieG: 0.80,
    key: '#F25C2B',
    keyIntensity: 1.8,
    fill: '#36225E',
    fillIntensity: 0.55,
    hemiSky: '#9A5080',
    hemiGround: '#1C122C',
    hemiIntensity: 0.38,
    fog: '#6E3B68',
    fogNear: 35,
    fogFar: 320,
    exposure: 0.88,
    stars: 0.15,
  },
  {
    hour: 19.8,
    name: 'LATE_DUSK',
    sunElevation: -8.0,
    turbidity: 6.0,
    rayleigh: 5.0,
    mie: 0.030,
    mieG: 0.78,
    key: '#7A2832',
    keyIntensity: 0.40,
    fill: '#1E1A3D',
    fillIntensity: 0.40,
    hemiSky: '#362450',
    hemiGround: '#120C20',
    hemiIntensity: 0.28,
    fog: '#2C1D40',
    fogNear: 25,
    fogFar: 260,
    exposure: 0.95,
    stars: 0.65,
  },
  {
    hour: 23.0,
    name: 'NIGHT',
    sunElevation: -44, // Moon is at +44°
    turbidity: 2.0,
    rayleigh: 0.5,
    mie: 0.002,
    mieG: 0.90,
    key: '#9AB8E0',
    keyIntensity: 0.45,
    fill: '#241D3B',
    fillIntensity: 0.25,
    hemiSky: '#18152B',
    hemiGround: '#0D0A17',
    hemiIntensity: 0.20,
    fog: '#161226',
    fogNear: 30,
    fogFar: 300,
    exposure: 1.05,
    stars: 1.0,
  },
  {
    hour: 26.0, // Wrap anchor at 26.0 (2.0 + 24)
    name: 'NIGHT',
    sunElevation: -44,
    turbidity: 2.0,
    rayleigh: 0.5,
    mie: 0.002,
    mieG: 0.90,
    key: '#9AB8E0',
    keyIntensity: 0.45,
    fill: '#241D3B',
    fillIntensity: 0.25,
    hemiSky: '#18152B',
    hemiGround: '#0D0A17',
    hemiIntensity: 0.20,
    fog: '#161226',
    fogNear: 30,
    fogFar: 300,
    exposure: 1.05,
    stars: 1.0,
  },
] as const;

interface ParsedSkyKeyV2 {
  hour: number;
  sunElevation: number;
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  key: THREE.Color;
  keyIntensity: number;
  fill: THREE.Color;
  fillIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  exposure: number;
  stars: number;
}

const PARSED_KEYS_V2: ParsedSkyKeyV2[] = SKY_KEYS_V2.map((k) => ({
  hour: k.hour,
  sunElevation: k.sunElevation,
  turbidity: k.turbidity,
  rayleigh: k.rayleigh,
  mie: k.mie,
  mieG: k.mieG,
  key: new THREE.Color(k.key),
  keyIntensity: k.keyIntensity,
  fill: new THREE.Color(k.fill),
  fillIntensity: k.fillIntensity,
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
  hemiIntensity: k.hemiIntensity,
  fog: new THREE.Color(k.fog),
  fogNear: k.fogNear,
  fogFar: k.fogFar,
  exposure: k.exposure,
  stars: k.stars,
}));

export interface TimeOfDayState {
  hour: number;
  // Preetham scattering parameters
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  sunElevation: number;
  // Lights
  light: THREE.Color; // alias key
  keyColor: THREE.Color;
  lightIntensity: number; // alias keyIntensity
  keyIntensity: number;
  fillColor: THREE.Color;
  fillIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  // Fog & Exposure
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  fogDensity: number; // computed from fogFar for backwards-compatibility
  exposure: number;
  stars: number;
  // Directions & positions
  sunDirection: THREE.Vector3;
  moonDirection: THREE.Vector3;
  sunPosition: THREE.Vector3;
  keyLightDirection: THREE.Vector3;
  fillLightDirection: THREE.Vector3;
  sunVisibility: number;
  moonVisibility: number;
  // Backward compatibility aliases
  horizon: THREE.Color;
  mid: THREE.Color;
  zenith: THREE.Color;
}

export function createTimeOfDayState(): TimeOfDayState {
  return {
    hour: 6.5,
    turbidity: 4.0,
    rayleigh: 3.0,
    mieCoefficient: 0.015,
    mieDirectionalG: 0.82,
    sunElevation: 4.0,
    light: new THREE.Color('#FF8A3D'),
    keyColor: new THREE.Color('#FF8A3D'),
    lightIntensity: 2.2,
    keyIntensity: 2.2,
    fillColor: new THREE.Color('#4A3A7C'),
    fillIntensity: 0.55,
    hemiSky: new THREE.Color('#FF9E66'),
    hemiGround: new THREE.Color('#302040'),
    hemiIntensity: 0.40,
    fog: new THREE.Color('#B07888'),
    fogNear: 40,
    fogFar: 380,
    fogDensity: 0.005,
    exposure: 0.95,
    stars: 0.05,
    sunDirection: new THREE.Vector3(1, 0.07, -0.35).normalize(),
    moonDirection: new THREE.Vector3(-0.4, 0.55, -0.35).normalize(),
    sunPosition: new THREE.Vector3(1, 0.07, -0.35).normalize().multiplyScalar(400000),
    keyLightDirection: new THREE.Vector3(1, 0.07, -0.35).normalize(),
    fillLightDirection: new THREE.Vector3(-1, 0.22, 0.35).normalize(),
    sunVisibility: 1,
    moonVisibility: 0,
    horizon: new THREE.Color('#FF9E66'),
    mid: new THREE.Color('#FFAE85'),
    zenith: new THREE.Color('#4A3A7C'),
  };
}

export function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function smoothstepRange(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  return smoothstep01((x - edge0) / (edge1 - edge0));
}

function lerpLinearColor(
  out: THREE.Color,
  a: THREE.Color,
  b: THREE.Color,
  t: number,
): void {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
}

export function timeOfDayState(
  hour: number,
  target: TimeOfDayState = createTimeOfDayState(),
): TimeOfDayState {
  const hRaw = ((hour % 24) + 24) % 24;
  target.hour = hRaw;

  // Remap hour into [2.0, 26.0] to cleanly align with PARSED_KEYS_V2
  const h = hRaw < 2.0 ? hRaw + 24.0 : hRaw;

  let k0 = PARSED_KEYS_V2[0]!;
  let k1 = PARSED_KEYS_V2[PARSED_KEYS_V2.length - 1]!;

  for (let i = 0; i < PARSED_KEYS_V2.length - 1; i++) {
    const a = PARSED_KEYS_V2[i]!;
    const b = PARSED_KEYS_V2[i + 1]!;
    if (h >= a.hour && h <= b.hour) {
      k0 = a;
      k1 = b;
      break;
    }
  }

  const span = Math.max(0.0001, k1.hour - k0.hour);
  const s = smoothstep01((h - k0.hour) / span);

  // Preetham Scattering parameters
  target.turbidity = k0.turbidity + (k1.turbidity - k0.turbidity) * s;
  target.rayleigh = k0.rayleigh + (k1.rayleigh - k0.rayleigh) * s;
  target.mieCoefficient = k0.mie + (k1.mie - k0.mie) * s;
  target.mieDirectionalG = k0.mieG + (k1.mieG - k0.mieG) * s;
  target.sunElevation = k0.sunElevation + (k1.sunElevation - k0.sunElevation) * s;

  // Key & Fill Lights
  lerpLinearColor(target.keyColor, k0.key, k1.key, s);
  target.light.copy(target.keyColor);
  target.keyIntensity = k0.keyIntensity + (k1.keyIntensity - k0.keyIntensity) * s;
  target.lightIntensity = target.keyIntensity;

  lerpLinearColor(target.fillColor, k0.fill, k1.fill, s);
  target.fillIntensity =
    k0.fillIntensity + (k1.fillIntensity - k0.fillIntensity) * s;

  // Hemisphere Light
  lerpLinearColor(target.hemiSky, k0.hemiSky, k1.hemiSky, s);
  lerpLinearColor(target.hemiGround, k0.hemiGround, k1.hemiGround, s);
  target.hemiIntensity =
    k0.hemiIntensity + (k1.hemiIntensity - k0.hemiIntensity) * s;

  // Fog & Exposure
  lerpLinearColor(target.fog, k0.fog, k1.fog, s);
  target.fogNear = k0.fogNear + (k1.fogNear - k0.fogNear) * s;
  target.fogFar = k0.fogFar + (k1.fogFar - k0.fogFar) * s;
  // Approximate density for any legacy FogExp2 checks
  target.fogDensity = 1.8 / Math.max(50, target.fogFar);

  target.exposure = k0.exposure + (k1.exposure - k0.exposure) * s;
  target.stars = k0.stars + (k1.stars - k0.stars) * s;

  // Horizon/mid/zenith backward compatibility aliases
  target.horizon.copy(target.hemiSky);
  target.mid.copy(target.hemiSky).lerp(target.fillColor, 0.4);
  target.zenith.copy(target.fillColor);

  // Sun and Moon paths
  // Azimuth traverses from east (+X) to west (-X) across day hours 6 to 18
  const sunAzimuth = ((hRaw - 6) / 12) * Math.PI;
  const elevRad = THREE.MathUtils.degToRad(target.sunElevation);
  const cosElev = Math.cos(elevRad);
  const sinElev = Math.sin(elevRad);

  target.sunDirection
    .set(
      Math.cos(sunAzimuth) * cosElev,
      sinElev,
      -Math.sin(sunAzimuth) * cosElev * 0.45 - 0.25 * cosElev,
    )
    .normalize();

  target.sunPosition.copy(target.sunDirection).multiplyScalar(400000);

  // Fill Light: opposite azimuth, low elevation, no shadows, simulating sky bounce
  target.fillLightDirection
    .set(-target.sunDirection.x, 0.22, -target.sunDirection.z)
    .normalize();

  // Moon path: serene arc across the upper night sky
  const nightHoursSince18 = ((hRaw - 17 + 24) % 24) - 1;
  const nightProgress = nightHoursSince18 / 12;
  const moonArc = Math.min(1, Math.max(0, nightProgress)) * Math.PI;
  target.moonDirection
    .set(
      -Math.cos(moonArc) * 0.85,
      0.22 + Math.sin(moonArc) * 0.56,
      -0.35,
    )
    .normalize();

  // Sun vs Moon weight
  let sunWeight: number;
  if (hRaw >= 5.5 && hRaw <= 6.5) {
    sunWeight = smoothstepRange(5.5, 6.5, hRaw);
  } else if (hRaw > 6.5 && hRaw < 18.5) {
    sunWeight = 1;
  } else if (hRaw >= 18.5 && hRaw <= 19.5) {
    sunWeight = 1 - smoothstepRange(18.5, 19.5, hRaw);
  } else {
    sunWeight = 0;
  }

  target.sunVisibility = sunWeight;
  target.moonVisibility = 1 - sunWeight;

  // Key light direction: sun during day, moon during night, smooth blend
  const keyX =
    target.moonDirection.x +
    (target.sunDirection.x - target.moonDirection.x) * sunWeight;
  const rawKeyY =
    target.moonDirection.y +
    (target.sunDirection.y - target.moonDirection.y) * sunWeight;
  const keyY = Math.max(0.08, rawKeyY);
  const keyZ =
    target.moonDirection.z +
    (target.sunDirection.z - target.moonDirection.z) * sunWeight;
  target.keyLightDirection.set(keyX, keyY, keyZ).normalize();

  return target;
}
