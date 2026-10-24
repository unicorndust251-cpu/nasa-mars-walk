import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import {
  BASE_LAYER_KEY,
  JEZERO_CENTER,
  MAP_LIMITS,
  MarsCRS,
  TREK_LAYERS,
  createTrekLayer,
  jezeroOrbitZoom,
  layerOpacityAt,
  minZoomForViewport,
  nearestWorldLng,
  prefetchView,
} from './marsTrek';
import { SmoothZoom } from './smoothZoom';
import { MarsMapContext, type MarsMapApi } from './MarsMapContext';
import { useTileHealth } from './useTileHealth';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import MapControls from './MapControls';
import MapAttribution from './MapAttribution';

export interface RevealOptions {
  /** Seconds for the descent into the orbital view. 0 = cut straight to it. */
  duration?: number;
}

export interface MarsMapHandle {
  /** Bring the map into focus and settle on the orbital view of Jezero Crater. */
  reveal(options?: RevealOptions): void;
  resetView(): void;
  getMap(): L.Map | null;
}

export interface MarsMapProps {
  /** Zoom to mount at. Defaults to the orbital view of Jezero. A lower value starts the map high above, ready to descend. */
  startZoom?: number;
  /** Alternatively, start this many zoom levels above the orbital view. */
  startLevelsAbove?: number;
  /** Mount out of focus, waiting for reveal(). Used while the intro plays on top. */
  awaitReveal?: boolean;
  /** Overlays for future features. They can read the map with useMarsMap(). */
  children?: ReactNode;
}

interface MapParts {
  map: L.Map;
  layers: L.TileLayer[];
  base: L.TileLayer;
  smooth: SmoothZoom;
}

type FocusState = 'blurred' | 'sharpening' | 'sharp';

