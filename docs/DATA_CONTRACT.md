# Arkvoid Data Contract · Step 14

This document defines every Supabase table schema, authenticated player RPC function, its TypeScript interface and payload shapes, and the exact client modules that interact with it.

---

## 1. Tables & RLS Policies

All tables enforce Row Level Security (RLS). A player can only read and modify their own rows (`auth.uid() = user_id`), with public read access granted only to static definitions (`quest_defs` and `npcs`).

| Table Name | Columns & Constraints | Access / Policy | Client Call Site |
| :--- | :--- | :--- | :--- |
| `characters` | `user_id` (UUID PK), `name` (text), `leaning` (`dawn` \| `dusk` \| `still`), `form` (int 0–3), `realm` (int), `stage` (int), `dawn` (int), `dusk` (int), `area` (text), `pos` (`{x, y, z, ry}` JSONB), `last_gather` (timestamptz), `last_seen` (timestamptz), `created_at` (timestamptz) | Authenticated read own row (`user_id = auth.uid()`). Direct INSERT/UPDATE/DELETE forbidden from client (managed via RPC). | `src/net/api.ts` (`getCharacter`)<br/>`src/state/game.ts` (`loadInitialGameData`) |
| `quest_defs` | `id` (text PK), `title` (text), `giver` (text), `steps` (JSONB), `reward_dawn` (int), `reward_dusk` (int) | Public read (`SELECT`). | `src/net/api.ts` (`getQuestDefs`)<br/>`src/state/game.ts` (`loadInitialGameData`) |
| `quest_state` | `user_id` (UUID), `quest_id` (text), `step` (int), `counter` (int), `done` (boolean) | Authenticated read own row (`user_id = auth.uid()`). | `src/net/api.ts` (`getQuestStates`)<br/>`src/state/game.ts` (`loadInitialGameData`) |
| `timers` | `id` (UUID PK), `user_id` (UUID), `kind` (text), `ready_at` (timestamptz), `created_at` (timestamptz) | Authenticated read own row (`user_id = auth.uid()`). | `src/net/api.ts`<br/>`src/state/game.ts` |
| `events` | `id` (UUID PK), `kind` (text), `npc_id` (text), `area` (text), `summary` (text), `world_minute` (int), `created_at` (timestamptz) | Authenticated read (recent world history). | `src/net/api.ts` (`getEvents`)<br/>`src/state/game.ts` (`loadInitialGameData`) |
| `npcs` | `id` (text PK), `name` (text), `role` (text), `persona` (text), `schedule` (JSONB array `[{from, to, area, spot, act}]`) | Public read (`SELECT`). | `src/net/api.ts` (`getNpcs`)<br/>`src/state/game.ts` (`loadInitialGameData`) |
| `npc_memories` | `id` (UUID PK), `user_id` (UUID), `npc_id` (text), `memory` (text), `created_at` (timestamptz) | Authenticated read own row (`user_id = auth.uid()`). | `src/net/api.ts` (`getMemories`) |
| `npc_trust` | `user_id` (UUID), `npc_id` (text), `trust` (int), `updated_at` (timestamptz) | Authenticated read own row (`user_id = auth.uid()`). | `src/net/api.ts` (`getTrust`)<br/>`src/state/game.ts` (`loadInitialGameData`) |

---

## 2. Player RPC Functions

All player functions require authentication (`auth.role() = 'authenticated'`). Responses are typed as discriminated unions and wrapped in a non-throwing `Result<T>`.

### `create_character(p_name text, p_leaning text, p_form int)`
- **Parameters**:
  - `p_name`: string (2 to 24 characters)
  - `p_leaning`: `'dawn' | 'dusk' | 'still'`
  - `p_form`: `0 | 1 | 2 | 3`
- **Returns**: `Character` row
- **Client Call Site**: `src/net/api.ts` (`createCharacter`), `src/state/game.ts` (`createCharacter`)

### `gather(p_kind text, p_quality int)`
- **Parameters**:
  - `p_kind`: `'dawn' | 'dusk'`
  - `p_quality`: `0 | 1 | 2 | 3`
- **Returns**:
  ```ts
  | { status: 'ok'; kind: 'dawn' | 'dusk'; gain: number; in_window: boolean; dawn: number; dusk: number; cap: number }
  | { status: 'too_fast'; dawn: number; dusk: number }
  ```
