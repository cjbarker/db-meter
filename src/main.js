import { MicMeter } from './audio.js';
import { HistoryGraph } from './graph.js';
import { TAU, alphaFor, smoothPower, powerToDb, createStats, updateStats, avgDb } from './dsp.js';
import { cleanName, defaultName, finalizeSession, addSession, renameSession, removeSession } from './sessions.js';
import { createStore } from './store.js';
import {
  els, showStatus, announce, setUnit, renderLevel, renderStats, renderElapsed,
  resetDisplay, setRunning, renderSessions,
} from './ui.js';

const SESSIONS_KEY = 'dbmeter.sessions.v1';
const COUNTER_KEY = 'dbmeter.counter.v1';
const MAX_FRAME_DT = 0.25;
const GRAPH_INTERVAL = 0.1;

const store = createStore(() => sessionStorage);
const meter = new MicMeter();
const graph = new HistoryGraph(document.getElementById('graph'));

let sessions = store.read(SESSIONS_KEY, []);
let session = null; // live session state while running
let starting = false;
let raf = 0;

const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

function persist() {
  store.write(SESSIONS_KEY, sessions);
  els.storageNote.hidden = store.persistent;
}

const handlers = {
  rename(id, name) {
    sessions = renameSession(sessions, id, name);
    persist();
    renderSessions(sessions, handlers);
  },
  remove(id) {
    sessions = removeSession(sessions, id);
    persist();
    renderSessions(sessions, handlers);
  },
};

function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min((t - session.lastT) / 1000, MAX_FRAME_DT);
  session.lastT = t;
  if (dt <= 0) return;

  const power = meter.readPower();
  session.pSmooth =
    session.pSmooth === null ? power : smoothPower(session.pSmooth, power, alphaFor(dt, TAU[session.speed]));
  const db = powerToDb(session.pSmooth, session.offset);
  const instDb = powerToDb(power, session.offset);
  updateStats(session.stats, { db, instDb, power, dt });

  renderLevel(db);
  renderStats(session.stats, avgDb(session.stats, session.offset));
  renderElapsed(Date.now() - session.startedAt);

  session.graphAcc += dt;
  while (session.graphAcc >= GRAPH_INTERVAL) {
    session.graphAcc -= GRAPH_INTERVAL;
    graph.push(db);
  }
}

function startLoop() {
  session.lastT = performance.now();
  raf = requestAnimationFrame(frame);
}

async function start() {
  if (session || starting) return;
  showStatus('');
  starting = true;
  els.start.disabled = true;

  const weighting = radio('weighting');
  const speed = radio('speed');
  const offset = Number(els.offset.value);

  let settings;
  try {
    settings = await meter.start(weighting);
  } catch (err) {
    meter.stop();
    showStatus(errorMessage(err), 'error');
    starting = false;
    els.start.disabled = false;
    return;
  }
  starting = false;
  els.start.disabled = false;

  if (settings.echoCancellation || settings.noiseSuppression || settings.autoGainControl) {
    showStatus('This browser kept noise suppression or gain control on, so readings may be less accurate.', 'warn');
  }

  const counter = store.read(COUNTER_KEY, 0) + 1;
  store.write(COUNTER_KEY, counter);

  meter.onEnded = () => endSession(true, 'Microphone disconnected.');
  session = {
    name: cleanName(els.name.value, defaultName(counter)),
    startedAt: Date.now(),
    weighting,
    speed,
    offset,
    stats: createStats(),
    pSmooth: null,
    graphAcc: 0,
    lastT: 0,
  };
  setUnit(weighting);
  setRunning(true);
  graph.clear();
  startLoop();
}

function endSession(save, notice) {
  if (!session) return;
  cancelAnimationFrame(raf);
  const s = session;
  session = null;
  meter.stop();
  setRunning(false);
  resetDisplay();
  graph.clear();
  els.name.value = '';

  if (save) {
    const record = finalizeSession({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: s.name,
      startedAt: s.startedAt,
      durationMs: Date.now() - s.startedAt,
      maxDb: s.stats.max,
      avgDb: avgDb(s.stats, s.offset),
      weighting: s.weighting,
      speed: s.speed,
      offset: s.offset,
      samples: s.stats.time > 0,
    });
    if (record) {
      sessions = addSession(sessions, record);
      persist();
      renderSessions(sessions, handlers);
      announce(`Saved ${record.name}, ${record.maxDb.toFixed(1)} dB`);
    }
  }
  showStatus(notice ?? '', notice ? 'warn' : 'info');
}

function errorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied. Allow it in your browser settings, then tap Start again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone found.';
    default:
      return 'Could not start the microphone.';
  }
}

// Pause drawing while hidden; keep the stream and resume the context on return.
document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.hidden) {
    cancelAnimationFrame(raf);
  } else {
    meter.resume();
    startLoop();
  }
});

els.start.addEventListener('click', () => (session ? endSession(true) : start()));
els.discard.addEventListener('click', () => endSession(false));
els.clear.addEventListener('click', () => {
  if (!confirm('Delete all saved sessions?')) return;
  sessions = [];
  persist();
  renderSessions(sessions, handlers);
});
els.offset.addEventListener('input', () => {
  const v = Number(els.offset.value);
  els.offsetValue.textContent = `${v > 0 ? '+' : ''}${v} dB`;
});
document.querySelectorAll('input[name="weighting"]').forEach((r) =>
  r.addEventListener('change', () => setUnit(radio('weighting'))),
);

// Init
resetDisplay();
setUnit(radio('weighting'));
setRunning(false);
renderSessions(sessions, handlers);
els.storageNote.hidden = store.persistent;

if (!window.isSecureContext) {
  showStatus('The microphone needs a secure connection. Open this page over HTTPS or on localhost.', 'error');
  els.start.disabled = true;
} else if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
  showStatus('This browser does not support microphone audio capture.', 'error');
  els.start.disabled = true;
}
