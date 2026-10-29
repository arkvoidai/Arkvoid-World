import { create } from 'zustand';
import {
  type Character,
  type QuestState,
  type QuestDef,
  type Npc,
  type NpcTrust,
  type WorldEvent,
  type AwayReportResponse,
  type GatherResponse,
  type BreakthroughResponse,
  type RetreatStartResponse,
  type RetreatClaimResponse,
  type Leaning,
  type FormId,
  getCharacter,
  getQuestStates,
  getQuestDefs,
  getNpcs,
  getTrust,
  getEvents,
  createCharacter as apiCreateCharacter,
  gather as apiGather,
  attemptBreakthrough as apiAttemptBreakthrough,
  startRetreat as apiStartRetreat,
  claimRetreat as apiClaimRetreat,
  reportReach as apiReportReach,
  awayReport as apiAwayReport,
} from '@/net/api';
import { hourNow } from '@/lib/worldClock';
import { positionSaver } from '@/net/positionSaver';

export interface RetreatState {
  ready: boolean;
  readyAt: string | null;
  secondsLeft?: number;
}

export interface GameState {
  character: Character | null;
  questStates: QuestState[];
  questDefs: QuestDef[];
  npcs: Npc[];
  trust: NpcTrust[];
  recentEvents: WorldEvent[];
  retreat: RetreatState | null;
  awayReport: AwayReportResponse | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadInitialGameData: () => Promise<boolean>;
  createCharacter: (name: string, leaning: Leaning, form: FormId) => Promise<boolean>;
  gather: (kind: 'dawn' | 'dusk', quality?: 0 | 1 | 2 | 3) => Promise<GatherResponse | null>;
  attemptBreakthrough: () => Promise<BreakthroughResponse | null>;
  startRetreat: (minutes: 15 | 60 | 240) => Promise<RetreatStartResponse | null>;
  claimRetreat: () => Promise<RetreatClaimResponse | null>;
  reportReach: (spot: string) => Promise<boolean>;
  refreshCharacter: () => Promise<void>;
  resetGame: () => void;
}

export function computeBreathCap(realm: number, stage: number): number {
  return 40 + 30 * stage + 80 * (realm - 1);
}

export function getRealmName(realm: number): string {
  switch (realm) {
    case 1:
      return 'Stillness';
    case 2:
      return 'Gathering';
    case 3:
      return 'Forging';
    default:
      return `Realm ${realm}`;
  }
}

/**
 * Calculate expected gather multiplier:
 * Base 1.0.
 * In dawn window (hours 5 to 8) for dawn Breath => 3x.
 * In dusk window (hours 17 to 20) for dusk Breath => 3x.
 * +25% (1.25x) if the player's leaning matches the gathered kind.
 */
export function calculateGatherMultiplier(
  kind: 'dawn' | 'dusk',
  leaning: Leaning | undefined,
  currentHour: number = hourNow(),
): number {
  let mult = 1.0;
  const isDawnWindow = currentHour >= 5 && currentHour < 8;
  const isDuskWindow = currentHour >= 17 && currentHour < 20;

  if (kind === 'dawn' && isDawnWindow) {
    mult *= 3.0;
  } else if (kind === 'dusk' && isDuskWindow) {
    mult *= 3.0;
  }

  if (leaning === kind) {
    mult *= 1.25;
  }

  return mult;
}

