// Pure session helpers: naming, finalizing, ranking, cap.

export const MAX_SESSIONS = 50;
export const MIN_DURATION_MS = 1000;
export const MAX_NAME_LENGTH = 40;

export function cleanName(name, fallback) {
  const trimmed = String(name ?? '').trim().slice(0, MAX_NAME_LENGTH).trim();
  return trimmed || fallback;
}

export function defaultName(n) {
  return `Session ${n}`;
}

// Returns a record, or null if the session was too short or had no samples.
export function finalizeSession({ id, name, startedAt, durationMs, maxDb, avgDb, weighting, speed, offset, samples }) {
  if (durationMs < MIN_DURATION_MS || !samples) return null;
  return { id, name, startedAt, durationMs, maxDb, avgDb, weighting, speed, offset };
}

// Descending by Max; ties broken by newest first.
export function sortSessions(list) {
  return [...list].sort((a, b) => b.maxDb - a.maxDb || b.startedAt - a.startedAt);
}

// Adds a record; past the cap, drops the oldest by startedAt (not the lowest Max).
export function addSession(list, record, cap = MAX_SESSIONS) {
  const next = [...list, record];
  while (next.length > cap) {
    let oldest = 0;
    for (let i = 1; i < next.length; i++) if (next[i].startedAt < next[oldest].startedAt) oldest = i;
    next.splice(oldest, 1);
  }
  return next;
}

// Empty input keeps the previous name.
export function renameSession(list, id, name) {
  return list.map((s) => (s.id === id ? { ...s, name: cleanName(name, s.name) } : s));
}

export function removeSession(list, id) {
  return list.filter((s) => s.id !== id);
}
