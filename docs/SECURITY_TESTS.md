# Arkvoid Manual Security Tests · Step 14

These tests verify Row-Level Security (RLS) enforcement and function permission boundaries across two separate browser instances running as independent guests or authenticated users.

To execute these tests, ensure you open dev builds with `?auth=1` (e.g. `http://localhost:5173/?auth=1` or `https://world.arkvoid.com/?auth=1`) which exposes `window.__ark`.

---

## Preparation
1. Open **Browser 1** (or regular window) at `/?auth=1`.
2. Open **Browser 2** (or Incognito / second profile) at `/?auth=1`.
3. In both browsers, sign in as a guest or member and ensure a character is created.

---

### Test (a): User B selecting User A's characters row returns zero rows
**Purpose**: Confirm that Row-Level Security isolates player rows so one wanderer cannot inspect another wanderer's row.
**In Browser 1**:
```js
// Get Browser 1 User ID
const { data: { user } } = await window.__ark.getSupabase().auth.getUser();
console.log('User A ID:', user.id);
```
**In Browser 2 (User B)**:
```js
// Replace '<USER_A_ID>' with the actual UUID from Browser 1
const userAId = '<USER_A_ID>';
const { data, error } = await window.__ark.getSupabase()
  .from('characters')
  .select('*')
  .eq('user_id', userAId);
console.log('Result:', { data, error });
```
**Expected**: `data` is empty array `[]` (0 rows returned) and `error` is `null`.

---

### Test (b): Direct INSERT, UPDATE, and DELETE on `characters` from the browser console are rejected
**Purpose**: Confirm that direct client table mutation is blocked by RLS policies; mutations must strictly route through authenticated RPCs.
**Console Snippet**:
```js
const client = window.__ark.getSupabase();
const { data: { user } } = await client.auth.getUser();

// 1. Direct Insert Attempt
const insertRes = await client.from('characters').insert({
  user_id: user.id,
  name: 'Hacker',
  leaning: 'dawn',
  form: 0,
  realm: 1,
  stage: 1,
  dawn: 9999,
  dusk: 9999,
  area: 'dawn-terrace',
  pos: { x: 0, y: 0, z: 0, ry: 0 }
});
console.log('Direct INSERT:', insertRes.error ? 'REJECTED: ' + insertRes.error.message : 'FAILED (ALLOWED)');

// 2. Direct Update Attempt
const updateRes = await client.from('characters')
  .update({ dawn: 99999 })
  .eq('user_id', user.id);
console.log('Direct UPDATE:', updateRes.error ? 'REJECTED: ' + updateRes.error.message : 'FAILED (ALLOWED)');

// 3. Direct Delete Attempt
const deleteRes = await client.from('characters')
  .delete()
  .eq('user_id', user.id);
console.log('Direct DELETE:', deleteRes.error ? 'REJECTED: ' + deleteRes.error.message : 'FAILED (ALLOWED)');
```
**Expected**: All operations return errors indicating policy violation or permission denied (`new row violates row-level security policy` or 0 rows modified).

---

### Test (c): Calling `quest_progress`, `llm_take`, or `match_memories` returns permission denied
**Purpose**: Confirm that unexposed or internal backend RPCs cannot be invoked from the client.
**Console Snippet**:
```js
const client = window.__ark.getSupabase();

// 1. Calling internal quest_progress
const qRes = await client.rpc('quest_progress', { p_quest: 'test', p_step: 1 });
console.log('quest_progress:', qRes.error?.message);

// 2. Calling internal llm_take
const lRes = await client.rpc('llm_take', { p_tokens: 100 });
console.log('llm_take:', lRes.error?.message);

// 3. Calling internal match_memories
const mRes = await client.rpc('match_memories', { p_vector: [] });
console.log('match_memories:', mRes.error?.message);
```
**Expected**: All three calls return Postgres permission denied / function not found errors.

---

### Test (d): Gather twice within 10 s returns `too_fast`
**Purpose**: Verify the server-side rate-limiting and cooldown enforcement on Breath gathering.
**Console Snippet**:
```js
const { api } = window.__ark;

const res1 = await api.gather('dawn', 1);
console.log('First gather:', res1);

const res2 = await api.gather('dawn', 1);
console.log('Immediate second gather:', res2);
```
**Expected**:
- First gather returns `{ ok: true, data: { status: 'ok', gain: ..., dawn: ... } }`.
- Second immediate gather returns `{ ok: true, data: { status: 'too_fast', dawn: ..., dusk: ... } }`.

---

### Test (e): `create_character` with a bad name is rejected
**Purpose**: Validate name length and content validation server-side.
**Console Snippet**:
```js
const { api } = window.__ark;

// 1 char name (under min length 2)
const resShort = await api.createCharacter('A', 'dawn', 0);
console.log('Short name result:', resShort);

// Oversized name (> 24 chars)
const resLong = await api.createCharacter('ThisNameIsFarTooLongForArkvoidRealm', 'dusk', 1);
console.log('Long name result:', resLong);
```
**Expected**: Both return `{ ok: false, error: { code: 'VALIDATION', message: 'Choose a name between 2 and 24 characters.' } }`.

---

### Test (f): `save_position` with an unknown area is rejected
**Purpose**: Verify area bounds validation against valid islands (`dawn-terrace`, `still-garden`, `falls-of-light`).
**Console Snippet**:
```js
const { api } = window.__ark;

const res = await api.savePosition('forbidden-sanctuary', { x: 0, y: 0, z: 0, ry: 0 });
console.log('Unknown area result:', res);
```
**Expected**: Returns `{ ok: false, error: { code: 'VALIDATION', message: 'This area lies beyond reachable ground.' } }`.

---

### Test (g): Selecting `llm_usage` returns zero rows
**Purpose**: Confirm that administrative or internal tables like `llm_usage` have no read permissions for players.
**Console Snippet**:
```js
const client = window.__ark.getSupabase();
const { data, error } = await client.from('llm_usage').select('*');
console.log('llm_usage:', { data, error });
```
**Expected**: `data` is empty or `error` is returned with permission denied.
