import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanName, defaultName, finalizeSession, sortSessions, addSession, renameSession, removeSession,
} from '../src/sessions.js';
import { createStore } from '../src/store.js';

const rec = (id, maxDb, startedAt) => ({ id, name: id, startedAt, durationMs: 5000, maxDb, avgDb: 50, weighting: 'A', speed: 'fast', offset: 94 });

test('sorts by Max descending, ties by newest', () => {
  const list = [rec('a', 80, 1), rec('b', 90, 2), rec('c', 80, 3)];
  assert.deepEqual(sortSessions(list).map((s) => s.id), ['b', 'c', 'a']);
});

test('blank name becomes "Session N"', () => {
  assert.equal(cleanName('   ', defaultName(3)), 'Session 3');
});

test('names are trimmed and cut to 40 characters', () => {
  assert.equal(cleanName('  hi  ', 'x'), 'hi');
  assert.equal(cleanName('a'.repeat(60), 'x').length, 40);
});

test('sessions under 1 second are discarded', () => {
  const base = { id: 'x', name: 'x', startedAt: 0, maxDb: 60, avgDb: 50, weighting: 'A', speed: 'fast', offset: 94, samples: true };
  assert.equal(finalizeSession({ ...base, durationMs: 999 }), null);
  assert.ok(finalizeSession({ ...base, durationMs: 1000 }));
  assert.equal(finalizeSession({ ...base, durationMs: 5000, samples: false }), null);
});

test('past the cap the oldest by startedAt is dropped, not the lowest Max', () => {
  let list = [];
  for (let i = 0; i < 50; i++) list = addSession(list, rec(`s${i}`, 100 - i, i + 10));
  list = addSession(list, rec('new', 99, 1000)); // 51st
  assert.equal(list.length, 50);
  assert.ok(!list.some((s) => s.id === 's0')); // oldest (and highest Max) gone
  assert.ok(list.some((s) => s.id === 's49')); // lowest Max kept
});

test('rename with empty input keeps the old name; delete removes', () => {
  const list = [rec('a', 80, 1)];
  assert.equal(renameSession(list, 'a', '  ')[0].name, 'a');
  assert.equal(renameSession(list, 'a', 'Blender')[0].name, 'Blender');
  assert.equal(removeSession(list, 'a').length, 0);
});

test('store falls back to memory when sessionStorage throws', () => {
  const store = createStore(() => { throw new Error('blocked'); });
  assert.deepEqual(store.read('k', []), []);
  store.write('k', [1, 2]);
  assert.deepEqual(store.read('k', []), [1, 2]);
  assert.equal(store.persistent, false);
});

test('store round-trips through storage', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createStore(() => storage);
  store.write('k', { a: 1 });
  assert.deepEqual(store.read('k', null), { a: 1 });
  assert.equal(store.persistent, true);
});
