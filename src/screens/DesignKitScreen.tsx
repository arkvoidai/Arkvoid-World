import { useEffect, useRef, useState } from 'react';
import { Compass, Sparkles, Sun, Volume2 } from 'lucide-react';
import { COLORS, RADII } from '@/config/tokens';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Divider } from '@/ui/Divider';
import { Field } from '@/ui/Field';
import { Glass } from '@/ui/Glass';
import { IconButton } from '@/ui/IconButton';
import { Logo } from '@/ui/Logo';
import { Orb, type OrbPulse } from '@/ui/Orb';
import { Pill } from '@/ui/Pill';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Sheet, type SheetDetent } from '@/ui/Sheet';
import { Skeleton } from '@/ui/Skeleton';
import { ToastHost, showToast } from '@/ui/Toast';
import { Tooltip } from '@/ui/Tooltip';
import {
  WorldLabel,
  type WorldLabelScreenPoint,
} from '@/ui/WorldLabel';

const ORB_HOURS = [
  { hour: 0, label: '00:00' },
  { hour: 6, label: '06:00' },
  { hour: 9, label: '09:00' },
  { hour: 12, label: '12:00' },
  { hour: 18, label: '18:00' },
  { hour: 21.5, label: '21:30' },
] as const;

const BREATH_LEVELS = [
  { label: 'STAGE 1', dawn: 0.22, dusk: 0.14 },
  { label: 'STAGE 2', dawn: 0.62, dusk: 0.48 },
  { label: 'STAGE 3', dawn: 0.94, dusk: 0.88 },
] as const;

type RealmChoice = 'Stillness' | 'Gathering' | 'Forging';

