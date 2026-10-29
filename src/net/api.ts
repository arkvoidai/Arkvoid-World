import { getSupabase, hasSupabase, withTimeout, ok, err, type Result } from '@/net/supabase';
import { mapError, createAppError, type AppError } from '@/net/errors';

export type Leaning = 'dawn' | 'dusk' | 'still';
export type FormId = 0 | 1 | 2 | 3;

export interface CharacterPos {
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface Character {
  user_id: string;
  name: string;
  leaning: Leaning;
  form: FormId;
  realm: number;
  stage: number;
  dawn: number;
  dusk: number;
  area: string;
  pos: CharacterPos;
  last_gather: string | null;
  last_seen: string | null;
  created_at: string;
}

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  steps: unknown;
  reward_dawn: number;
  reward_dusk: number;
}

export interface QuestState {
  user_id: string;
  quest_id: string;
  step: number;
  counter: number;
  done: boolean;
}

export interface NpcScheduleEntry {
  from: number;
  to: number;
  area: string;
  spot: string;
  act: string;
}

export interface Npc {
  id: string;
  name: string;
  role: string;
  persona: string;
  schedule: NpcScheduleEntry[];
}

export interface NpcTrust {
  user_id: string;
  npc_id: string;
  trust: number;
  updated_at?: string;
}

export interface NpcMemory {
  id: string;
  user_id: string;
  npc_id: string;
  memory: string;
  created_at: string;
}

export interface WorldEvent {
  id: string;
  kind: string;
  npc_id: string;
  area: string;
  summary: string;
  world_minute: number;
  created_at: string;
}

// RPC Return Types
export type GatherResponse =
  | {
      status: 'ok';
      kind: 'dawn' | 'dusk';
      gain: number;
      in_window: boolean;
      dawn: number;
      dusk: number;
      cap: number;
    }
  | {
      status: 'too_fast';
      dawn: number;
      dusk: number;
    };

export type BreakthroughResponse =
  | {
      status: 'ok';
      realm: number;
      stage: number;
    }
  | {
      status: 'not_ready';
      need: number;
      dawn: number;
      dusk: number;
    }
  | {
      status: 'sealed';
    }
  | {
      status: 'quest_required';
      quest: string;
    };

export type RetreatStartResponse =
  | {
      status: 'started';
      ready_at: string;
    }
  | {
      status: 'already_active';
    };

export type RetreatClaimResponse =
  | {
      status: 'claimed';
      gain: number;
      dawn: number;
      dusk: number;
      cap: number;
    }
  | {
      status: 'not_ready';
      seconds_left: number;
      ready_at: string;
    }
  | {
      status: 'none';
    };

export interface NpcPresenceNow {
  npc: string;
  name: string;
  area: string;
  spot: string;
  act: string;
}

export type AwayReportResponse =
  | {
      status: 'ok';
      away_seconds: number;
      world_minutes_passed: number;
      world_minute: number;
      hour: number;
      npcs_now: NpcPresenceNow[];
      retreat: null | {
        ready: boolean;
        ready_at: string;
      };
    }
  | {
      status: 'no_character';
    };

export interface PublicStatsResponse {
  characters: number;
  active_hour: number;
  world_minute: number;
}

/**
 * Common executor for API operations:
 * - 8s timeout
 * - 1 retry on NETWORK error only with 400ms backoff
 * - Error mapping
 * - Returns Result<T> without throwing
 */
async function executeWithRetry<T>(operation: () => Promise<T>): Promise<Result<T>> {
  if (!hasSupabase()) {
    return err(
      createAppError(
        'VALIDATION',
        'Supabase is not configured yet. Set credentials in src/config/public.ts.',
      ),
    );
  }

  let lastError: AppError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await withTimeout(operation, 8000);
      return ok(data);
    } catch (e) {
      const mapped = mapError(e);
      lastError = mapped;

      // Only retry once on NETWORK error with 400 ms backoff
      if (mapped.code === 'NETWORK' && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      return err(mapped);
    }
  }

  return err(lastError ?? createAppError('UNKNOWN'));
}

// -------------------------------------------------------------
// Player RPC Functions
// -------------------------------------------------------------

export async function createCharacter(
  name: string,
  leaning: Leaning,
  form: FormId,
): Promise<Result<Character>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('create_character', {
      p_name: name,
      p_leaning: leaning,
      p_form: form,
    });
    if (error) throw error;
    return data as Character;
  });
}

export async function gather(
  kind: 'dawn' | 'dusk',
  quality: 0 | 1 | 2 | 3,
): Promise<Result<GatherResponse>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('gather', {
      p_kind: kind,
      p_quality: quality,
    });
    if (error) throw error;
    return data as GatherResponse;
  });
}

