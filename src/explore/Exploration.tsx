import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as L from 'leaflet';
import { useMarsMap } from '../map/MarsMapContext';
import { prefetchView } from '../map/marsTrek';
import { usePrefersReducedMotion } from '../map/usePrefersReducedMotion';
import { buildRoute, KM_PER_DEG, pointAt, realKmAt, walkedPath, type ExplorationRoute } from '../landmarks/route';
import type { Landmark } from '../landmarks/landmarks';
import './explore.css';

// three + R3F for the astronaut load alongside the descent to the surface
const AstronautCanvas = lazy(() => import('../explore/AstronautCanvas.jsx'));

type Status = 'arriving' | 'ready' | 'walking' | 'paused' | 'checkpoint' | 'complete';

/** What the astronaut layer reads every frame. */
export interface AstronautFrameState {
  route: ExplorationRoute;
  s: number;
  status: Status;
  speed: number;
  exploreZoom: number;
  spawnId: number;
  reducedMotion: boolean;
}

interface Run extends AstronautFrameState {
  /** Map-km per second at normal pace */
  baseSpeed: number;
  speedMul: number;
  /** Index of the checkpoint being walked to */
  nextIdx: number;
  reached: number;
  /** Seconds spent walking */
  elapsed: number;
  follow: boolean;
  panCarry: L.Point;
}

interface Ui {
  status: Status;
  reached: number;
  /** Checkpoint whose card is showing */
  card: number | null;
  follow: boolean;
}

/** Walking pace on screen at the exploration zoom. Fast enough to watch, slow enough to read the stride. */
const WALK_PX_PER_S = 30;
/** Next Checkpoint: hurry along to the next stop at this multiple of the normal pace. */
const FAST_FORWARD = 6;
const ARRIVAL_SECONDS = 2.4;
const ZOOM_RANGE: [number, number] = [9.5, 12.6];

const pxPerKm = (zoom: number) => (256 * Math.pow(2, zoom)) / 180 / KM_PER_DEG;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

class LayerBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface ExplorationProps {
  landmark: Landmark;
  /** Exit Exploration: back to the globe with this landmark selected */
  onExit(): void;
  /** From the mission summary: pick a different landmark */
  onExploreAnother(): void;
}

/**
 * Astronaut exploration mode, rendered inside <MarsMap>. Descends to the landmark, lays out a
 * local route with checkpoints, and walks an astronaut along it with full playback controls.
 */
