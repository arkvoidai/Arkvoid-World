import { LazyMotion, domAnimation, m } from 'motion/react';
import { Logo } from '@/ui/Logo';

export function ArkvoidMark() {
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="relative flex items-center justify-center text-ink select-none"
        initial={{ opacity: 0.72, scale: 0.985 }}
        animate={{ opacity: [0.72, 1, 0.72], scale: [0.985, 1.015, 0.985] }}
        transition={{
          duration: 5.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        aria-label="Arkvoid"
        role="img"
      >
        <div
          className="pointer-events-none absolute h-64 w-64 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(255, 178, 122, 0.20) 0%, rgba(185, 166, 255, 0.12) 36%, rgba(251, 250, 247, 0) 68%)',
          }}
        />
        <Logo variant="mark" size={48} className="relative z-10" />
      </m.div>
    </LazyMotion>
  );
}
