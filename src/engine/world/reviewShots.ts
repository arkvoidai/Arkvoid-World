export interface ReviewShot {
  readonly index: number;
  readonly id: string;
  readonly label: string;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov?: number;
}

export const REVIEW_SHOTS: readonly ReviewShot[] = [
  {
    index: 0,
    id: 'wide-bridge-to-plaza',
    label: '1 · Wide from bridge to plaza',
    position: [37.5, 4.1, -4.8],
    target: [2.5, 2.0, -6.2],
    fov: 52,
  },
  {
    index: 1,
    id: 'plaza-pavilion-close',
    label: '2 · Plaza close-up with pavilion',
    position: [-2.5, 2.3, 4.8],
    target: [9.5, 2.5, -6.0],
    fov: 48,
  },
  {
    index: 2,
    id: 'pavilion-roof-lanterns',
    label: '3 · Pavilion roof detail with lanterns',
    position: [5.2, 3.4, -0.2],
    target: [10.2, 4.1, -4.4],
    fov: 44,
  },
  {
    index: 3,
    id: 'gate-veil-head-on',
    label: '4 · Gate veil head-on',
    position: [0.0, 2.2, -12.2],
    target: [0.0, 2.8, -21.5],
    fov: 48,
  },
  {
    index: 4,
    id: 'breath-pool-motes',
    label: '5 · Breath pool close with motes',
    position: [-4.8, 1.85, 0.2],
    target: [-9.2, 0.9, -4.2],
    fov: 46,
  },
  {
    index: 5,
    id: 'lantern-path-low',
    label: '6 · Lantern path low angle',
    position: [8.8, 0.95, 12.2],
    target: [2.5, 2.2, -14.0],
    fov: 50,
  },
  {
    index: 6,
    id: 'cloud-sea-island-edge',
    label: '7 · Sea of clouds with island edge',
    position: [-28.5, -1.2, 16.5],
    target: [14.0, -4.5, -18.0],
    fov: 54,
  },
  {
    index: 7,
    id: 'island-underside-up',
    label: '8 · Island underside looking up',
    position: [-19.5, -16.5, 19.5],
    target: [0.0, -7.5, 0.0],
    fov: 54,
  },
  {
    index: 8,
    id: 'bridge-hero-golden',
    label: '9 · Golden-hour arched bridge hero shot',
    position: [46.0, 3.4, -18.0],
    target: [22.0, 0.8, -24.0],
    fov: 46,
  },
  {
    index: 9,
    id: 'low-cloud-sea-horizon',
    label: '10 · Low cloud-sea with glowing horizon layers',
    position: [10.0, -18.0, 32.0],
    target: [0.0, -16.0, -50.0],
    fov: 56,
  },
] as const;
