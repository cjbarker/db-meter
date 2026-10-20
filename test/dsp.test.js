import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rms, toDbfs, powerToDb, alphaFor, smoothPower, zoneFor, TAU,
  createStats, updateStats, avgDb, aWeightingSections, aWeightingDb,
} from '../src/dsp.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('RMS of a full-scale sine is 0.707 (-3.01 dBFS)', () => {
  const n = 48000;
  const x = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / n));
  near(rms(x), Math.SQRT1_2, 1e-3);
  near(toDbfs(rms(x)), -3.01, 0.01);
});

test('silence clamps to a finite floor', () => {
  assert.ok(Number.isFinite(toDbfs(0)));
  assert.equal(powerToDb(0, 94), 0);
});

test('time weighting converges to a step input', () => {
  const dt = TAU.fast / 10;
  let p = 0;
  for (let i = 0; i < 10; i++) p = smoothPower(p, 1, alphaFor(dt, TAU.fast));
  near(p, 1 - Math.exp(-1), 1e-9); // 63.2% after exactly one tau
  for (let i = 0; i < 90; i++) p = smoothPower(p, 1, alphaFor(dt, TAU.fast));
  near(p, 1, 0.001);
});

test('alpha is independent of frame rate', () => {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 60; i++) a = smoothPower(a, 1, alphaFor(1 / 60, TAU.slow));
  for (let i = 0; i < 30; i++) b = smoothPower(b, 1, alphaFor(1 / 30, TAU.slow));
  near(a, b, 1e-9);
});

test('Leq of a constant signal equals that level', () => {
  const stats = createStats();
  const power = 1e-4;
  for (let i = 0; i < 100; i++) updateStats(stats, { db: 0, instDb: 0, power, dt: 0.016 });
  near(avgDb(stats, 94), powerToDb(power, 94), 1e-9);
});

test('stats track min, max and peak', () => {
  const s = createStats();
  updateStats(s, { db: 50, instDb: 52, power: 1, dt: 0.1 });
  updateStats(s, { db: 80, instDb: 95, power: 1, dt: 0.1 });
  updateStats(s, { db: 60, instDb: 61, power: 1, dt: 0.1 });
  assert.equal(s.min, 50);
  assert.equal(s.max, 80);
  assert.equal(s.peak, 95);
});

test('zone boundaries', () => {
  assert.equal(zoneFor(69.9).id, 'quiet');
  assert.equal(zoneFor(70).id, 'loud');
  assert.equal(zoneFor(85).id, 'loud');
  assert.equal(zoneFor(85.1).id, 'very-loud');
});

for (const fs of [44100, 48000]) {
  test(`A-weighting matches reference at ${fs} Hz`, () => {
    const secs = aWeightingSections(fs);
    near(aWeightingDb(secs, 1000, fs), 0, 0.05);
    near(aWeightingDb(secs, 100, fs), -19.1, 1);
    near(aWeightingDb(secs, 10000, fs), -2.5, 1);
  });
}