export async function attemptBreakthrough(): Promise<Result<BreakthroughResponse>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('attempt_breakthrough');
    if (error) throw error;
    return data as BreakthroughResponse;
  });
}

export async function startRetreat(
  minutes: 15 | 60 | 240,
): Promise<Result<RetreatStartResponse>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('start_retreat', {
      p_minutes: minutes,
    });
    if (error) throw error;
    return data as RetreatStartResponse;
  });
}

export async function claimRetreat(): Promise<Result<RetreatClaimResponse>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('claim_retreat');
    if (error) throw error;
    return data as RetreatClaimResponse;
  });
}

export async function reportReach(spot: string): Promise<Result<void>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('report_reach', {
      p_spot: spot,
    });
    if (error) throw error;
  });
}

export async function savePosition(
  area: string,
  pos: CharacterPos,
): Promise<Result<void>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('save_position', {
      p_area: area,
      p_pos: pos,
    });
    if (error) throw error;
  });
}

export async function awayReport(): Promise<Result<AwayReportResponse>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('away_report');
    if (error) throw error;
    return data as AwayReportResponse;
  });
}

export async function reportPlayer(
  target: string,
  reason: string,
  note?: string,
): Promise<Result<void>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('report_player', {
      p_target: target,
      p_reason: reason,
      p_note: note ?? '',
    });
    if (error) throw error;
  });
}

export async function sendFeedback(message: string): Promise<Result<void>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('send_feedback', {
      p_message: message,
    });
    if (error) throw error;
  });
}

export async function logClientError(
  kind: string,
  message: string,
  ctx?: Record<string, unknown>,
): Promise<Result<void>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('log_client_error', {
      p_kind: kind,
      p_message: message,
      p_ctx: ctx ?? {},
    });
    if (error) throw error;
  });
}

export async function publicStats(): Promise<Result<PublicStatsResponse>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('public_stats');
    if (error) throw error;
    return data as PublicStatsResponse;
  });
}

export async function deleteMyData(): Promise<Result<void>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('delete_my_data');
    if (error) throw error;
  });
}

export async function worldNow(): Promise<Result<string>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('world_now');
    if (error) throw error;
    return typeof data === 'string' ? data : new Date(Number(data) || Date.now()).toISOString();
  });
}

// -------------------------------------------------------------
// Table Reads
// -------------------------------------------------------------

export async function getCharacter(userId?: string): Promise<Result<Character | null>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    let query = supabase.from('characters').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as Character) || null;
  });
}

export async function getQuestStates(userId?: string): Promise<Result<QuestState[]>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    let query = supabase.from('quest_state').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data as QuestState[]) || [];
  });
}

export async function getQuestDefs(): Promise<Result<QuestDef[]>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('quest_defs').select('*');
    if (error) throw error;
    return (data as QuestDef[]) || [];
  });
}

export async function getEvents(
  limit = 20,
  beforeId?: string,
): Promise<Result<WorldEvent[]>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    let query = supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (beforeId) {
      query = query.lt('id', beforeId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data as WorldEvent[]) || [];
  });
}

export async function getNpcs(): Promise<Result<Npc[]>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('npcs').select('*');
    if (error) throw error;
    return (data as Npc[]) || [];
  });
}

export async function getTrust(userId?: string): Promise<Result<NpcTrust[]>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    let query = supabase.from('npc_trust').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data as NpcTrust[]) || [];
  });
}

export async function getMemories(
  npcId: string,
  limit = 10,
): Promise<Result<NpcMemory[]>> {
  return executeWithRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('npc_memories')
      .select('*')
      .eq('npc_id', npcId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as NpcMemory[]) || [];
  });
}

// -------------------------------------------------------------
// Expose on window.__ark ONLY in dev builds with ?auth=1
// -------------------------------------------------------------
if (import.meta.env.DEV && typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === '1') {
      (window as unknown as { __ark?: unknown }).__ark = {
        getSupabase,
        hasSupabase,
        api: {
          createCharacter,
          gather,
          attemptBreakthrough,
          startRetreat,
          claimRetreat,
          reportReach,
          savePosition,
          awayReport,
          reportPlayer,
          sendFeedback,
          logClientError,
          publicStats,
          deleteMyData,
          worldNow,
          getCharacter,
          getQuestStates,
          getQuestDefs,
          getEvents,
          getNpcs,
          getTrust,
          getMemories,
        },
      };
    }
  } catch {
    // Non-critical in non-browser dev runtimes
  }
}