export default function Exploration({ landmark, onExit, onExploreAnother }: ExplorationProps) {
  const { map } = useMarsMap();
  const reducedMotion = usePrefersReducedMotion();
  const [astroFailed, setAstroFailed] = useState(false);
  // A lost WebGL context gets a fresh canvas (twice at most) before falling back to a flat marker
  const [astroKey, setAstroKey] = useState(0);
  const astroLost = useRef(0);
  const handleAstroLost = useCallback(() => {
    if (astroLost.current >= 2) setAstroFailed(true);
    else {
      astroLost.current += 1;
      setAstroKey((k) => k + 1);
    }
  }, []);

  const route = useMemo(() => buildRoute(landmark, map.getCenter().lng), [landmark, map]);
  const total = route.checkpoints.length;

  const run = useRef<Run | null>(null);
  const [ui, setUi] = useState<Ui>({ status: 'arriving', reached: 0, card: null, follow: true });
  const sync = useCallback((card?: number | null) => {
    const r = run.current;
    if (!r) return;
    setUi((u) => ({ status: r.status, reached: r.reached, follow: r.follow, card: card === undefined ? u.card : card }));
  }, []);

  const barRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const layers = useRef<{ walked: L.Polyline; markers: L.Marker[]; fallback?: L.Marker } | null>(null);
  const autoStart = useRef(0);

  /* ------------------------------------------------------- descend + set up */
  useEffect(() => {
    const bounds = L.latLngBounds(route.bounds);
    const narrow = map.getSize().x < 640;
    const pad = narrow ? L.point(60, 330) : L.point(300, 320);
    const zoom = Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], map.getBoundsZoom(bounds, false, pad)));
    const center = bounds.getCenter();

    run.current = {
      route,
      s: 0,
      status: 'arriving',
      speed: 0,
      exploreZoom: zoom,
      spawnId: 0,
      reducedMotion,
      baseSpeed: WALK_PX_PER_S / pxPerKm(zoom),
      speedMul: 1,
      nextIdx: 0,
      reached: 0,
      elapsed: 0,
      follow: true,
      panCarry: L.point(0, 0),
    };

    // Route: soft glow, dotted path ahead, solid trail behind the astronaut
    const glow = L.polyline(route.points, {
      color: '#d6a38b',
      weight: 10,
      opacity: 0.16,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
      noClip: true, // tiny paths; clipping to a stale viewport after the descent cut the route short
    }).addTo(map);
    const ahead = L.polyline(route.points, {
      color: '#f3e5dc',
      weight: 2.2,
      opacity: 0.85,
      dashArray: '1 8',
      lineCap: 'round',
      interactive: false,
      noClip: true, // tiny paths; clipping to a stale viewport after the descent cut the route short
    }).addTo(map);
    const walked = L.polyline([route.start], {
      color: '#ffb074',
      weight: 3.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
      noClip: true, // tiny paths; clipping to a stale viewport after the descent cut the route short
    }).addTo(map);

    const start = L.marker(route.start, {
      icon: L.divIcon({
        className: 'bt-cp-start',
        html: '<span class="bt-cp-start__ring"></span><span class="bt-cp-start__label">Landing site</span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(map);

    const markers = route.checkpoints.map((cp, i) =>
      L.marker(cp.latLng, {
        icon: L.divIcon({
          className: `bt-cp${i === 0 ? ' is-next' : ''}${i === total - 1 ? ' is-final' : ''}`,
          html: `<span class="bt-cp__dot"><span class="bt-cp__num">${i + 1}</span></span><span class="bt-cp__name">${escapeHtml(
            landmark.checkpoints[i].name
          )}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 100 + i,
      }).addTo(map)
    );
    layers.current = { walked, markers };

    // Fly down from a few levels up, with the destination's tiles already on their way
    prefetchView(map, center, zoom, 64);
    map.stop();
    let arrive = 0;
    if (reducedMotion) {
      map.setView(center, zoom, { animate: false });
    } else {
      map.setView(center, Math.max(map.getMinZoom(), zoom - 2.6), { animate: false });
      map.flyTo(center, zoom, { duration: ARRIVAL_SECONDS, easeLinearity: 0.2 });
      arrive = ARRIVAL_SECONDS * 1000 + 150;
    }
    const timer = window.setTimeout(() => {
      const r = run.current;
      if (!r) return;
      r.status = 'ready';
      r.spawnId += 1;
      sync();
    }, arrive);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(autoStart.current);
      [glow, ahead, walked, start, ...markers].forEach((l) => l.remove());
      layers.current?.fallback?.remove();
      layers.current = null;
      run.current = null;
    };
    // One descent per landmark
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, map]);

  useEffect(() => {
    if (run.current) run.current.reducedMotion = reducedMotion;
  }, [reducedMotion]);

  // Dragging the map hands the camera back to the user
  useEffect(() => {
    const onDrag = () => {
      const r = run.current;
      if (r?.follow) {
        r.follow = false;
        sync();
      }
    };
    map.on('dragstart', onDrag);
    return () => {
      map.off('dragstart', onDrag);
    };
  }, [map, sync]);

  /* ------------------------------------------------------------- the walk */
  const markClasses = useCallback(() => {
    const r = run.current;
    layers.current?.markers.forEach((m, i) => {
      const el = m.getElement();
      if (!el || !r) return;
      el.classList.toggle('is-reached', i < r.reached);
      el.classList.toggle('is-next', i === r.nextIdx && r.status !== 'complete');
    });
  }, []);

  const reach = useCallback(() => {
    const r = run.current;
    if (!r) return;
    const idx = r.nextIdx;
    r.s = r.route.checkpoints[idx].s;
    r.reached = idx + 1;
    r.speedMul = 1;
    if (idx >= total - 1) {
      r.status = 'complete';
    } else {
      r.status = 'checkpoint';
      r.nextIdx = idx + 1;
    }
    markClasses();
    sync(r.status === 'complete' ? null : idx);
  }, [markClasses, sync, total]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frame = 0;
    let lastTrailS = -1;
    let lastText = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const r = run.current;
      if (!r) return;
      frame += 1;

      if (r.status === 'walking') {
        const target = r.route.checkpoints[r.nextIdx].s;
        r.speed = r.baseSpeed * r.speedMul;
        r.s = Math.min(target, r.s + r.speed * dt);
        r.elapsed += dt;
        if (r.s >= target - 1e-9) reach();
      } else {
        r.speed = 0;
      }

      // Camera follow: ease the map so the astronaut stays near the middle of the view.
      // On phones the mission summary is a bottom sheet, so the finale lifts the astronaut above it.
      const narrow = map.getSize().x < 640;
      if (r.follow && (r.status === 'walking' || (r.status === 'complete' && narrow))) {
        const size = map.getSize();
        const pt = map.latLngToContainerPoint(pointAt(r.route, r.s));
        const aimY = narrow ? size.y * (r.status === 'complete' ? 0.27 : 0.4) : size.y * 0.5;
        const k = r.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.6);
        const step = L.point((pt.x - size.x / 2) * k, (pt.y - aimY) * k).add(r.panCarry);
        const whole = L.point(Math.trunc(step.x), Math.trunc(step.y));
        r.panCarry = step.subtract(whole);
        if (whole.x !== 0 || whole.y !== 0) map.panBy(whole, { animate: false, noMoveStart: true });
      }

      // Trail, progress bar and readouts, without re-rendering React every frame
      if (layers.current && frame % 3 === 0 && Math.abs(r.s - lastTrailS) > 1e-4) {
        lastTrailS = r.s;
        layers.current.walked.setLatLngs(walkedPath(r.route, r.s));
      }
      if (layers.current?.fallback) layers.current.fallback.setLatLng(pointAt(r.route, r.s));
      if (barRef.current) barRef.current.style.transform = `scaleX(${(r.s / r.route.length).toFixed(4)})`;
      if (now - lastText > 120) {
        lastText = now;
        if (distRef.current) distRef.current.textContent = `${realKmAt(r.route, r.s).toFixed(2)} km`;
        if (timeRef.current) timeRef.current.textContent = formatClock(r.elapsed);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [map, reach]);

  // Without WebGL, a flat astronaut marker still walks the route
  useEffect(() => {
    if (!astroFailed || !layers.current || layers.current.fallback) return;
    layers.current.fallback = L.marker(route.start, {
      icon: L.divIcon({ className: 'bt-astro-fallback', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map);
  }, [astroFailed, map, route.start]);

  /* -------------------------------------------------------------- controls */
  const can = {
    start: ui.status === 'ready',
    pause: ui.status === 'walking',
    resume: ui.status === 'paused' || ui.status === 'checkpoint',
    next: ui.status === 'ready' || ui.status === 'walking' || ui.status === 'paused' || ui.status === 'checkpoint',
    restart: ui.status !== 'arriving',
  };

  const setStatus = (status: Status, card: number | null = null) => {
    const r = run.current;
    if (!r) return;
    window.clearTimeout(autoStart.current);
    r.status = status;
    markClasses();
    sync(card);
  };

  const start = () => can.start && setStatus('walking');
  const pause = () => {
    if (!can.pause || !run.current) return;
    run.current.speedMul = 1;
    setStatus('paused');
  };
  const resume = () => can.resume && setStatus('walking');
  const next = () => {
    if (!can.next || !run.current) return;
    run.current.speedMul = FAST_FORWARD;
    setStatus('walking');
  };
  const restart = () => {
    const r = run.current;
    if (!can.restart || !r) return;
    Object.assign(r, { s: 0, nextIdx: 0, reached: 0, elapsed: 0, speedMul: 1, spawnId: r.spawnId + 1 });
    layers.current?.walked.setLatLngs([r.route.start]);
    setStatus('ready');
    // Land again, then set off
    autoStart.current = window.setTimeout(() => {
      if (run.current?.status === 'ready') setStatus('walking');
    }, reducedMotion ? 0 : 1300);
  };
  const toggleFollow = () => {
    const r = run.current;
    if (!r) return;
    r.follow = !r.follow;
    r.panCarry = L.point(0, 0);
    sync();
  };

  /* ------------------------------------------------------------------ view */
  const nextName = landmark.checkpoints[Math.min(ui.reached, total - 1)]?.name;
  const statusLine = {
    arriving: 'Descending to the surface…',
    ready: ui.reached === 0 ? 'At the landing site. Press Start to begin.' : 'Back at the landing site.',
    walking: `Walking to ${nextName}`,
    paused: `Paused on the way to ${nextName}`,
    checkpoint: `At ${landmark.checkpoints[Math.max(0, ui.reached - 1)]?.name}`,
    complete: 'All checkpoints explored',
  }[ui.status];

  const cardCheckpoint = ui.card !== null ? landmark.checkpoints[ui.card] : null;
  const finalCheckpoint = landmark.checkpoints[total - 1];

  return (
    <div className={`bt-explore bt-explore--${ui.status}`}>
      {!astroFailed && (
        <LayerBoundary onError={() => setAstroFailed(true)}>
          <Suspense fallback={null}>
            <AstronautCanvas
              key={astroKey}
              map={map}
              getState={() => run.current}
              onContextLost={handleAstroLost}
              onError={() => setAstroFailed(true)}
            />
          </Suspense>
        </LayerBoundary>
      )}

      <section className="bt-mission bt-card" aria-label="Exploration progress">
        <p className="bt-mission__eyebrow">Exploration mission</p>
        <h2 className="bt-mission__title">{landmark.name}</h2>
        <div
          className="bt-progress"
          role="progressbar"
          aria-label="Checkpoints reached"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={ui.reached}
          aria-valuetext={`${ui.reached} of ${total} checkpoints`}
        >
          <div ref={barRef} className="bt-progress__fill" />
          {route.checkpoints.map((cp, i) => (
            <span
              key={i}
              className={`bt-progress__tick${i < ui.reached ? ' is-reached' : ''}`}
              style={{ left: `${(cp.s / route.length) * 100}%` }}
            />
          ))}
        </div>
        <p className="bt-mission__stats">
          <span>
            Checkpoints{' '}
            <b>
              {ui.reached}/{total}
            </b>
          </span>
          <span>
            Distance <b ref={distRef}>0.00 km</b>
          </span>
          <span>
            Time <b ref={timeRef}>00:00</b>
          </span>
        </p>
        <p className="bt-mission__status" aria-live="polite">
          {statusLine}
        </p>
      </section>

      {cardCheckpoint && ui.status === 'checkpoint' && (
        <section className="bt-checkpoint bt-card" role="status" aria-live="polite" key={ui.card}>
          <p className="bt-checkpoint__eyebrow">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <path d="m6.6 10.2 2.3 2.3 4.6-4.8" />
            </svg>
            Checkpoint Reached
          </p>
          <p className="bt-checkpoint__count">
            Checkpoint {(ui.card ?? 0) + 1} of {total}
          </p>
          <h3 className="bt-checkpoint__name">{cardCheckpoint.name}</h3>
          <p className="bt-checkpoint__fact">{cardCheckpoint.fact}</p>
          <button type="button" className="bt-btn bt-btn--primary bt-btn--wide" onClick={resume}>
            Continue exploring
          </button>
        </section>
      )}

      {ui.status === 'complete' && (
        <MissionComplete
          landmark={landmark}
          finalName={finalCheckpoint.name}
          finalFact={finalCheckpoint.fact}
          total={total}
          distanceKm={realKmAt(route, route.length)}
          seconds={run.current?.elapsed ?? 0}
          onRestart={restart}
          onAnother={onExploreAnother}
          onExit={onExit}
        />
      )}

      <nav className="bt-controls bt-card" aria-label="Exploration controls">
        <ControlButton label="Start" onClick={start} disabled={!can.start} primary={can.start} icon="play" />
        <ControlButton label="Pause" onClick={pause} disabled={!can.pause} icon="pause" />
        <ControlButton label="Resume" onClick={resume} disabled={!can.resume} primary={can.resume} icon="resume" />
        <ControlButton label="Next Checkpoint" short="Next" onClick={next} disabled={!can.next} icon="next" />
        <ControlButton label="Restart" onClick={restart} disabled={!can.restart} icon="restart" />
        <ControlButton
          label={`Camera Follow ${ui.follow ? 'ON' : 'OFF'}`}
          short={`Follow ${ui.follow ? 'ON' : 'OFF'}`}
          onClick={toggleFollow}
          pressed={ui.follow}
          icon="follow"
        />
        <ControlButton label="Exit Exploration" short="Exit" onClick={onExit} icon="exit" />
      </nav>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

const ICONS: Record<string, ReactNode> = {
  play: <path d="M6.5 4.5v11l9-5.5z" className="bt-fill" />,
  pause: <path d="M7 4.5v11M13 4.5v11" />,
  resume: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M8.3 6.9v6.2l5-3.1z" className="bt-fill" />
    </>
  ),
  next: (
    <>
      <path d="M4.5 5v10l7-5z" className="bt-fill" />
      <path d="M14.5 5v10" />
    </>
  ),
  restart: (
    <>
      <path d="M4.6 10a5.4 5.4 0 1 0 1.6-3.85" />
      <path d="M4.3 3.6v3.1h3.1" />
    </>
  ),
  follow: (
    <>
      <circle cx="10" cy="10" r="5.2" />
      <circle cx="10" cy="10" r="1.3" className="bt-fill" />
      <path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" />
    </>
  ),
  exit: <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />,
};

function ControlButton({
  label,
  short,
  onClick,
  disabled,
  primary,
  pressed,
  icon,
}: {
  label: string;
  short?: string;
  onClick(): void;
  disabled?: boolean;
  primary?: boolean;
  pressed?: boolean;
  icon: keyof typeof ICONS;
}) {
  return (
    <button
      type="button"
      className={`bt-control${primary ? ' is-primary' : ''}${pressed ? ' is-pressed' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        {ICONS[icon]}
      </svg>
      <span className="bt-control__label">{label}</span>
      <span className="bt-control__short" aria-hidden="true">
        {short ?? label}
      </span>
    </button>
  );
}

function MissionComplete({
  landmark,
  finalName,
  finalFact,
  total,
  distanceKm,
  seconds,
  onRestart,
  onAnother,
  onExit,
}: {
  landmark: Landmark;
  finalName: string;
  finalFact: string;
  total: number;
  distanceKm: number;
  seconds: number;
  onRestart(): void;
  onAnother(): void;
  onExit(): void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);

  return (
    <section className="bt-complete bt-card" role="dialog" aria-labelledby="bt-complete-title">
      <p className="bt-complete__eyebrow">{landmark.name}</p>
      <h2 id="bt-complete-title" ref={headingRef} tabIndex={-1} className="bt-complete__title">
        Mission Complete
      </h2>
      <div className="bt-complete__final">
        <p className="bt-complete__final-label">Final checkpoint · {finalName}</p>
        <p className="bt-complete__final-fact">{finalFact}</p>
      </div>
      <dl className="bt-complete__stats">
        <div>
          <dt>Checkpoints</dt>
          <dd>
            {total}/{total}
          </dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{distanceKm.toFixed(2)} km</dd>
        </div>
        <div>
          <dt>Mission time</dt>
          <dd>{formatClock(seconds)}</dd>
        </div>
      </dl>
      <div className="bt-complete__actions">
        <button type="button" className="bt-btn bt-btn--primary" onClick={onAnother}>
          Explore another landmark
        </button>
        <button type="button" className="bt-btn bt-btn--ghost" onClick={onRestart}>
          Restart mission
        </button>
        <button type="button" className="bt-btn bt-btn--ghost" onClick={onExit}>
          Exit exploration
        </button>
      </div>
    </section>
  );
}
