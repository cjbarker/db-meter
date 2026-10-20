import { zoneFor } from './dsp.js';
import { sortSessions } from './sessions.js';

const $ = (id) => document.getElementById(id);
const METER_MIN = 30;
const METER_MAX = 120;

export const els = {
  readout: $('readout'),
  unit: $('unit'),
  zone: $('zone'),
  zoneLive: $('zone-live'),
  bar: $('bar-fill'),
  statMin: $('stat-min'),
  statAvg: $('stat-avg'),
  statMax: $('stat-max'),
  statPeak: $('stat-peak'),
  status: $('status'),
  announce: $('announce'),
  name: $('session-name'),
  start: $('start'),
  discard: $('discard'),
  controls: $('settings'),
  offset: $('offset'),
  offsetValue: $('offset-value'),
  list: $('session-list'),
  empty: $('empty'),
  clear: $('clear-all'),
  storageNote: $('storage-note'),
  elapsed: $('elapsed'),
};

const fmt = (db) => (Number.isFinite(db) ? db.toFixed(1) : '--');

export function showStatus(message, kind = 'info') {
  els.status.textContent = message;
  els.status.dataset.kind = kind;
  els.status.hidden = !message;
}

export function announce(message) {
  els.announce.textContent = message;
}

export function setUnit(weighting) {
  els.unit.textContent = `dB(${weighting})`;
}

let lastZone = null;
let lastZoneAt = 0;

export function renderLevel(db) {
  const zone = zoneFor(db);
  els.readout.textContent = fmt(db);
  els.zone.textContent = zone.label;
  document.body.dataset.zone = zone.id;
  els.bar.style.transform = `scaleX(${Math.min(Math.max((db - METER_MIN) / (METER_MAX - METER_MIN), 0), 1)})`;
  // Screen-reader announcement of zone changes, at most once per second.
  const now = performance.now();
  if (zone.id !== lastZone && now - lastZoneAt > 1000) {
    els.zoneLive.textContent = zone.label;
    lastZone = zone.id;
    lastZoneAt = now;
  }
}

export function renderStats(stats, avg) {
  els.statMin.textContent = fmt(stats.min);
  els.statAvg.textContent = fmt(avg);
  els.statMax.textContent = fmt(stats.max);
  els.statPeak.textContent = fmt(stats.peak);
}

export function renderElapsed(ms) {
  const s = Math.floor(ms / 1000);
  els.elapsed.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function resetDisplay() {
  els.readout.textContent = '--';
  els.zone.textContent = '';
  els.zoneLive.textContent = '';
  lastZone = null;
  document.body.dataset.zone = 'idle';
  els.bar.style.transform = 'scaleX(0)';
  renderStats({ min: NaN, max: NaN, peak: NaN }, NaN);
  els.elapsed.textContent = '0:00';
}

export function setRunning(running) {
  els.start.textContent = running ? 'Stop' : 'Start';
  els.start.dataset.running = String(running);
  els.discard.hidden = !running;
  els.name.disabled = running;
  els.controls.querySelectorAll('input').forEach((i) => (i.disabled = running));
}

export function renderSessions(sessions, handlers) {
  const sorted = sortSessions(sessions);
  els.list.replaceChildren();
  els.empty.hidden = sorted.length > 0;
  els.clear.hidden = sorted.length === 0;

  sorted.forEach((s, i) => {
    const zone = zoneFor(s.maxDb);
    const li = document.createElement('li');
    li.className = 'session';
    li.dataset.zone = zone.id;

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `#${i + 1}`;

    const name = document.createElement('input');
    name.className = 'session-name-input';
    name.value = s.name;
    name.maxLength = 40;
    name.setAttribute('aria-label', 'Session name');
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
    name.addEventListener('blur', () => {
      if (name.value.trim() === s.name) return;
      handlers.rename(s.id, name.value);
    });

    const max = document.createElement('span');
    max.className = 'session-max';
    max.textContent = `${fmt(s.maxDb)} dB`;
    const label = document.createElement('span');
    label.className = 'zone-tag';
    label.textContent = zone.label;

    const dur = Math.round(s.durationMs / 1000);
    const meta = document.createElement('span');
    meta.className = 'session-meta';
    meta.textContent = `avg ${fmt(s.avgDb)} · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')} · dB(${s.weighting}) · ${s.speed === 'fast' ? 'Fast' : 'Slow'}`;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', `Delete ${s.name}`);
    del.addEventListener('click', () => handlers.remove(s.id));

    li.append(rank, name, max, label, meta, del);
    els.list.append(li);
  });
}