export default function DesignKitScreen() {
  const [liveHour, setLiveHour] = useState<number>(6.5);
  const [liveDawn, setLiveDawn] = useState<number>(0.68);
  const [liveDusk, setLiveDusk] = useState<number>(0.44);
  const [livePulse, setLivePulse] = useState<OrbPulse>(null);

  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const [sheetDetent, setSheetDetent] = useState<SheetDetent>('medium');

  const [realm, setRealm] = useState<RealmChoice>('Stillness');
  const [selectedChip, setSelectedChip] = useState<'dawn' | 'dusk' | 'still'>(
    'dawn',
  );
  const [residentName, setResidentName] = useState<string>('Sera');
  const [loadingBtn, setLoadingBtn] = useState<boolean>(false);
  const [labelDistance, setLabelDistance] = useState<number>(8);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const areaPointRef = useRef<WorldLabelScreenPoint>({
    x: 110,
    y: 78,
    distance: 8,
    visible: true,
    orbX: 220,
    orbY: 96,
  });
  const verbPointRef = useRef<WorldLabelScreenPoint>({
    x: 205,
    y: 96,
    distance: 8,
    visible: true,
    orbX: 220,
    orbY: 96,
  });

  useEffect(() => {
    areaPointRef.current.distance = labelDistance;
    verbPointRef.current.distance = labelDistance;
  }, [labelDistance]);

  useEffect(() => {
    const updateStageCoords = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const cx = rect.width * 0.5;
      const cy = rect.height * 0.52;
      areaPointRef.current = {
        x: Math.max(72, cx - 88),
        y: Math.max(36, cy - 28),
        distance: labelDistance,
        visible: true,
        orbX: cx,
        orbY: cy,
      };
      verbPointRef.current = {
        x: cx + 22,
        y: cy - 8,
        distance: labelDistance,
        visible: true,
        orbX: cx,
        orbY: cy,
      };
    };
    updateStageCoords();
    window.addEventListener('resize', updateStageCoords, { passive: true });
    return () => window.removeEventListener('resize', updateStageCoords);
  }, [labelDistance]);

  const triggerPulse = (kind: 'dawn' | 'dusk') => {
    setLivePulse(kind);
    if (kind === 'dawn') {
      setLiveDawn((v) => Math.min(1, Number((v + 0.08).toFixed(2))));
      showToast('Dawn Breath gathered', 'dawn');
    } else {
      setLiveDusk((v) => Math.min(1, Number((v + 0.08).toFixed(2))));
      showToast('Dusk Breath gathered', 'dusk');
    }
    window.setTimeout(() => setLivePulse(null), 520);
  };

  return (
    <div
      className="fixed inset-0 w-full overflow-x-hidden overflow-y-auto"
      style={{
        backgroundColor: COLORS.pearl,
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(255, 178, 122, 0.16) 0%, rgba(185, 166, 255, 0.12) 38%, rgba(251, 250, 247, 0) 72%)',
        paddingTop: 'calc(var(--safe-top, 0px) + 32px)',
        paddingBottom: 'calc(var(--safe-bottom, 0px) + 64px)',
        paddingLeft: 'calc(var(--safe-left, 0px) + 16px)',
        paddingRight: 'calc(var(--safe-right, 0px) + 16px)',
      }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {/* Header: Logo Variants & Primary Sheet Trigger */}
        <Glass
          as="section"
          className="flex flex-wrap items-center justify-between gap-6 p-6"
          style={{ borderRadius: RADII.card }}
        >
          <div className="flex flex-wrap items-center gap-8">
            <Logo variant="mark" size={40} />
            <Logo variant="wordmark" size={32} />
            <Logo variant="lockup" size={32} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ink"
              size="md"
              onClick={() => setSheetOpen(true)}
            >
              Open Sheet
            </Button>
          </div>
        </Glass>

        {/* Section 1: The Orb (6 Hours + 3 Breath Levels + Live Controls) */}
        <Glass
          as="section"
          className="flex flex-col gap-6 p-6"
          style={{ borderRadius: RADII.card }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="font-mono text-label uppercase text-ink-2">
              THE ORB · HOURS 0 TO 24
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => triggerPulse('dawn')}
              >
                Dawn Pulse
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => triggerPulse('dusk')}
              >
                Dusk Pulse
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() =>
                  setLiveHour((h) => Number(((h + 3) % 24).toFixed(1)))
                }
              >
                Advance Hour
              </Button>
            </div>
          </div>

          {/* Six hours grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {ORB_HOURS.map((item, idx) => (
              <div
                key={item.label}
                className="flex flex-col items-center justify-center gap-3 rounded-[22px] p-4"
                style={{
                  backgroundColor: COLORS.porcelain,
                  border: `1px solid ${COLORS.line}`,
                }}
              >
                <Orb
                  hour={item.hour}
                  dawn={idx === 0 ? liveDawn : 0.64}
                  dusk={idx === 0 ? liveDusk : 0.42}
                  pulse={idx === 0 ? livePulse : null}
                  ariaLabel={`Orb at ${item.label}`}
                  onPress={() => setSheetOpen(true)}
                />
                <span className="font-mono text-label uppercase text-ink-2">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <Divider />

          {/* Three Breath levels */}
          <div className="flex flex-col gap-4">
            <span className="font-mono text-label uppercase text-ink-2">
              THE ORB · THREE BREATH LEVELS
            </span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {BREATH_LEVELS.map((level) => (
                <div
                  key={level.label}
                  className="flex items-center justify-between rounded-[22px] px-5 py-4"
                  style={{
                    backgroundColor: COLORS.porcelain,
                    border: `1px solid ${COLORS.line}`,
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-label uppercase text-ink-2">
                      {level.label}
                    </span>
                    <span className="text-body text-ink">
                      Dawn {Math.round(level.dawn * 100)}% · Dusk{' '}
                      {Math.round(level.dusk * 100)}%
                    </span>
                  </div>
                  <Orb
                    hour={liveHour}
                    dawn={level.dawn}
                    dusk={level.dusk}
                    pulse={livePulse}
                    ariaLabel={`Orb ${level.label}`}
                    onPress={() => setSheetOpen(true)}
                  />
                </div>
              ))}
            </div>
          </div>
        </Glass>

        {/* Section 2: Typography & Palette Tokens */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Glass
            as="section"
            className="flex flex-col gap-5 p-6"
            style={{ borderRadius: RADII.card }}
          >
            <span className="font-mono text-label uppercase text-ink-2">
              TYPE SCALE
            </span>
            <div className="flex flex-col gap-3">
              <div
                className="font-serif italic text-ink"
                style={{
                  fontSize: 'clamp(2.5rem, 5vw + 1rem, 4.5rem)',
                  lineHeight: 1.06,
                }}
              >
                Celestial Frontier
              </div>
              <div className="text-title text-ink">Porcelain Arch</div>
              <div className="text-heading text-ink">
                Bridge of{' '}
                <span className="font-serif italic font-normal">Stillness</span>
              </div>
              <p className="m-0 text-body text-ink-2">
                <span className="font-serif italic text-ink">Sera</span> waits
                beside the stone lantern as Dawn Breath settles along the rim.
              </p>
              <span className="font-mono text-label uppercase text-ink-2">
                REALM · STILLNESS · STAGE 1
              </span>
            </div>
            <Divider variant="aurora-progress" progress={0.68} />
          </Glass>

          <Glass
            as="section"
            className="flex flex-col gap-5 p-6"
            style={{ borderRadius: RADII.card }}
          >
            <span className="font-mono text-label uppercase text-ink-2">
              SURFACES & LIGHT TOKENS
            </span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { name: 'PEARL', hex: '#FBFAF7', bg: COLORS.pearl },
                { name: 'PORCELAIN', hex: '#F4F1EA', bg: COLORS.porcelain },
                { name: 'MIST', hex: '#ECE8F4', bg: COLORS.mist },
                { name: 'INK', hex: '#17141F', bg: COLORS.ink, light: true },
                { name: 'INK 2', hex: '#4A4658', bg: COLORS.ink2, light: true },
                { name: 'INK 3', hex: '#8A8598', bg: COLORS.ink3, light: true },
              ].map((swatch) => (
                <div
                  key={swatch.name}
                  className="flex flex-col justify-between rounded-[14px] p-3"
                  style={{
                    backgroundColor: swatch.bg,
                    border: `1px solid ${COLORS.line}`,
                    color: swatch.light ? COLORS.pearl : COLORS.ink,
                    minHeight: '72px',
                  }}
                >
                  <span className="font-mono text-label uppercase">
                    {swatch.name}
                  </span>
                  <span className="font-mono text-label uppercase opacity-80">
                    {swatch.hex}
                  </span>
                </div>
              ))}
            </div>
          </Glass>
        </div>

        {/* Section 3: Buttons, IconButtons & Contextual Action Pill */}
        <Glass
          as="section"
          className="flex flex-col gap-6 p-6"
          style={{ borderRadius: RADII.card }}
        >
          <span className="font-mono text-label uppercase text-ink-2">
            BUTTONS · ICON BUTTONS · CONTEXTUAL PILL
          </span>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ink"
              size="lg"
              onClick={() => showToast('Entered Retreat', 'neutral')}
            >
              Enter Retreat
            </Button>
            <Button
              variant="light"
              size="md"
              leadingIcon={<Sparkles className="h-4 w-4" />}
              onClick={() => triggerPulse('dawn')}
            >
              Gather Breath
            </Button>
            <Button
              variant="quiet"
              size="md"
              onClick={() => setSheetOpen(true)}
            >
              Inspect Realm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => showToast('Quiet step', 'neutral')}
            >
              Step Back
            </Button>
            <Button
              variant="ink"
              size="md"
              loading={loadingBtn}
              onClick={() => {
                setLoadingBtn(true);
                window.setTimeout(() => setLoadingBtn(false), 900);
              }}
            >
              Hold Still
            </Button>
          </div>

          <Divider />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Pill
                label="Speak with Sera"
                keycap="E"
                onClick={() => showToast('Sera turns toward you', 'dawn')}
              />
              <Pill
                label="Rest at Shrine"
                keycap="R"
                onClick={() => showToast('Breath steadies', 'dusk')}
              />
            </div>

            <div className="flex items-center gap-3">
              <Tooltip label="Compass">
                <IconButton
                  aria-label="Compass"
                  onClick={() => showToast('Facing North Bridge')}
                >
                  <Compass className="h-5 w-5" />
                </IconButton>
              </Tooltip>
              <Tooltip label="Sound">
                <IconButton
                  aria-label="Sound"
                  onClick={() => showToast('Chimes active')}
                >
                  <Volume2 className="h-5 w-5" />
                </IconButton>
              </Tooltip>
              <Tooltip label="Noon Light">
                <IconButton
                  aria-label="Noon Light"
                  onClick={() => setLiveHour(12)}
                >
                  <Sun className="h-5 w-5" />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </Glass>

        {/* Section 4: Field, SegmentedControl, Chips, Skeleton & WorldLabel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Glass
            as="section"
            className="flex flex-col gap-5 p-6"
            style={{ borderRadius: RADII.card }}
          >
            <span className="font-mono text-label uppercase text-ink-2">
              CONTROLS · FIELD · SEGMENTED · CHIPS
            </span>

            <Field
              label="Resident Name"
              value={residentName}
              onChange={(e) => setResidentName(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl<RealmChoice>
                ariaLabel="Realm"
                value={realm}
                onChange={setRealm}
                options={[
                  { value: 'Stillness', label: 'Stillness' },
                  { value: 'Gathering', label: 'Gathering' },
                  { value: 'Forging', label: 'Forging' },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Chip
                label="Dawn Leaning"
                tone="dawn"
                selected={selectedChip === 'dawn'}
                onClick={() => setSelectedChip('dawn')}
              />
              <Chip
                label="Dusk Leaning"
                tone="dusk"
                selected={selectedChip === 'dusk'}
                onClick={() => setSelectedChip('dusk')}
              />
              <Chip
                label="Still Leaning"
                tone="neutral"
                selected={selectedChip === 'still'}
                onClick={() => setSelectedChip('still')}
              />
            </div>

            <Divider />

            <div className="flex flex-col gap-2">
              <span className="font-mono text-label uppercase text-ink-3">
                SKELETON
              </span>
              <Skeleton width="65%" height="18px" />
              <Skeleton width="100%" height="48px" />
            </div>
          </Glass>

          {/* WorldLabel & Non-Overlap Stage */}
          <Glass
            as="section"
            className="flex flex-col gap-5 p-6"
            style={{ borderRadius: RADII.card }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-label uppercase text-ink-2">
                WORLD LABEL · REF ANCHOR & ORB CLEARANCE
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() =>
                    setLabelDistance((d) => (d <= 6 ? 22 : 6))
                  }
                >
                  {labelDistance <= 10 ? 'Far Distance' : 'Near Distance'}
                </Button>
              </div>
            </div>

            <div
              ref={stageRef}
              className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-[22px]"
              style={{
                backgroundColor: COLORS.porcelain,
                backgroundImage:
                  'radial-gradient(circle at 50% 50%, rgba(255, 178, 122, 0.20) 0%, rgba(185, 166, 255, 0.16) 45%, rgba(244, 241, 234, 0) 75%)',
                border: `1px solid ${COLORS.line}`,
              }}
            >
              <Orb
                hour={liveHour}
                dawn={liveDawn}
                dusk={liveDusk}
                pulse={livePulse}
                ariaLabel="Stage Orb"
                onPress={() => setSheetOpen(true)}
              />
              <WorldLabel
                text={residentName || 'Sera'}
                kind="name"
                positionRef={areaPointRef}
              />
              <WorldLabel
                text="Approach"
                kind="verb"
                positionRef={verbPointRef}
              />
            </div>
          </Glass>
        </div>
      </main>

      {/* Sheet (Bottom sheet with peek/medium/full detents on mobile; 400px floating right panel on >= 1024px) */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Retreat"
        detent={sheetDetent}
        onDetentChange={setSheetDetent}
      >
        <div className="flex flex-col gap-5 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-mono text-label uppercase text-ink-3">
                REALM
              </span>
              <span className="font-serif text-title italic text-ink">
                {realm}
              </span>
            </div>
            <Orb
              hour={liveHour}
              dawn={liveDawn}
              dusk={liveDusk}
              pulse={livePulse}
              ariaLabel="Sheet Orb"
            />
          </div>

          <Divider variant="aurora-progress" progress={liveDawn} />

          <div className="flex flex-col gap-3">
            <span className="font-mono text-label uppercase text-ink-2">
              RESIDENT
            </span>
            <p className="m-0 text-body text-ink-2">
              <span className="font-serif italic text-ink">
                {residentName || 'Sera'}
              </span>{' '}
              keeps the lantern lit while the bridge crosses into dusk.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="light"
              size="md"
              onClick={() => triggerPulse('dawn')}
            >
              Gather Dawn Breath
            </Button>
            <Button
              variant="quiet"
              size="md"
              onClick={() => setSheetOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Sheet>

      <ToastHost />
    </div>
  );
}
