import { BUILT_AREAS, WORLD_ATLAS, regionBounds } from './Atlas';
import { TRAVEL_EDGES } from './TravelGraph';
import { cellKey, ringForDistance } from '@/engine/world/streaming/Cells';
import { sampleVeiledPeaksHeight } from '@/engine/world/terrain/MountainHeight';
import { sampleAtmosphere } from '@/engine/world/sky/AtmosphereModel';
import type { WeatherState } from '@/engine/world/sky/Weather';
import { riverWetness, waterfallLod } from '@/engine/world/water/WaterSurfaceModel';

interface InspectorFlags {
  atlas: boolean;
  stream: boolean;
  terrain: boolean;
  sky: boolean;
  water: boolean;
}

function readFlags(): InspectorFlags | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const flags = {
    atlas: params.get('atlas') === '1',
    stream: params.get('stream') === '1',
    terrain: params.get('terrain') === '1',
    sky: params.get('sky') === '1',
    water: params.get('water') === '1',
  };
  return Object.values(flags).some(Boolean) ? flags : null;
}

/** Plain dev-only inspectors; never mounted in production builds. */
export class WorldExpansionInspector {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly canvasContext: CanvasRenderingContext2D | null;
  private readonly cursor: HTMLSpanElement;
  private readonly flags: InspectorFlags;
  private lastDraw = 0;
  private playerX = 0;
  private playerZ = 0;
  private readonly onPointerMove: (event: PointerEvent) => void;

  static create(): WorldExpansionInspector | null {
    const flags = readFlags();
    return flags ? new WorldExpansionInspector(flags) : null;
  }

  private constructor(flags: InspectorFlags) {
    this.flags = flags;
    this.root = document.createElement('div');
    this.root.setAttribute('aria-label', 'World expansion developer inspector');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      zIndex: '9999',
      width: 'min(390px, calc(100vw - 24px))',
      maxHeight: '48vh',
      overflow: 'auto',
      padding: '10px',
      color: '#222',
      background: 'rgba(250,250,248,0.94)',
      border: '1px solid rgba(0,0,0,0.2)',
      borderRadius: '4px',
      font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
      pointerEvents: 'auto',
      boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
    });

    this.canvas = flags.atlas ? document.createElement('canvas') : null;
    this.canvasContext = this.canvas?.getContext('2d') ?? null;
    if (this.canvas) {
      this.canvas.width = 360;
      this.canvas.height = 230;
      this.canvas.style.width = '100%';
      this.canvas.style.height = 'auto';
      this.canvas.style.display = 'block';
      this.root.appendChild(this.canvas);
    }

    this.cursor = document.createElement('span');
    if (this.canvas) {
      this.cursor.textContent = 'cursor: move over the map';
      this.root.appendChild(this.cursor);
      this.onPointerMove = (event: PointerEvent) => {
        const rect = this.canvas!.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 90000 - 45000;
        const z = 45000 - ((event.clientY - rect.top) / rect.height) * 90000;
        this.cursor.textContent = '  cursor: x ' + x.toFixed(1) + ' m, z ' + z.toFixed(1) + ' m';
      };
      this.canvas.addEventListener('pointermove', this.onPointerMove);
    } else {
      this.onPointerMove = () => undefined;
    }

    this.text = document.createElement('pre');
    this.text.style.margin = '8px 0 0';
    this.text.style.whiteSpace = 'pre-wrap';
    this.root.appendChild(this.text);
    document.body.appendChild(this.root);
  }

  update(x: number, y: number, z: number, hour: number, weather: WeatherState): void {
    this.playerX = x;
    this.playerZ = z;
    const now = performance.now();
    if (now - this.lastDraw < 250) return;
    this.lastDraw = now;
    if (this.canvasContext && this.canvas) this.drawAtlas();

    const lines: string[] = [];
    if (this.flags.stream) {
      const key = cellKey(x, z);
      const distance = Math.hypot(x, z);
      lines.push('CELL GRID', 'cell=' + key.ix + ':' + key.iz + ' ring=' + ringForDistance(distance));
      lines.push('generation jobs=' + 'fallback only; 0 queued', 'origin offset=0 until coordinated rebase');
    }
    if (this.flags.terrain) {
      lines.push('TERRAIN PROBE', 'world=(' + x.toFixed(1) + ', ' + y.toFixed(1) + ', ' + z.toFixed(1) + ')');
      lines.push('veiled-peaks sample=' + sampleVeiledPeaksHeight(x, z).toFixed(1) + ' m');
    }
    if (this.flags.sky) {
      const atmosphere = sampleAtmosphere(10000, y, 2);
      lines.push('SKY / WEATHER', 'hour=' + hour.toFixed(2) + ' weather=' + weather.kind);
      lines.push('coverage=' + weather.coverage.toFixed(2) + ' wetness=' + weather.wetness.toFixed(2));
      lines.push('10 km transmittance=' + atmosphere.transmittance.toFixed(3));
    }
    if (this.flags.water) {
      lines.push('WATER MODELS', 'shore wetness at 1 m=' + riverWetness(1).toFixed(2));
      lines.push('waterfall LOD at 500 m=' + waterfallLod(500));
    }
    this.text.textContent = lines.join('\n');
  }

  private drawAtlas(): void {
    const ctx = this.canvasContext!;
    const canvas = this.canvas!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f8f7f3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const mapX = (x: number) => (x + 45000) / 90000 * canvas.width;
    const mapY = (z: number) => (45000 - z) / 90000 * canvas.height;

    for (const region of WORLD_ATLAS) {
      const bounds = regionBounds(region);
      ctx.setLineDash(region.status === 'planned' ? [5, 4] : []);
      ctx.strokeStyle = region.status === 'built' ? '#343434' : '#8d8d8d';
      ctx.lineWidth = region.status === 'built' ? 2 : 1;
      ctx.strokeRect(mapX(bounds.minX), mapY(bounds.maxZ),
        mapX(bounds.maxX) - mapX(bounds.minX), mapY(bounds.minZ) - mapY(bounds.maxZ));
      ctx.fillStyle = '#555';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(region.id, mapX(bounds.minX) + 3, mapY(bounds.maxZ) + 11);
    }

    for (const edge of TRAVEL_EDGES) {
      ctx.setLineDash(edge.status === 'planned' ? [3, 4] : []);
      ctx.strokeStyle = '#777';
      ctx.beginPath();
      ctx.moveTo(mapX(edge.start.x), mapY(edge.start.z));
      ctx.lineTo(mapX(edge.end.x), mapY(edge.end.z));
      ctx.stroke();
    }

    for (const area of BUILT_AREAS) {
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(mapX(area.spawn.x), mapY(area.spawn.z), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = '#c45b23';
    ctx.beginPath();
    ctx.arc(mapX(this.playerX), mapY(this.playerZ), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c45b23';
    ctx.stroke();
  }

  dispose(): void {
    if (this.canvas) this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.root.remove();
  }
}
