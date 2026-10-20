# dB Meter: Technical Specification

Status: Confirmed. All decisions below were accepted in the second grill-me round. Casual-use audience only (no compliance use). Hosting is out of scope beyond documenting the HTTPS requirement.

## 1. Goal

A web app that measures sound level in decibels with the device's built-in microphone, entirely in the browser.

## 2. Decisions

| # | Topic | Decision |
|---|-------|----------|
| Q1 | Unit | Approximate dB SPL, computed as dBFS plus a calibration offset (default +94). The user can adjust the offset with a slider. The UI labels the reading "approximate". |
| Q2 | Weighting | A-weighting by default, shown as dB(A). A toggle switches to flat (Z), shown as dB(Z). |
| Q3 | Stack | Vanilla HTML, CSS and JS with ES modules. It uses the Web Audio API, has no build step and no runtime dependencies, and can be served by any static host. |
| Q4 | Features | Live number, bar meter, min/avg/max/peak stats, Fast/Slow time weighting, scrolling history graph, named sessions ranked by highest level (section 5.1). |
| Q5 | Privacy | All processing is local. No audio is stored or transmitted, and there are no analytics or network calls. Only session summary numbers are kept, in `sessionStorage`, and they are cleared when the tab closes. The UI says so. |
| Q6 | Devices | Mobile-first and responsive. Works on current Chrome, Safari and Firefox. Requires a secure context (HTTPS or localhost). |
| Q7 | Look | High-contrast UI that follows the system light/dark setting. It shows a large readout with color zones and text labels. |

| S1 | Session storage | `sessionStorage`, so results vanish when the tab closes. A "Clear all" button also empties it. |
| S2 | Session definition | Start to Stop. Optional name before Start, renamable afterward. |
| S3 | Ranking value | The session's Max, the highest time-weighted reading. Peak stays a live stat only. |
| S4 | Settings lock | Weighting, speed and calibration offset are locked while a session runs and are saved with the session. |
| S5 | Saved fields | Name, start time, duration, Max, Avg (Leq), weighting, speed, offset. No graph samples. |
| S6 | Session list | Sorted by Max descending, ties broken by newest. Rename, delete and Clear all. Capped at 50, dropping the oldest. |
| S7 | Save/discard | Saves on Stop and when the mic track ends. Sessions under 1 second are discarded. A session abandoned by closing the tab is lost. |
| S8 | Reset | The Reset button becomes "Discard session", which stops without saving. |

Out of scope for v1: recording audio, exporting data, persistence beyond the browser tab, accounts, and PWA/offline support.

## 3. Architecture

```
db-meter/
  index.html        markup, permission screen, meter UI
  styles.css        theme tokens, layout, color zones
  src/
    main.js         wiring: UI events, render loop
    audio.js        mic capture, filter chain, level sampling
    dsp.js          pure functions: RMS, dB conversion, time weighting, stats
    graph.js        canvas history graph
    ui.js           DOM updates, zone classification
    sessions.js     pure functions: session lifecycle, ranking, cap, naming
    store.js        sessionStorage read/write with in-memory fallback
  test/
    dsp.test.js     unit tests for dsp.js (node:test)
    sessions.test.js  unit tests for sessions.js
  README.md         run, deploy and calibration notes
```

`dsp.js` has no DOM or Web Audio dependencies, so it can be tested in Node.

## 4. Audio pipeline

```
getUserMedia -> MediaStreamSource -> [A-weighting filters | bypass] -> AnalyserNode
```

- **Capture:** `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`. Browser DSP would distort the level, so all three are off. Support varies by browser, so the app reads `track.getSettings()` and shows a notice if any of them is still on.
- **AudioContext:** created on the user's tap, because of autoplay policy. The app calls `resume()` if the context is suspended, for example after a tab switch on iOS.
- **Analyser:** `fftSize = 2048`, `smoothingTimeConstant = 0`. The app reads time-domain floats with `getFloatTimeDomainData`.
- **Sampling:** on each `requestAnimationFrame`, the app computes the block RMS: `rms = sqrt(mean(x²))`.
- **dBFS:** `dBFS = 20 * log10(max(rms, 1e-10))`.
- **dB SPL (approximate):** `dB = dBFS + offset`, where `offset` defaults to 94 and ranges from 60 to 130.

### A-weighting

A-weighting is built as a cascade of `BiquadFilterNode`s that approximates IEC 61672 at the context sample rate:

