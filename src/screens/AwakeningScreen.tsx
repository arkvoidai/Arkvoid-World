import { useState, useEffect, useRef } from 'react';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { prewarmFormThumbnails, renderFormThumbnail } from '@/ui/thumbnailRenderer';
import { sharedEngineBridge } from '@/state/worldBridgeStore';
import type { Leaning, FormId } from '@/net/api';

export interface AwakeningScreenProps {
  onAwakenComplete: (name: string, leaning: Leaning, form: FormId) => Promise<boolean>;
  error?: string | null;
}

const LEANINGS: Array<{
  id: Leaning;
  title: string;
  tagline: string;
}> = [
  { id: 'dawn', title: 'Dawn', tagline: 'Quick to rise.' },
  { id: 'dusk', title: 'Dusk', tagline: 'Slow to settle.' },
  { id: 'still', title: 'Still', tagline: 'Even at all hours.' },
];

const FORMS: Array<{ id: FormId; name: string }> = [
  { id: 0, name: 'Traveller' },
  { id: 1, name: 'Scholar' },
  { id: 2, name: 'Warden' },
  { id: 3, name: 'Sage' },
];

// Valid name regex: starts with letter; letters, spaces, apostrophes, hyphens; 2 to 20 chars
const NAME_REGEX = /^[A-Za-z][A-Za-z\s'-]{1,19}$/;

// Blocked word filter (exact banned list words)
const BANNED_WORDS = [
  'revolutionary',
  'game-changing',
  'next-gen',
  'cutting-edge',
  'seamless',
  'unlock',
  'leverage',
  'synergy',
  'paradigm',
  'metaverse',
  'disrupt',
  'supercharge',
  'empower',
  'admin',
  'moderator',
  'system',
];

export function AwakeningScreen({ onAwakenComplete, error }: AwakeningScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [leaning, setLeaning] = useState<Leaning>('dawn');
  const [form, setForm] = useState<FormId>(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Focus heading on step change (only when step advances or goes back)
  useEffect(() => {
    if (step > 1) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [step]);

  // Prewarm thumbnails during step 1
  useEffect(() => {
    prewarmFormThumbnails();
  }, []);

  // Update preview figure in 3D world whenever leaning or form changes
  useEffect(() => {
    sharedEngineBridge.enqueue({
      type: 'setPreviewFigure',
      leaning,
      form,
    });
  }, [leaning, form]);

  const validateName = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return false;
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      setNameError('2 to 20 letters. Spaces, \' and - allowed.');
      return false;
    }
    if (!NAME_REGEX.test(trimmed)) {
      setNameError('2 to 20 letters. Spaces, \' and - allowed.');
      return false;
    }

    const lower = trimmed.toLowerCase();
    for (const b of BANNED_WORDS) {
      if (lower.includes(b)) {
        setNameError('Please choose another name.');
        return false;
      }
    }

    setNameError(null);
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (!validateName(name)) return;
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (step < 3) handleNext();
      else handleFinalAwaken();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleBack();
    }
  };

  const handleFinalAwaken = async () => {
    if (!validateName(name)) return;
    setIsSubmitting(true);
    // Pulse light ring on the island
    sharedEngineBridge.enqueue({ type: 'triggerAwakenPulse' });
    const success = await onAwakenComplete(name.trim(), leaning, form);
    if (!success) {
      setIsSubmitting(false);
    }
  };

  const LeaningTitle = LEANINGS.find((l) => l.id === leaning)?.title ?? 'Dawn';

  const content = (
    <div
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-6 py-2 font-sans text-ink outline-none"
    >
      {/* Progress Dots */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === s
                ? 'w-6 bg-ink'
                : step > s
                ? 'w-2 bg-ink/60'
                : 'w-2 bg-ink/20'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Your name */}
      {step === 1 && (
        <section aria-labelledby="step-name-title" className="flex flex-col gap-4">
          <h2
            id="step-name-title"
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-2xl font-normal text-ink outline-none"
          >
            Your name
          </h2>
          <div className="flex flex-col gap-2">
            <Field
              label="Wanderer name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) validateName(e.target.value);
              }}
              required
            />
            <p className="text-xs text-ink-3">
              {nameError || "2 to 20 letters. Spaces, ' and - allowed."}
            </p>
          </div>
        </section>
      )}

      {/* Step 2: Your Leaning */}
      {step === 2 && (
        <section aria-labelledby="step-leaning-title" className="flex flex-col gap-4">
          <h2
            id="step-leaning-title"
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-2xl font-normal text-ink outline-none"
          >
            Your Leaning
          </h2>
          <div
            role="radiogroup"
            aria-label="Select your leaning"
            className="flex flex-col gap-3"
          >
            {LEANINGS.map((item) => {
              const selected = leaning === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setLeaning(item.id)}
                  className={`group relative flex items-center justify-between rounded-card p-4 transition-all duration-200 text-left outline-none ${
                    selected
                      ? 'border border-transparent ring-1 ring-orange/60 bg-surface shadow-sm'
                      : 'border border-line bg-surface/60 hover:bg-surface'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-serif text-lg text-ink font-medium">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted font-sans">
                      {item.tagline}
                    </span>
                  </div>

                  {/* Selected Indicator: small Aurora dot, never a fill */}
                  <div
                    className={`h-3 w-3 rounded-full transition-all duration-200 ${
                      selected
                        ? 'bg-gradient-to-tr from-orange to-purple shadow-sm scale-100'
                        : 'border border-line scale-75 opacity-40'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 3: Your form */}
      {step === 3 && (
        <section aria-labelledby="step-form-title" className="flex flex-col gap-4">
          <h2
            id="step-form-title"
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-2xl font-normal text-ink outline-none"
          >
            Your form
          </h2>

          {/* 4 Silhouettes horizontal selector */}
          <div
            role="radiogroup"
            aria-label="Select silhouette form"
            className="grid grid-cols-4 gap-2"
          >
            {FORMS.map((f) => {
              const selected = form === f.id;
              const thumb = renderFormThumbnail(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setForm(f.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-card p-2 transition-all outline-none ${
                    selected
                      ? 'border border-transparent ring-1 ring-orange/60 bg-surface shadow-sm'
                      : 'border border-line bg-surface/50 hover:bg-surface'
                  }`}
                >
                  <div className="relative h-20 w-full overflow-hidden rounded-md bg-pearl flex items-center justify-center">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={f.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="font-mono text-[10px] text-ink-3">
                        {f.name}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink font-medium">
                    {f.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Form summary line */}
          <p
            className="font-serif italic text-sm text-ink-2 pt-2 text-center"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            You are {name || 'Wanderer'}, of the {LeaningTitle} Leaning.
          </p>
        </section>
      )}

      {error && <p className="text-xs text-orange">{error}</p>}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            className="py-2.5 px-4 rounded-pill text-xs font-medium text-ink-3 hover:text-ink transition-colors"
          >
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 3 ? (
          <Button
            variant="light"
            size="md"
            onClick={handleNext}
            className="text-xs font-medium"
          >
            Next
          </Button>
        ) : (
          <Button
            variant="light"
            size="md"
            loading={isSubmitting}
            onClick={handleFinalAwaken}
            className="text-xs font-medium"
          >
            Awaken
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div
      aria-label="Character Awakening"
      className="pointer-events-none fixed inset-0 z-hud flex flex-col justify-end lg:justify-center lg:p-6 select-none"
    >
      {/* Desktop (>= 1024px): Floating panel on left, world preview on right */}
      <div className="pointer-events-auto hidden lg:flex w-full max-w-md">
        <div className="w-full rounded-panel border border-line bg-white/92 p-8 shadow-violet-layered backdrop-blur-md">
          {content}
        </div>
      </div>

      {/* Mobile (< 1024px): Sheet at medium detent so preview figure above remains visible */}
      <div className="pointer-events-auto lg:hidden">
        <Sheet
          open={true}
          onClose={() => {}}
          title={`Step ${step} of 3`}
          initialDetent="medium"
        >
          {content}
        </Sheet>
      </div>
    </div>
  );
}
