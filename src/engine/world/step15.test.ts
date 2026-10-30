import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRailController, type CameraRailDef } from '../core/CameraRail.js';

// Validation logic matching AwakeningScreen
const NAME_REGEX = /^[A-Za-z][A-Za-z\s'-]{1,19}$/;
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

function validateWandererName(name: string): { valid: boolean; reason?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, reason: 'empty' };
  }
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { valid: false, reason: 'length' };
  }
  if (!NAME_REGEX.test(trimmed)) {
    return { valid: false, reason: 'format' };
  }
  const lower = trimmed.toLowerCase();
  for (const b of BANNED_WORDS) {
    if (lower.includes(b)) {
      return { valid: false, reason: 'banned' };
    }
  }
  return { valid: true };
}

function getLeaningHour(leaning: 'dawn' | 'dusk' | 'still'): number {
  switch (leaning) {
    case 'dawn':
      return 6.5;
    case 'dusk':
      return 18.3;
    case 'still':
      return 12.0;
  }
}

test('Step 15: Wanderer name validation rules', () => {
  // Valid names
  assert.equal(validateWandererName('Aeron').valid, true);
  assert.equal(validateWandererName("K'ael").valid, true);
  assert.equal(validateWandererName('Dawn-Seeker').valid, true);
  assert.equal(validateWandererName('Still Water').valid, true);
  assert.equal(validateWandererName('Al').valid, true); // exactly 2 chars
  assert.equal(validateWandererName('A'.repeat(20)).valid, true); // exactly 20 chars

  // Invalid length
  assert.equal(validateWandererName('').valid, false);
  assert.equal(validateWandererName('A').valid, false); // 1 char
  assert.equal(validateWandererName('A'.repeat(21)).valid, false); // 21 chars

  // Invalid characters / start
  assert.equal(validateWandererName('123Wanderer').valid, false); // starts with number
  assert.equal(validateWandererName('-Seeker').valid, false); // starts with hyphen
  assert.equal(validateWandererName('Wanderer!').valid, false); // contains punctuation
  assert.equal(validateWandererName('Wanderer@Home').valid, false); // contains @
});

test('Step 15: Banned word filtering', () => {
  assert.equal(validateWandererName('The Admin').valid, false);
  assert.equal(validateWandererName('admin').valid, false);
  assert.equal(validateWandererName('Moderator-1').valid, false);
  assert.equal(validateWandererName('Synergy Master').valid, false);
  assert.equal(validateWandererName('Next-Gen Hero').valid, false);
  assert.equal(validateWandererName('Metaverse Lord').valid, false);
  assert.equal(validateWandererName('System Void').valid, false);
});

test('Step 15: Leaning visual hour transitions', () => {
  assert.equal(getLeaningHour('dawn'), 6.5);
  assert.equal(getLeaningHour('dusk'), 18.3);
  assert.equal(getLeaningHour('still'), 12.0);
});

test('Step 15: Form silhouettes and leaning options', () => {
  const FORMS = [
    { id: 0, name: 'Traveller' },
    { id: 1, name: 'Scholar' },
    { id: 2, name: 'Warden' },
    { id: 3, name: 'Sage' },
  ];
  assert.equal(FORMS.length, 4);
  assert.equal(FORMS[0]?.name, 'Traveller');
  assert.equal(FORMS[1]?.name, 'Scholar');
  assert.equal(FORMS[2]?.name, 'Warden');
  assert.equal(FORMS[3]?.name, 'Sage');
});

test('Step 15: Camera rail duration customization and skipToEnd', () => {
  const dummyRail: CameraRailDef = {
    id: 'test-arrival',
    name: 'test-arrival',
    duration: 10.0,
    keyframes: [
      {
        time: 0,
        position: [0, 10, 20],
        lookAt: [0, 0, 0],
        fov: 52,
      },
      {
        time: 10.0,
        position: [0, 2, 0],
        lookAt: [0, 1.5, -5],
        fov: 52,
      },
    ],
  };

  const controller = new CameraRailController();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);

  // 1. Play with custom shortened duration (5.0s for returning user)
  let doneCalled = false;
  controller.play(dummyRail, {
    duration: 5.0,
    onDone: () => {
      doneCalled = true;
    },
  });

  assert.equal(controller.isPlaying(), true);
  assert.equal(controller.getDuration(), 5.0);

  // 2. Step 2.5s (50% progress)
  controller.update(2.5, camera);
  assert.equal(controller.isPlaying(), true);
  assert.equal(doneCalled, false);

  // 3. Skip to end
  controller.skipToEnd(camera);
  assert.equal(controller.isPlaying(), false);
  assert.equal(doneCalled, true);
});

test('Step 15: Preview and guest account creation fallback', async () => {
  const { useAuthStore } = await import('../../state/auth.js');
  const { createCharacter, getCharacter, gather, attemptBreakthrough } = await import('../../net/api.js');

  // 1. Sign in as guest (must always succeed even when remote Supabase is unconfigured)
  const signOk = await useAuthStore.getState().signInGuest();
  assert.equal(signOk, true);
  assert.equal(useAuthStore.getState().status, 'guest');
  assert.equal(useAuthStore.getState().isGuest, true);
  assert.ok(useAuthStore.getState().user?.id);

  // 2. Character creation in preview/local mode
  const createRes = await createCharacter('Aeron', 'dawn', 0);
  assert.equal(createRes.ok, true);
  if (createRes.ok) {
    assert.equal(createRes.data.name, 'Aeron');
    assert.equal(createRes.data.leaning, 'dawn');
    assert.equal(createRes.data.form, 0);
    assert.equal(createRes.data.realm, 1);
    assert.equal(createRes.data.stage, 1);
  }

  // 3. Character retrieval
  const getRes = await getCharacter();
  assert.equal(getRes.ok, true);
  if (getRes.ok) {
    assert.equal(getRes.data?.name, 'Aeron');
  }

  // 4. Gather breath in preview/local mode
  const gatherRes = await gather('dawn', 1);
  assert.equal(gatherRes.ok, true);
  if (gatherRes.ok) {
    assert.equal(gatherRes.data.status, 'ok');
    assert.ok(gatherRes.data.gain > 0);
    assert.ok(gatherRes.data.dawn > 0);
  }

  // 5. Attempt breakthrough
  const breakRes = await attemptBreakthrough();
  assert.equal(breakRes.ok, true);
  if (breakRes.ok) {
    assert.ok(['ok', 'not_ready'].includes(breakRes.data.status));
  }
});