- High-pass at about 20.6 Hz, 2nd order, applied twice
- High-pass at about 12.2 kHz, 2nd order, low-pass equivalent
- Band shaping at about 107.7 Hz and 737.9 Hz
- Gain normalised to 0 dB at 1 kHz

The implementation must be checked against reference A-weighting values at 100 Hz, 1 kHz and 10 kHz, within ±1 dB. If the biquad cascade can't meet that, the app computes the weighting from FFT bins using the A-weighting curve instead. When the toggle is set to Z, the filter chain is bypassed.

### Time weighting

An exponential average is applied to the **power** domain, not to dB:

```
p_smooth += alpha * (p_instant - p_smooth)
alpha = 1 - exp(-dt / tau)     tau = 0.125 s (Fast) | 1.0 s (Slow)
```

`dt` is the real elapsed time between frames, so the result doesn't depend on the display refresh rate.

### Statistics

| Stat | Definition |
|------|------------|
| Min / Max | Lowest and highest time-weighted reading since reset |
| Avg | Energy average (Leq): `10 * log10(mean(p))` over the same window |
| Peak | Highest instantaneous (unsmoothed) block level since reset |

The stats are scoped to the current session. They start fresh at Start and are cleared when the session ends. Weighting, speed and offset can't change mid-session (see 5.1), so the stats never mix settings. When no session is running, the mic is off, the controls are unlocked and the readout shows "--".

## 5. UI

- **Readout:** a large number, one decimal place, with the unit `dB(A)` or `dB(Z)` and an "approx." tag.
- **Bar meter:** horizontal on mobile, spanning 30 to 120 dB.
- **Zones:**

  | Range (dB) | Label | Color token |
  |------------|-------|-------------|
  | < 70 | Quiet / Normal | green |
  | 70 to 85 | Loud | amber |
  | > 85 | Very loud | red |

  Zones are always shown as text as well as color. The zone label has `aria-live="polite"` and is throttled to announce at most once per second.
- **Controls:** session name field, Start/Stop, Discard session (visible while running), weighting toggle (A / Z), speed toggle (Fast / Slow), and a calibration slider inside a collapsible panel. The toggles and slider are disabled while a session runs.
- **History graph:** a canvas line graph of the last 60 seconds, sampled at 10 Hz, with horizontal lines at the zone thresholds. It is HiDPI-aware.
- **Theme:** CSS custom properties on `:root`, overridden under `@media (prefers-color-scheme: light)`. The color-zone text and bar colors must meet WCAG AA contrast (4.5:1) in both themes.
- **Layout:** a single column at phone width, a 16px side gutter, and no horizontal scroll. Touch targets are at least 44px.
- **Privacy note:** a message on the permission screen: "Audio is never recorded or sent anywhere. Session summaries stay in this browser tab and are cleared when you close it."

## 5.1 Sessions

**Lifecycle**

1. Before Start, the user can type a name (trimmed, max 40 characters). If blank, the name defaults to "Session N". N counts sessions started in this tab and is never reused, even after a delete.
2. Start begins the session and locks weighting, speed and offset.
3. Stop ends the session and saves it. Discard session ends it without saving.
4. If the mic track ends mid-session (for example, a headset is unplugged), the session is saved as if the user had pressed Stop.
5. Sessions shorter than 1 second are discarded without a notice.
6. Closing or reloading the tab mid-session loses the in-progress session.

**Ranking:** by the session's Max, the highest time-weighted reading, in descending order. Ties are broken by newest `startedAt` first. Sessions recorded with different weighting or offset are compared by their raw numbers. Each row shows its settings badge (for example, "dB(A) · Fast") so the difference is visible.

**Record**

```json
{
  "id": "uuid",
  "name": "Kitchen blender",
  "startedAt": 1760000000000,
  "durationMs": 45000,
  "maxDb": 91.4,
  "avgDb": 78.2,
  "weighting": "A",
  "speed": "fast",
  "offset": 94
}
```

**Storage:** `sessionStorage` under the key `dbmeter.sessions.v1`, holding a JSON array. When the list exceeds 50 entries, the oldest by `startedAt` is dropped. Every read and write is wrapped in try/catch. If storage is unavailable or full, `store.js` falls back to an in-memory list and the UI shows "Results can't be saved in this browser and will be lost on reload". Nothing is written to `localStorage`, cookies or IndexedDB.

**List UI**

