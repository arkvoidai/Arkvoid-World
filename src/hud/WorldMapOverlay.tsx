export type MapRegionId = 'veiled-peaks' | 'capital-valley' | 'primordial-forest';

const REGIONS: {
  id: MapRegionId;
  name: string;
  subtitle: string;
  description: string;
  locations: string[];
  tone: string;
  symbol: string;
}[] = [
  {
    id: 'veiled-peaks',
    name: 'Veiled Peaks',
    subtitle: 'THE HIGH MOUNTAINS',
    description: 'Snow-cut ridges, cloud bridges and the Cloud-Ring Monastery above a sea of mist.',
    locations: ['Cloud-Ring Monastery', 'Silver Falls', 'Three-Crowned Overlook'],
    tone: 'from-slate-800 to-sky-950',
    symbol: '△',
  },
  {
    id: 'capital-valley',
    name: 'Capital Valley',
    subtitle: 'THE RIVER KINGDOM',
    description: 'A living river capital of tiled roofs, lantern quays, markets and the Imperial Plaza.',
    locations: ['Imperial Plaza', 'Riverfront Quarter', 'Nine-Arch Bridge'],
    tone: 'from-amber-950 to-emerald-950',
    symbol: '⌂',
  },
  {
    id: 'primordial-forest',
    name: 'Primordial Forest',
    subtitle: 'THE ANCIENT GREEN',
    description: 'A deep, old forest shaped around a colossal World Tree and hidden water sanctuaries.',
    locations: ['World Tree Sanctum', 'Moonfall Cascade', 'Root Sanctuary'],
    tone: 'from-emerald-950 to-teal-950',
    symbol: '✳',
  },
];

export default function WorldMapOverlay({
  onClose,
  onTravel,
  currentRegion,
}: {
  onClose: () => void;
  onTravel: (regionId: MapRegionId) => void;
  currentRegion: string;
}) {
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="World atlas"
      className="pointer-events-auto fixed inset-3 z-overlay mx-auto flex max-h-[calc(100%-24px)] max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-white/50 bg-[#f7f5ef]/96 text-[#1d241f] shadow-[0_28px_110px_rgba(7,14,10,0.42)] backdrop-blur-2xl sm:inset-6"
    >
      <header className="flex items-center justify-between border-b border-[#d9d6cc] px-5 py-4 sm:px-7">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#9b8055]">Arkvoid · Atlas</p>
          <h2 className="mt-1 font-serif text-[30px] leading-none sm:text-[36px]">The known world</h2>
          <p className="mt-1.5 text-[11px] text-[#77796f]">4 regions · 13 named destinations · 3 new continents</p>
        </div>
        <button type="button" aria-label="Close world atlas" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-[#d9d6cc] text-xl text-[#666b62] hover:bg-white">×</button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:grid-cols-[0.9fr_1.1fr] sm:gap-5 sm:p-6">
        <div className="flex min-h-[240px] flex-col rounded-[22px] bg-[#e9e8df] p-4 sm:min-h-[430px]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7b7d71]">World routes</span>
            <span className="rounded-full border border-[#c9c9bd] px-2 py-1 text-[9px] uppercase tracking-widest text-[#73766b]">Illustrative</span>
          </div>
          <svg viewBox="0 0 360 360" role="img" aria-label="Schematic map showing Home Reach connected to three distant continents" className="my-auto w-full">
            <defs>
              <radialGradient id="atlas-haze"><stop offset="0%" stopColor="#ffffff" stopOpacity=".72"/><stop offset="100%" stopColor="#ffffff" stopOpacity="0"/></radialGradient>
            </defs>
            <circle cx="180" cy="180" r="160" fill="url(#atlas-haze)"/>
            <g fill="none" stroke="#9da397" strokeWidth="1.5" strokeDasharray="4 6">
              <path d="M180 250 Q110 205 84 126"/>
              <path d="M180 250 Q180 155 180 74"/>
              <path d="M180 250 Q258 205 278 126"/>
            </g>
            <g fill="#c7d1cb" stroke="#71887a" strokeWidth="1.5">
              <path d="M42 112l18-25 22 8 13 23-13 23-29-3z"/>
              <path d="M146 62l20-26 29 8 14 23-13 24-33 2z"/>
              <path d="M264 112l23-20 27 11 9 28-21 18-29-8z"/>
            </g>
            <path d="M135 245l13-22 32-12 31 12 17 22-13 26-34 12-34-14z" fill="#9da98e" stroke="#6e806b" strokeWidth="2"/>
            <circle cx="180" cy="250" r="9" fill="#f7f5ef" stroke="#a15d2d" strokeWidth="3"/>
            <g fontSize="10" fontFamily="sans-serif" fill="#4c554d" textAnchor="middle">
              <text x="82" y="78">VEILED PEAKS</text>
              <text x="180" y="25">CAPITAL VALLEY</text>
              <text x="281" y="78">PRIMORDIAL</text>
              <text x="180" y="302" fontWeight="700">HOME REACH</text>
            </g>
            <g fill="#b46a3e">
              <circle cx="84" cy="126" r="4"/><circle cx="180" cy="74" r="4"/><circle cx="278" cy="126" r="4"/>
            </g>
          </svg>
          <p className="mt-2 text-[10px] leading-relaxed text-[#77796f]">The gates are real in-world portals. The map is a navigation overview, not a scale-accurate survey.</p>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          {REGIONS.map((region) => {
            const isCurrent = currentRegion === region.id;
            return (
              <article key={region.id} className="overflow-hidden rounded-[20px] border border-[#ddd9cf] bg-white/70">
                <div className={`relative overflow-hidden bg-gradient-to-br ${region.tone} px-4 py-3 text-white`}>
                  <div className="absolute -right-1 -top-5 text-[88px] leading-none text-white/10">{region.symbol}</div>
                  <p className="relative text-[9px] font-semibold tracking-[0.22em] text-white/65">{region.subtitle}</p>
                  <div className="relative mt-1 flex items-center justify-between gap-2">
                    <h3 className="font-serif text-[24px] leading-none">{region.name}</h3>
                    {isCurrent && <span className="rounded-full bg-white/15 px-2 py-1 text-[9px] uppercase tracking-wider">You are here</span>}
                  </div>
                  <p className="relative mt-2 max-w-[92%] text-[11px] leading-relaxed text-white/80">{region.description}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <ul className="min-w-0 flex-1 space-y-1">
                    {region.locations.map((location) => (
                      <li key={location} className="flex items-center gap-2 text-[11px] text-[#555b51]">
                        <span className="h-1 w-1 rounded-full bg-[#a47a4a]"/>
                        {location}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={isCurrent}
                    onClick={() => onTravel(region.id)}
                    className="shrink-0 rounded-full bg-[#283d34] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white transition hover:bg-[#3d5b4b] disabled:cursor-default disabled:bg-[#d6d8d0] disabled:text-[#72776d]"
                  >
                    {isCurrent ? 'Current region' : 'Travel'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
