export interface AtmosphericSample { transmittance: number; inscatter: number; sigma: number }

/** CPU reference model for shader parity. Altitude is relative to the Cloud Ocean reference. */
export function atmosphereSigma(altitudeMeters: number, turbidity = 1): number {
  const altitude = Math.max(-4000, Math.min(9000, altitudeMeters));
  const scaleHeight = altitude < 0 ? 1650 : 8200;
  const base = 0.000085 * Math.max(0.5, turbidity);
  return base * Math.exp(-Math.max(0, altitude) / scaleHeight) *
    (altitude < 0 ? 1 + Math.min(1.8, Math.abs(altitude) / 1800) : 1);
}

export function sampleAtmosphere(distanceMeters: number, altitudeMeters: number, turbidity = 1): AtmosphericSample {
  const distance = Math.max(0, Math.min(80000, distanceMeters));
  const sigma = atmosphereSigma(altitudeMeters, turbidity);
  const transmittance = Math.max(0, Math.min(1, Math.exp(-sigma * distance)));
  return { transmittance, inscatter: 1 - transmittance, sigma };
}

export function mixAerialPerspective(
  scene: readonly [number, number, number],
  sky: readonly [number, number, number],
  sample: AtmosphericSample,
): [number, number, number] {
  const t = sample.transmittance, s = sample.inscatter;
  return [scene[0] * t + sky[0] * s, scene[1] * t + sky[1] * s, scene[2] * t + sky[2] * s];
}