- Each row shows the rank, name, Max with its zone color and text label, duration, avg and the settings badge.
- Rename is inline: tap the name, edit it, then press Enter or blur to save. Empty input restores the previous name.
- Delete removes one session. Clear all asks for confirmation first.
- With no sessions, the list shows an empty state: "No sessions yet. Start one to see it here."
- The list updates immediately when a session ends. A new entry is announced through an `aria-live="polite"` region ("Saved Kitchen blender, 91.4 dB").

## 6. States and error handling

| State | Behavior |
|-------|----------|
| Idle | Start button and privacy note. No mic access yet. |
| Requesting | Waits for the browser permission prompt. |
| Running | Live readout and graph. |
| Denied (`NotAllowedError`) | Message explaining how to re-enable the mic in browser settings, with a Retry button. |
| No mic (`NotFoundError`) | "No microphone found." |
| Insecure context | Message that HTTPS is required. Checked up front through `window.isSecureContext`. |
| Unsupported | Message when `navigator.mediaDevices.getUserMedia` or `AudioContext` is missing. |
| Track ended (device unplugged) | Save the session if it ran for at least 1 second, return to idle and show a notice. |
| Storage unavailable or full | Keep sessions in memory only and show the notice from 5.1. |

When the tab is hidden, the app pauses the render loop and keeps the mic stream. It does not re-request permission on return, and it calls `AudioContext.resume()` if needed.

## 7. Accuracy disclaimer

Phone and laptop microphones have unknown sensitivity, their own frequency response, and often hardware gain control. Readings are only approximate, and the app is not suitable for occupational noise or safety compliance. The calibration slider lets users match a reference meter at one level. The UI and README must say this.

## 8. Testing

- **Unit tests (`node --test`)** for `dsp.js`:
  - RMS of a full-scale sine is 0.707, which is -3.01 dBFS.
  - Silence clamps to the floor and never returns `-Infinity`.
  - Time weighting converges to a step input within the expected tau.
  - Leq of a constant signal equals that signal's level.
  - Zone boundaries at 69.9, 70, 85 and 85.1 dB.
- **Unit tests** for `sessions.js`:
  - The list sorts by Max descending, with ties broken by newest.
  - A blank name becomes "Session N", and N is not reused after a delete.
  - Names are trimmed and cut to 40 characters.
  - Sessions under 1 second are discarded.
  - The 51st session drops the oldest by `startedAt`, not the lowest Max.
  - Rename with empty input keeps the old name.
  - `store.js` falls back to memory when `sessionStorage` throws.
- **A-weighting check:** an offline script renders sine tones at 100 Hz, 1 kHz and 10 kHz through the filter chain in an `OfflineAudioContext`. It compares the result against reference attenuation (about -19.1, 0 and -2.5 dB).
- **Manual:** test on iOS Safari, Android Chrome and desktop Chrome, Firefox and Safari. Cover permission denied and re-allowed, switching tabs, and an unplugged headset mic. Compare against a reference meter or a known tone to sanity-check calibration.

## 9. Running and deploying

- **Local:** `python3 -m http.server 8000`, then open `http://localhost:8000`. `localhost` counts as a secure context.
- **Deploy:** any static host over HTTPS. HTTP deployments can't use the mic.
- **Browser support:** current and previous major versions of Chrome, Safari (iOS 15+) and Firefox.

## 10. Acceptance criteria

1. Opening the app and tapping Start shows a live dB(A) reading from the mic within 1 second of permission being granted.
2. Clapping or speaking raises the reading, and silence lowers it, with no errors in the console.
3. Toggles for A/Z weighting and Fast/Slow response change the readout behavior visibly.
4. Min, Avg, Max and Peak update correctly during a session, and Discard session stops it without saving.
5. Zone color and label change at 70 and 85 dB.
6. All denied, missing, insecure and unsupported states show the correct message.
7. No network requests are made after the page loads, which can be checked in the devtools Network tab.
8. All unit tests pass.
9. A named session saves on Stop and appears in the list with its Max, and the list stays sorted from highest Max to lowest after several sessions.
10. Weighting, speed and offset controls are disabled while a session runs and re-enabled afterward.
11. Sessions can be renamed, deleted and cleared. The list survives a reload of the same tab and is empty in a new tab or after the tab is closed.
12. Devtools shows session data only in `sessionStorage`, and nothing in `localStorage`, cookies or IndexedDB.
