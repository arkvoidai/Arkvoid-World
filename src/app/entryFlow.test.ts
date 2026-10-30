import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePostBootstrapMode, shouldCreateGuestSession } from './entryFlow';

test('a persisted guest without a character returns to the world gate', () => {
  assert.equal(resolvePostBootstrapMode({ type: 'AUTH_READY', hasCharacter: false, character: null }), 'gate');
});

test('a returning character enters through the arrival rail', () => {
  assert.equal(resolvePostBootstrapMode({ type: 'AUTH_READY', hasCharacter: true, character: {} as never }), 'arrival');
});

test('a missing session returns to the world gate', () => {
  assert.equal(resolvePostBootstrapMode({ type: 'NO_SESSION' }), 'gate');
});

test('guest and member sessions are reused rather than creating another guest identity', () => {
  assert.equal(shouldCreateGuestSession('guest'), false);
  assert.equal(shouldCreateGuestSession('member'), false);
  assert.equal(shouldCreateGuestSession('signed-out'), true);
  assert.equal(shouldCreateGuestSession('loading'), true);
});
