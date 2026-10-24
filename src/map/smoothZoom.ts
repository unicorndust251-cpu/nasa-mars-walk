import * as L from 'leaflet';

/**
 * Leaflet's private view methods. They are stable across 1.x and are what Leaflet's own
 * animations use to move the view one frame at a time without a full reset.
 */
type MapInternals = L.Map & {
  _move(center: L.LatLng, zoom: number, data?: Record<string, unknown>): L.Map;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): L.Map;
  _moveEnd(zoomChanged: boolean): L.Map;
};

export interface SmoothZoomOptions {
  /** Zoom levels per wheel pixel (one mouse notch ≈ 100 px ≈ 0.45 levels) */
  wheelSensitivity: number;
  /** Spring stiffness; higher settles faster. ~11 settles one level in about 0.4 s */
  stiffness: number;
  /** When true, jumps straight to the target (reduced motion) */
  instant: boolean;
}

const DEFAULTS: SmoothZoomOptions = { wheelSensitivity: 0.0045, stiffness: 11, instant: false };

/** Clamp latitude so the poles never pull away from the top or bottom of the viewport. */
export function clampLatForView(map: L.Map, center: L.LatLng, zoom: number): L.LatLng {
  const pxPerDeg = (256 * Math.pow(2, zoom)) / 180;
  const halfDeg = map.getSize().y / 2 / pxPerDeg;
  if (halfDeg >= 90) return L.latLng(0, center.lng);
  const lat = Math.min(90 - halfDeg, Math.max(-90 + halfDeg, center.lat));
  return L.latLng(lat, center.lng);
}

/**
 * Smooth, continuous zoom for mouse wheels, trackpads, double-click and the zoom buttons.
 * Wheel input sets a target zoom; the view springs toward it every frame, keeping the
 * point under the cursor fixed. Tiles load for each level the view passes through.
 */
export class SmoothZoom {
  private map: MapInternals;
  private opts: SmoothZoomOptions;
  private zoom = 0;
  private target = 0;
  private anchorPoint = L.point(0, 0);
  private anchorLatLng = L.latLng(0, 0);
  private raf = 0;
  private last = 0;
  private active = false;
  private container: HTMLElement;

  constructor(map: L.Map, options: Partial<SmoothZoomOptions> = {}) {
    this.map = map as MapInternals;
    this.opts = { ...DEFAULTS, ...options };
    this.container = map.getContainer();
    this.container.addEventListener('wheel', this.onWheel, { passive: false });
    this.container.addEventListener('touchstart', this.cancel, { passive: true });
    map.on('dragstart', this.cancel);
  }

  setInstant(instant: boolean) {
    this.opts.instant = instant;
  }

  get isZooming() {
    return this.active;
  }

  /** Zoom by `delta` levels around a container point (defaults to the centre). */
  zoomBy(delta: number, point?: L.Point) {
    const map = this.map;
    if (!this.active) {
      map.stop();
      this.zoom = map.getZoom();
      this.target = this.zoom;
    }
    this.anchorPoint = point ?? map.getSize().divideBy(2);
    this.anchorLatLng = map.containerPointToLatLng(this.anchorPoint);
    this.target = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), this.target + delta));

    if (this.opts.instant) {
      const center = this.centerFor(this.target);
      this.active = false;
      map.setView(center, this.target, { animate: false });
      return;
    }
    if (!this.active) {
      this.active = true;
      map._moveStart(true, false);
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  destroy() {
    this.cancel();
    this.container.removeEventListener('wheel', this.onWheel);
    this.container.removeEventListener('touchstart', this.cancel);
    this.map.off('dragstart', this.cancel);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas; give it a little more weight
    const gain = e.ctrlKey ? 2.2 : 1;
    const raw = L.DomEvent.getWheelDelta(e) * this.opts.wheelSensitivity * gain;
    const delta = Math.max(-1.2, Math.min(1.2, raw));
    if (delta === 0) return;
    this.zoomBy(delta, this.map.mouseEventToContainerPoint(e as unknown as MouseEvent));
  };

  private cancel = () => {
    if (!this.active) return;
    cancelAnimationFrame(this.raf);
    this.active = false;
    this.map._moveEnd(true);
  };

  private centerFor(zoom: number): L.LatLng {
    const map = this.map;
    const offset = this.anchorPoint.subtract(map.getSize().divideBy(2));
    const p = map.project(this.anchorLatLng, zoom).subtract(offset);
    return clampLatForView(map, map.unproject(p, zoom), zoom);
  }

  private tick = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-this.opts.stiffness * dt);
    this.zoom += (this.target - this.zoom) * k;
    const done = Math.abs(this.target - this.zoom) < 0.0015;
    if (done) this.zoom = this.target;

    this.map._move(this.centerFor(this.zoom), this.zoom);

    if (done) {
      this.active = false;
      this.map._moveEnd(true);
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