export const useGameStore = create<GameState>((set, get) => ({
  character: null,
  questStates: [],
  questDefs: [],
  npcs: [],
  trust: [],
  recentEvents: [],
  retreat: null,
  awayReport: null,
  isLoading: false,
  error: null,

  resetGame: () => {
    positionSaver.reset();
    set({
      character: null,
      questStates: [],
      questDefs: [],
      npcs: [],
      trust: [],
      recentEvents: [],
      retreat: null,
      awayReport: null,
      isLoading: false,
      error: null,
    });
  },

  loadInitialGameData: async () => {
    set({ isLoading: true, error: null });
    try {
      // 1. Fetch character
      const charRes = await getCharacter();
      if (!charRes.ok) {
        set({ isLoading: false, error: charRes.error.message });
        return false;
      }

      const character = charRes.data;
      set({ character });

      // If character exists, run away_report right after character loads and BEFORE any save_position
      if (character) {
        positionSaver.setAwayReportRun(false);
        const awayRes = await apiAwayReport();
        if (awayRes.ok) {
          set({ awayReport: awayRes.data });
          if (awayRes.data.status === 'ok' && awayRes.data.retreat) {
            set({
              retreat: {
                ready: awayRes.data.retreat.ready,
                readyAt: awayRes.data.retreat.ready_at,
              },
            });
          }
        }
        positionSaver.setAwayReportRun(true);
      }

      // 2. Fetch quests, npcs, trust, events in parallel
      const [questsRes, defsRes, npcsRes, trustRes, eventsRes] = await Promise.all([
        getQuestStates(),
        getQuestDefs(),
        getNpcs(),
        getTrust(),
        getEvents(20),
      ]);

      set({
        questStates: questsRes.ok ? questsRes.data : [],
        questDefs: defsRes.ok ? defsRes.data : [],
        npcs: npcsRes.ok ? npcsRes.data : [],
        trust: trustRes.ok ? trustRes.data : [],
        recentEvents: eventsRes.ok ? eventsRes.data : [],
        isLoading: false,
      });

      return Boolean(character);
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load game data',
      });
      return false;
    }
  },

  createCharacter: async (name, leaning, form) => {
    set({ isLoading: true, error: null });
    const res = await apiCreateCharacter(name, leaning, form);
    if (res.ok) {
      set({ character: res.data, isLoading: false });
      // Call away_report right after character is created/loaded
      positionSaver.setAwayReportRun(false);
      const awayRes = await apiAwayReport();
      if (awayRes.ok) {
        set({ awayReport: awayRes.data });
      }
      positionSaver.setAwayReportRun(true);
      return true;
    } else {
      set({ isLoading: false, error: res.error.message });
      return false;
    }
  },

  gather: async (kind, quality = 1) => {
    const current = get().character;
    if (!current) return null;

    // Optimistic update for gather gain preview
    const mult = calculateGatherMultiplier(kind, current.leaning);
    const estimatedBaseGain = (quality + 1) * 2;
    const estimatedGain = Math.round(estimatedBaseGain * mult);
    const cap = computeBreathCap(current.realm, current.stage);

    const prevDawn = current.dawn;
    const prevDusk = current.dusk;

    if (kind === 'dawn') {
      set({
        character: {
          ...current,
          dawn: Math.min(cap, current.dawn + estimatedGain),
        },
      });
    } else {
      set({
        character: {
          ...current,
          dusk: Math.min(cap, current.dusk + estimatedGain),
        },
      });
    }

    const res = await apiGather(kind, quality);
    if (res.ok) {
      if (res.data.status === 'ok') {
        set((state) => ({
          character: state.character
            ? {
                ...state.character,
                dawn: res.data.dawn,
                dusk: res.data.dusk,
              }
            : null,
        }));
      } else {
        // Rollback to server values on too_fast
        set((state) => ({
          character: state.character
            ? {
                ...state.character,
                dawn: res.data.dawn,
                dusk: res.data.dusk,
              }
            : null,
        }));
      }
      return res.data;
    } else {
      // Rollback on error
      set((state) => ({
        character: state.character
          ? {
              ...state.character,
              dawn: prevDawn,
              dusk: prevDusk,
            }
          : null,
        error: res.error.message,
      }));
      return null;
    }
  },

  attemptBreakthrough: async () => {
    const res = await apiAttemptBreakthrough();
    if (res.ok) {
      if (res.data.status === 'ok') {
        set((state) => ({
          character: state.character
            ? {
                ...state.character,
                realm: res.data.realm,
                stage: res.data.stage,
                dawn: 0,
                dusk: 0,
              }
            : null,
        }));
      }
      return res.data;
    } else {
      set({ error: res.error.message });
      return null;
    }
  },

  startRetreat: async (minutes) => {
    const res = await apiStartRetreat(minutes);
    if (res.ok) {
      if (res.data.status === 'started') {
        set({
          retreat: {
            ready: false,
            readyAt: res.data.ready_at,
          },
        });
      }
      return res.data;
    } else {
      set({ error: res.error.message });
      return null;
    }
  },

  claimRetreat: async () => {
    const res = await apiClaimRetreat();
    if (res.ok) {
      if (res.data.status === 'claimed') {
        set((state) => ({
          retreat: null,
          character: state.character
            ? {
                ...state.character,
                dawn: res.data.dawn,
                dusk: res.data.dusk,
              }
            : null,
        }));
      } else if (res.data.status === 'not_ready') {
        set({
          retreat: {
            ready: false,
            readyAt: res.data.ready_at,
            secondsLeft: res.data.seconds_left,
          },
        });
      } else if (res.data.status === 'none') {
        set({ retreat: null });
      }
      return res.data;
    } else {
      set({ error: res.error.message });
      return null;
    }
  },

  reportReach: async (spot) => {
    const res = await apiReportReach(spot);
    return res.ok;
  },

  refreshCharacter: async () => {
    const res = await getCharacter();
    if (res.ok && res.data) {
      set({ character: res.data });
    }
  },
}));

// Derived Selectors
export const selectBreathCap = (state: GameState): number => {
  if (!state.character) return 40;
  return computeBreathCap(state.character.realm, state.character.stage);
};

export const selectDawnFraction = (state: GameState): number => {
  if (!state.character) return 0;
  const cap = selectBreathCap(state);
  return cap > 0 ? Math.min(1, Math.max(0, state.character.dawn / cap)) : 0;
};

export const selectDuskFraction = (state: GameState): number => {
  if (!state.character) return 0;
  const cap = selectBreathCap(state);
  return cap > 0 ? Math.min(1, Math.max(0, state.character.dusk / cap)) : 0;
};

export const selectRealmName = (state: GameState): string => {
  if (!state.character) return 'Stillness';
  return getRealmName(state.character.realm);
};

export const selectCanBreakthrough = (state: GameState): boolean => {
  if (!state.character) return false;
  const cap = selectBreathCap(state);
  return state.character.dawn >= cap && state.character.dusk >= cap;
};
