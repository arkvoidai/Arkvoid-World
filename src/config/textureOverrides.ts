import type { TextureSlotId } from '@/config/assets';

/**
 * Optional manual overrides: { slot: setKey }.
 * When a setKey is assigned here to a slot, it bypasses the keyword scoring.
 * Empty by default.
 */
export const TEXTURE_OVERRIDES: Partial<Record<TextureSlotId, string>> = {};