const MarsMap = forwardRef<MarsMapHandle, MarsMapProps>(function MarsMap(
  { startZoom, startLevelsAbove = 0, awaitReveal = false, children },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [parts, setParts] = useState<MapParts | null>(null);
  const [focus, setFocus] = useState<FocusState>(awaitReveal ? 'blurred' : 'sharp');
  const reducedMotion = usePrefersReducedMotion();
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  /* ---------------------------------------------------------------- create */
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const map = L.map(el, {
      crs: MarsCRS,
      center: JEZERO_CENTER,
      zoom: 3,
      minZoom: minZoomForViewport(el.clientHeight || window.innerHeight),
      maxZoom: MAP_LIMITS.maxZoom,
      zoomSnap: 0,
      zoomDelta: 1,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false, // replaced by SmoothZoom
      doubleClickZoom: false, // replaced by SmoothZoom
      touchZoom: true,
      bounceAtZoomLimits: false,
      // Latitude is bounded at the poles; longitude is unbounded and wraps
      maxBounds: L.latLngBounds([-90, -1e6], [90, 1e6]),
      maxBoundsViscosity: 1,
      inertia: true,
      inertiaDeceleration: 2200,
      inertiaMaxSpeed: 2400,
      easeLinearity: 0.2,
      fadeAnimation: true,
      zoomAnimation: true,
      markerZoomAnimation: true,
      keyboard: true,
      keyboardPanDelta: 120,
    });

    const layers = TREK_LAYERS.map((def) => createTrekLayer(def).addTo(map));
    const base = layers[TREK_LAYERS.findIndex((d) => d.key === BASE_LAYER_KEY)];

    // Regional mosaics fade in as you descend, instead of popping in as hard rectangles
    const syncOpacity = () => {
      const z = map.getZoom();
      TREK_LAYERS.forEach((def, i) => def.fadeIn && layers[i].setOpacity(layerOpacityAt(def, z)));
    };
    map.on('zoom', syncOpacity);

    const orbit = jezeroOrbitZoom(map);
    const first = Math.max(map.getMinZoom(), startZoom ?? orbit - startLevelsAbove);
    map.setView(JEZERO_CENTER, first, { animate: false });
    syncOpacity();
    // Starting high above Jezero: warm the cache with the tiles the descent will land on
    if (orbit - first > 0.5) prefetchView(map, JEZERO_CENTER, orbit);

    const smooth = new SmoothZoom(map, { instant: reducedRef.current });
    map.on('dblclick', (e: L.LeafletMouseEvent) => smooth.zoomBy(e.originalEvent.shiftKey ? -1 : 1, e.containerPoint));

    const onResize = () => {
      map.invalidateSize({ pan: false });
      map.setMinZoom(minZoomForViewport(map.getSize().y));
      if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom(), { animate: false });
    };
    window.addEventListener('resize', onResize);

    setParts({ map, layers, base, smooth });
    // Handy in the console while developing overlays: window.__marsMap
    if (import.meta.env.DEV) (window as unknown as { __marsMap?: L.Map }).__marsMap = map;

    return () => {
      window.removeEventListener('resize', onResize);
      smooth.destroy();
      map.remove();
      setParts(null);
    };
    // Mount once; later prop changes go through reveal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => parts?.smooth.setInstant(reducedMotion), [parts, reducedMotion]);

  const { status, retry } = useTileHealth(parts?.base ?? null, parts?.layers ?? []);

  /* ------------------------------------------------------------- movement */
  const flyHome = useCallback((duration: number) => {
    const map = parts?.map;
    if (!map) return;
    const center = L.latLng(JEZERO_CENTER[0], nearestWorldLng(JEZERO_CENTER[1], map.getCenter().lng));
    const zoom = jezeroOrbitZoom(map);
    map.stop();
    if (duration <= 0 || reducedRef.current) map.setView(center, zoom, { animate: false });
    else map.flyTo(center, zoom, { duration, easeLinearity: 0.15 });
  }, [parts]);

  const resetView = useCallback(() => {
    const map = parts?.map;
    if (!map) return;
    // Longer flights for longer journeys, so crossing the planet never feels rushed
    const far = map.getCenter().distanceTo(L.latLng(JEZERO_CENTER)) / 1000; // km on Mars
    flyHome(Math.min(3.2, 1.4 + far / 2500));
  }, [flyHome, parts]);

  const zoomBy = useCallback((delta: number) => parts?.smooth.zoomBy(delta), [parts]);

  const focusTimer = useRef(0);
  const reveal = useCallback(
    (options: RevealOptions = {}) => {
      const duration = reducedRef.current ? 0 : options.duration ?? 2.6;
      flyHome(duration);
      window.clearTimeout(focusTimer.current);
      if (duration <= 0) {
        setFocus('sharp');
        return;
      }
      setFocus('sharpening');
      focusTimer.current = window.setTimeout(() => setFocus('sharp'), 2300);
    },
    [flyHome]
  );
  useEffect(() => () => window.clearTimeout(focusTimer.current), []);

  useImperativeHandle(ref, () => ({ reveal, resetView, getMap: () => parts?.map ?? null }), [reveal, resetView, parts]);

  const api = useMemo<MarsMapApi | null>(
    () => (parts ? { map: parts.map, status, zoomBy, resetView } : null),
    [parts, status, zoomBy, resetView]
  );

  return (
    <div className={`bt-map bt-map--${focus}`} data-status={status}>
      <div
        ref={containerRef}
        className="bt-map__surface"
        role="application"
        aria-roledescription="map"
        aria-label="Map of Mars centred on Jezero Crater. Drag to pan, scroll or pinch to zoom, double-click to zoom in. Arrow keys pan, plus and minus zoom."
      />

      {status === 'loading' && focus !== 'blurred' && <div className="bt-map__loading" aria-hidden="true" />}

      {status === 'error' && (
        <div className="bt-map__error" role="alert">
          <p className="bt-map__error-title">Mars imagery is unavailable</p>
          <p className="bt-map__error-body">NASA Mars Trek isn&rsquo;t responding. Check your connection, then try again.</p>
          <button type="button" className="bt-map__retry" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {api && (
        <MarsMapContext.Provider value={api}>
          <div className="bt-map__overlays">{children}</div>
          <div className="bt-map__chrome">
            <MapAttribution />
            <MapControls />
          </div>
        </MarsMapContext.Provider>
      )}
    </div>
  );
});

export default MarsMap;
