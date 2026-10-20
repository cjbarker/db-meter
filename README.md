# dB Meter

A browser app that measures sound level from the device microphone and shows it in approximate dB(A) or dB(Z). Record named sessions and see them ranked by highest level. Everything runs on the device, and the full design is in [SPEC.md](SPEC.md).

## Features

- Live dB readout with a bar meter and color zones (Quiet below 70, Loud 70 to 85, Very loud above 85), each with a text label.
- A-weighting (dB(A)) or flat (dB(Z)).
- Fast (125 ms) or Slow (1 s) time weighting.
- Per-session Min, Avg (Leq), Max and Peak, plus a 60-second history graph.
- Named sessions, ranked by highest level. Rename, delete or clear them.
- Calibration offset slider to match a reference meter.
- Mobile-first layout that follows the system light or dark theme.

## Build

There's no build step and no dependencies. The app is plain HTML, CSS and ES modules. Node.js 18 or later is only needed to run the tests.

## Test

```
npm test
```

This runs the unit tests in `test/` with `node --test`. They cover the DSP math, A-weighting accuracy, session ranking and caps, and the storage fallback.

## Launch

```
npm start
```

Then open http://localhost:8000. This runs `python3 -m http.server 8000`, so you can also serve the folder with any static file server.

Microphone access requires a secure context, so use `localhost` or deploy to a static host over HTTPS. Plain HTTP from another device won't work.

## How to use

1. Optionally name the session, then tap **Start** and allow the microphone.
2. Watch the live level and stats. Weighting, response speed and calibration are locked while a session runs.
3. Tap **Stop** to save the session, or **Discard session** to stop without saving.
4. Saved sessions appear in the list below, highest Max first.

## Notes

- **Approximate.** Phone and laptop microphones vary in sensitivity. Calibrate against a reference meter. Not suitable for occupational noise or safety compliance.
- **Private.** Audio is never recorded or sent anywhere. Session summaries (name, Max, Avg, duration, settings) are kept in `sessionStorage` and cleared when the tab closes.
- **Sessions.** Sessions shorter than 1 second are discarded. At most 50 are kept, and the oldest is dropped first.

## Project layout

```
index.html, styles.css   page and styling
src/dsp.js               level math, time weighting, A-weighting
src/audio.js             microphone capture and filter chain
src/sessions.js          session naming, ranking, cap
src/store.js             sessionStorage with in-memory fallback
src/graph.js, ui.js      history graph and DOM rendering
src/main.js              app wiring
test/                    unit tests
```
