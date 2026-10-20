// Pure DSP helpers. No DOM or Web Audio dependencies, so they run under Node.

export const TAU = { fast: 0.125, slow: 1.0 };
export const POWER_FLOOR = 1e-20;
export const ZONE_QUIET_MAX = 70;
export const ZONE_LOUD_MAX = 85;

export function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function toDbfs(rmsValue) {
  return 20 * Math.log10(Math.max(rmsValue, 1e-10));
}

// Mean-square power to approximate dB SPL; never below 0 dB.
export function powerToDb(power, offset) {
  return Math.max(0, 10 * Math.log10(Math.max(power, POWER_FLOOR)) + offset);
}

export function alphaFor(dt, tau) {
  return 1 - Math.exp(-dt / tau);
}

// Exponential average in the power domain.
export function smoothPower(prev, instant, alpha) {
  return prev + alpha * (instant - prev);
}

export function zoneFor(db) {
  if (db < ZONE_QUIET_MAX) return { id: 'quiet', label: 'Quiet' };
  if (db <= ZONE_LOUD_MAX) return { id: 'loud', label: 'Loud' };
  return { id: 'very-loud', label: 'Very loud' };
}

export function createStats() {
  return { min: Infinity, max: -Infinity, peak: -Infinity, energy: 0, time: 0 };
}

// db: time-weighted level, instDb: unsmoothed level, power: unsmoothed mean square.
export function updateStats(stats, { db, instDb, power, dt }) {
  if (db < stats.min) stats.min = db;
  if (db > stats.max) stats.max = db;
  if (instDb > stats.peak) stats.peak = instDb;
  stats.energy += power * dt;
  stats.time += dt;
  return stats;
}

// Energy average (Leq) in dB.
export function avgDb(stats, offset) {
  if (stats.time <= 0) return 0;
  return powerToDb(stats.energy / stats.time, offset);
}

// ---- A-weighting (IEC 61672 pole frequencies) as three biquad IIR sections ----

const A_POLES = { f1: 20.598997, f2: 107.65265, f3: 737.86223, f4: 12194.217 };

// Digital biquad for numerator `num` over (s+a)(s+b), bilinear with prewarped poles.
function section(fa, fb, fs, highpass) {
  const a = Math.tan((Math.PI * fa) / fs);
  const b = Math.tan((Math.PI * fb) / fs);
  const a0 = (1 + a) * (1 + b);
  const a1 = (1 + a) * (b - 1) + (a - 1) * (1 + b);
  const a2 = (a - 1) * (b - 1);
  const num = highpass ? [1, -2, 1] : [a * b, 2 * a * b, a * b];
  return { b: num.map((v) => v / a0), a: [1, a1 / a0, a2 / a0] };
}

export function sectionMagnitude(sec, freq, fs) {
  const w = (2 * Math.PI * freq) / fs;
  const ev = (c) => {
    let re = 0;
    let im = 0;
    c.forEach((v, k) => {
      re += v * Math.cos(k * w);
      im -= v * Math.sin(k * w);
    });
    return [re, im];
  };
  const [nr, ni] = ev(sec.b);
  const [dr, di] = ev(sec.a);
  return Math.hypot(nr, ni) / Math.hypot(dr, di);
}

// Cascade of sections whose overall gain is 0 dB at 1 kHz.
export function aWeightingSections(fs) {
  const secs = [
    section(A_POLES.f1, A_POLES.f1, fs, true),
    section(A_POLES.f2, A_POLES.f3, fs, true),
    section(A_POLES.f4, A_POLES.f4, fs, false),
  ];
  const gain = secs.reduce((g, s) => g * sectionMagnitude(s, 1000, fs), 1);
  secs[2].b = secs[2].b.map((v) => v / gain);
  return secs;
}

export function aWeightingDb(secs, freq, fs) {
  const mag = secs.reduce((g, s) => g * sectionMagnitude(s, freq, fs), 1);
  return 20 * Math.log10(mag);
}
