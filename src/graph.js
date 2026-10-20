import { ZONE_QUIET_MAX, ZONE_LOUD_MAX } from './dsp.js';

const MIN_DB = 30;
const MAX_DB = 120;
export const GRAPH_SECONDS = 60;
export const GRAPH_HZ = 10;
const MAX_POINTS = GRAPH_SECONDS * GRAPH_HZ;

export class HistoryGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.points = [];
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  push(db) {
    this.points.push(db);
    if (this.points.length > MAX_POINTS) this.points.shift();
    this.draw();
  }

  clear() {
    this.points = [];
    this.draw();
  }

  draw() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const css = getComputedStyle(c);
    const y = (db) => h - ((Math.min(Math.max(db, MIN_DB), MAX_DB) - MIN_DB) / (MAX_DB - MIN_DB)) * h;

    g.lineWidth = 1;
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = css.getPropertyValue('--muted');
    for (const [db, color] of [[ZONE_QUIET_MAX, '--amber'], [ZONE_LOUD_MAX, '--red']]) {
      g.strokeStyle = css.getPropertyValue(color);
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(0, y(db));
      g.lineTo(w, y(db));
      g.stroke();
      g.fillText(`${db}`, 4, y(db) - 3);
    }
    g.setLineDash([]);

    if (this.points.length < 2) return;
    g.strokeStyle = css.getPropertyValue('--accent');
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.beginPath();
    // Newest point sits at the right edge; the line scrolls left.
    const step = w / (MAX_POINTS - 1);
    const offsetX = w - (this.points.length - 1) * step;
    this.points.forEach((db, i) => {
      const x = offsetX + i * step;
      if (i === 0) g.moveTo(x, y(db));
      else g.lineTo(x, y(db));
    });
    g.stroke();
  }
}