- **Client Call Site**: `src/net/api.ts` (`gather`), `src/state/game.ts` (`gather`)

### `attempt_breakthrough()`
- **Parameters**: None
- **Returns**:
  ```ts
  | { status: 'ok'; realm: number; stage: number }
  | { status: 'not_ready'; need: number; dawn: number; dusk: number }
  | { status: 'sealed' }
  | { status: 'quest_required'; quest: string }
  ```
- **Client Call Site**: `src/net/api.ts` (`attemptBreakthrough`), `src/state/game.ts` (`attemptBreakthrough`)

### `start_retreat(p_minutes int)`
- **Parameters**: `p_minutes`: `15 | 60 | 240`
- **Returns**:
  ```ts
  | { status: 'started'; ready_at: string }
  | { status: 'already_active' }
  ```
- **Client Call Site**: `src/net/api.ts` (`startRetreat`), `src/state/game.ts` (`startRetreat`)

### `claim_retreat()`
- **Parameters**: None
- **Returns**:
  ```ts
  | { status: 'claimed'; gain: number; dawn: number; dusk: number; cap: number }
  | { status: 'not_ready'; seconds_left: number; ready_at: string }
  | { status: 'none' }
  ```
- **Client Call Site**: `src/net/api.ts` (`claimRetreat`), `src/state/game.ts` (`claimRetreat`)

### `report_reach(p_spot text)`
- **Parameters**: `p_spot`: string (`SpotId` e.g. `'gate'`, `'breath-pool'`)
- **Returns**: `void`
- **Client Call Site**: `src/net/api.ts` (`reportReach`), `src/state/game.ts` (`reportReach`)

### `save_position(p_area text, p_pos jsonb)`
- **Parameters**:
  - `p_area`: string (`'dawn-terrace' | 'still-garden' | 'falls-of-light'`)
  - `p_pos`: `{ x: number, y: number, z: number, ry: number }`
- **Returns**: `void`
- **Client Call Site**: `src/net/api.ts` (`savePosition`), `src/net/positionSaver.ts` (`PositionSaver.executeSave`)

### `away_report()`
- **Parameters**: None
- **Returns**:
  ```ts
  | {
      status: 'ok';
      away_seconds: number;
      world_minutes_passed: number;
      world_minute: number;
      hour: number;
      npcs_now: Array<{ npc: string; name: string; area: string; spot: string; act: string }>;
      retreat: null | { ready: boolean; ready_at: string };
    }
  | { status: 'no_character' }
  ```
- **Execution Rule**: Must be called immediately after the character loads and **strictly before** the first `save_position` call.
- **Client Call Site**: `src/net/api.ts` (`awayReport`), `src/state/game.ts` (`loadInitialGameData`)

### `report_player(p_target text, p_reason text, p_note text)`
- **Parameters**: `p_target`: string, `p_reason`: string, `p_note`: string
- **Returns**: `void`
- **Client Call Site**: `src/net/api.ts` (`reportPlayer`)

### `send_feedback(p_message text)`
- **Parameters**: `p_message`: string
- **Returns**: `void`
- **Client Call Site**: `src/net/api.ts` (`sendFeedback`)

### `log_client_error(p_kind text, p_message text, p_ctx jsonb)`
- **Parameters**: `p_kind`: string, `p_message`: string, `p_ctx`: Record<string, unknown>
- **Returns**: `void`
- **Client Call Site**: `src/net/api.ts` (`logClientError`)

### `public_stats()`
- **Parameters**: None
- **Returns**: `{ characters: number, active_hour: number, world_minute: number }`
- **Client Call Site**: `src/net/api.ts` (`publicStats`)

### `delete_my_data()`
- **Parameters**: None
- **Returns**: `void` (cascades removal of player's character, quest states, memories, and timers)
- **Client Call Site**: `src/net/api.ts` (`deleteMyData`), `src/state/auth.ts` (`deleteMyData`)

### `world_now()`
- **Parameters**: None
- **Returns**: `string` (timestamptz)
- **Client Call Site**: `src/net/api.ts` (`worldNow`), `src/net/clockSync.ts` (`syncClockNow`)
