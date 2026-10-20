import { aWeightingSections } from './dsp.js';

const FFT_SIZE = 2048;

export class MicMeter {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.onEnded = () => {};
  }

  // Resolves with the track settings so the caller can warn if browser DSP is still on.
  async start(weighting) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const track = this.stream.getAudioTracks()[0];
    track.addEventListener('ended', () => this.onEnded());

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0;
    // Silent sink keeps the graph "pulled" on browsers that need a destination.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.analyser.connect(this.sink).connect(this.ctx.destination);

    this.filters = aWeightingSections(this.ctx.sampleRate).map((s) => this.ctx.createIIRFilter(s.b, s.a));
    this.buf = new Float32Array(FFT_SIZE);
    this.setWeighting(weighting);
    return track.getSettings();
  }

  setWeighting(weighting) {
    this.source.disconnect();
    this.filters.forEach((f) => f.disconnect());
    if (weighting === 'A') {
      let node = this.source;
      for (const f of this.filters) {
        node.connect(f);
        node = f;
      }
      node.connect(this.analyser);
    } else {
      this.source.connect(this.analyser);
    }
  }

  // Mean-square power of the latest block.
  readPower() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    return sum / this.buf.length;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') return this.ctx.resume();
  }

  stop() {
    this.onEnded = () => {};
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.stream = null;
  }
}
