import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { useMarsMap } from '../../map';
import { LOCATIONS, locationById, type MarsLocation } from '../core/locations.ts';
import { formatLatLon, normalizeLon, type LatLon } from '../core/marsGeo.ts';
import { DETOUR_BUDGETS, type DetourLevel, type PlanRequest, type RouteStop } from '../core/routePlanner.ts';
import type { RouteMode } from '../core/costModel.ts';
import type { Discovery } from '../core/discover.ts';
import { useRoutePlanner } from '../useRoutePlanner.ts';
import { LocationLayer, buildPopup, placeActions, type PlaceAction } from './locationLayer.ts';
import { drawRoute, ensureRoutePane, markerIcon, nearestCopy, routeBounds, setMarkerLabel } from './routeLayers.ts';
import LocationField from './LocationField.tsx';
import RouteDetailsPanel from './RouteDetailsPanel.tsx';
import DiscoverAlongRoute from './DiscoverAlongRoute.tsx';
import type { NavStop } from './types.ts';
import './navigator.css';

type PickTarget = 'start' | 'destination' | 'waypoint' | null;

const MODES: Array<{ key: RouteMode; label: string; hint: string }> = [
  { key: 'shortest', label: 'Shortest', hint: 'Least distance, still avoiding slopes over 30°' },
  { key: 'terrain', label: 'Terrain-aware', hint: 'Prefers gentle, smooth, level ground even if longer' },
  { key: 'science', label: 'Science', hint: 'Adds documented scientific sites within your detour allowance' },
];

const pointName = (p: LatLon) => `Map point ${formatLatLon(p, 3)}`;
const fromLocation = (l: MarsLocation, source: NavStop['source'] = 'search'): NavStop => ({ lat: l.lat, lon: l.lon, name: l.name, id: l.id, source });

/** The floating navigation panel over the Mars Trek map, with everything it draws on the map. */
export default function MarsNavigator({ onClose }: { onClose(): void }) {
  const { map } = useMarsMap();
  const [start, setStart] = useState<NavStop | null>(null);
  const [destination, setDestination] = useState<NavStop | null>(null);
  const [waypoints, setWaypoints] = useState<NavStop[]>([]);
  const [mode, setMode] = useState<RouteMode>('terrain');
  const [detour, setDetour] = useState<DetourLevel>('moderate');
  const [picking, setPicking] = useState<PickTarget>(null);
  const [tab, setTab] = useState<'details' | 'discover'>('details');
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const request: PlanRequest | null = useMemo(
    () => (start && destination ? { start, destination, waypoints, mode, detour } : null),
    [start, destination, waypoints, mode, detour]
  );
  const planner = useRoutePlanner(request);
  const route = request ? planner.result : null;
  const computing = planner.status === 'computing';

  /* ---------------------------------------------------------- stop edits */
  const applyPlace = useCallback((stop: NavStop, action: PlaceAction) => {
    if (action === 'start') setStart(stop);
    else if (action === 'destination') setDestination(stop);
    else setWaypoints((w) => [...w, stop]);
  }, []);

  const moveWaypoint = (i: number, delta: number) =>
    setWaypoints((w) => {
      const j = i + delta;
      if (j < 0 || j >= w.length) return w;
      const next = w.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const swap = () => {
    setStart(destination);
    setDestination(start);
    setWaypoints((w) => w.slice().reverse());
  };

  /* ---------------------------------------------------------- map layers */
  // Callbacks used by Leaflet handlers, always current
  const live = useRef({ applyPlace, picking, setPicking });
  live.current = { applyPlace, picking, setPicking };

  const layers = useMemo(() => {
    ensureRoutePane(map);
    return {
      route: L.layerGroup(),
      stops: L.layerGroup(),
      hover: L.circleMarker([0, 0], { radius: 6, color: '#171413', weight: 2, fillColor: '#F3E5DC', fillOpacity: 1, interactive: false, pane: 'markerPane' }),
    };
  }, [map]);

  // Database locations, clustered and zoom-aware
  const locationLayer = useRef<LocationLayer | null>(null);
  useEffect(() => {
    const layer = new LocationLayer(map, LOCATIONS, (l, action) => live.current.applyPlace(fromLocation(l), action));
    locationLayer.current = layer;
    return () => {
      layer.destroy();
      locationLayer.current = null;
    };
  }, [map]);

  // Put our layers on the map while the navigator is open, and take everything off when it closes.
  // Attaching here (not when the layers are created) matters: React's development mode mounts,
  // unmounts and remounts components, and the remount must put the layers back.
  useEffect(() => {
    layers.route.addTo(map);
    layers.stops.addTo(map);
    return () => {
      layers.route.remove();
      layers.stops.remove();
      layers.hover.remove();
      map.closePopup();
      map.getContainer().classList.remove('bt-nav-picking');
    };
  }, [layers, map]);

  // Clicking the map: place the point being picked, or offer what to do with it
  useEffect(() => {
    let timer = 0;
    const onClick = (e: L.LeafletMouseEvent) => {
      const p = { lat: e.latlng.lat, lon: normalizeLon(e.latlng.lng) };
      const target = live.current.picking;
      if (target) {
        live.current.applyPlace({ ...p, name: pointName(p), source: 'map' }, target);
        live.current.setPicking(null);
        return;
      }
      // Wait a moment so a double-click (zoom) doesn't also open the menu
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const popup = L.popup({ className: 'bt-nav-leaflet-popup', maxWidth: 260 });
        popup
          .setLatLng(e.latlng)
          .setContent(
            buildPopup({
              title: 'Selected point',
              coords: p,
              actions: placeActions((action) => live.current.applyPlace({ ...p, name: pointName(p), source: 'map' }, action), () => map.closePopup(popup)),
            })
          )
          .openOn(map);
      }, 260);
    };
    const onDbl = () => window.clearTimeout(timer);
    map.on('click', onClick);
    map.on('dblclick', onDbl);
    return () => {
      window.clearTimeout(timer);
      map.off('click', onClick);
      map.off('dblclick', onDbl);
    };
  }, [map]);

  useEffect(() => {
    map.getContainer().classList.toggle('bt-nav-picking', !!picking);
    if (!picking) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, picking]);

  // Stop markers: the visitor's stops are draggable; moving one reroutes
  useEffect(() => {
    layers.stops.clearLayers();
    const ref = map.getCenter().lng;
    const add = (stop: NavStop, role: 'start' | 'destination' | 'waypoint', label: string, onMove: (p: LatLon) => void) => {
      const m = L.marker(nearestCopy(stop, ref), {
        icon: markerIcon(role, label),
        draggable: true,
        autoPan: true,
        keyboard: true,
        title: `${label}: ${stop.name} (drag to move)`,
        alt: stop.name,
        zIndexOffset: role === 'waypoint' ? 500 : 1000,
      });
      m.on('dragend', () => {
        const ll = m.getLatLng();
        const p = { lat: Math.max(-90, Math.min(90, ll.lat)), lon: normalizeLon(ll.lng) };
        onMove(p);
      });
      m.bindTooltip(stop.name, { direction: 'top', offset: [0, -14], className: 'bt-nav-tooltip' });
      m.addTo(layers.stops);
      setMarkerLabel(m, label);
    };
    if (start) add(start, 'start', 'A', (p) => setStart({ ...p, name: pointName(p), source: 'map' }));
    waypoints.forEach((w, i) =>
      add(w, 'waypoint', String(i + 1), (p) => setWaypoints((ws) => ws.map((x, j) => (j === i ? { ...p, name: pointName(p), source: 'map' } : x))))
    );
    if (destination) add(destination, 'destination', 'B', (p) => setDestination({ ...p, name: pointName(p), source: 'map' }));
    // Science stops chosen by the planner
    route?.stops
      .filter((s) => s.kind === 'science')
      .forEach((s) => {
        const m = L.marker(nearestCopy(s, ref), { icon: markerIcon('science'), keyboard: true, title: `Science stop: ${s.name}`, alt: s.name });
        m.bindTooltip(`Science stop · ${s.name}`, { direction: 'top', offset: [0, -10], className: 'bt-nav-tooltip' });
        const l = locationById(s.id);
        if (l) m.on('click', () => locationLayer.current?.openPopup(l));
        m.addTo(layers.stops);
      });
  }, [layers, map, start, destination, waypoints, route]);

  // Draw the route; fit the view when the new route isn't fully visible
  const lastDrawn = useRef<string>('');
  useEffect(() => {
    if (!route) {
      layers.route.clearLayers();
      lastDrawn.current = '';
      return;
    }
    const key = JSON.stringify(route.coordinates);
    if (key === lastDrawn.current) return;
    const animate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    drawRoute(layers.route, map, route, animate);
    lastDrawn.current = key;

    const bounds = routeBounds(route, map);
    const panel = panelRef.current?.getBoundingClientRect();
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    const padTL = L.point(narrow ? 24 : (panel?.right ?? 0) + 32, 72);
    const padBR = L.point(narrow ? 24 : 72, narrow ? (panel ? window.innerHeight - panel.top + 24 : 24) : 72);
    // "Visible" means the clear part of the map, not the area behind the panel
    const size = map.getSize();
    const clear = L.latLngBounds(
      map.containerPointToLatLng(L.point(padTL.x, padTL.y)),
      map.containerPointToLatLng(L.point(Math.max(padTL.x + 1, size.x - padBR.x), Math.max(padTL.y + 1, size.y - padBR.y)))
    );
    const fullyVisible = clear.contains(bounds) && map.getBoundsZoom(bounds, false, padTL.add(padBR)) - map.getZoom() < 2.5;
    if (!fullyVisible) {
      map.flyToBounds(bounds, { paddingTopLeft: padTL, paddingBottomRight: padBR, maxZoom: 15, duration: animate ? 1.2 : 0 });
    }
  }, [route, layers, map]);

  const showOnMap = (p: LatLon, zoom?: number) => {
    const z = zoom ?? Math.max(map.getZoom(), 13);
    map.flyTo(nearestCopy(p, map.getCenter().lng), z, { duration: 0.9 });
  };

  const onProfileHover = useCallback(
    (p: LatLon | null) => {
      if (!p) layers.hover.remove();
      else layers.hover.setLatLng(nearestCopy(p, map.getCenter().lng)).addTo(map);
    },
    [layers, map]
  );

  const onLocateStop = (s: RouteStop) => {
    const l = locationById(s.id);
    showOnMap(s, route?.kind === 'preview' ? 6 : 14);
    if (l) window.setTimeout(() => locationLayer.current?.openPopup(l), 950);
  };

  const discoveryStops = waypoints.filter((w) => w.source === 'discover');
  const addDiscovery = (d: Discovery) => {
    setWaypoints((w) => {
      const next = w.slice();
      next.splice(Math.min(d.insertAt, next.length), 0, fromLocation(d.location, 'discover'));
      return next;
    });
  };

  const statusLine =
    planner.terrain === 'loading'
      ? 'Loading Jezero terrain data…'
      : !start || !destination
        ? 'Choose a start and a destination'
        : computing
          ? 'Calculating route…'
          : planner.status === 'error'
            ? planner.error
            : route
              ? `${route.kind === 'preview' ? 'Direct preview' : 'Route ready'}${planner.ms ? ` · ${Math.round(planner.ms)} ms` : ''}`
              : '';

  return (
    <aside ref={panelRef} className={`bt-nav${collapsed ? ' is-collapsed' : ''}`} aria-label="Mars navigation">
      <header className="bt-nav__head">
        <h2 className="bt-nav__title">Navigate Mars</h2>
        <div className="bt-nav__head-actions">
          <button type="button" className="bt-nav-iconbtn bt-nav__collapse" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d={collapsed ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'} />
            </svg>
          </button>
          <button type="button" className="bt-nav-iconbtn" onClick={onClose} aria-label="Close navigation">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
            </svg>
          </button>
        </div>
      </header>

      <div className="bt-nav__body">
        <div className="bt-nav__endpoints">
          <LocationField
            label="Starting location"
            role="start"
            value={start}
            placeholder="Search or enter coordinates"
            picking={picking === 'start'}
            onChange={setStart}
            onPick={() => setPicking((p) => (p === 'start' ? null : 'start'))}
            autoFocus
          />

          {waypoints.length > 0 && (
            <ol className="bt-nav-waypoints" aria-label="Waypoints">
              {waypoints.map((w, i) => (
                <li key={`${w.id ?? 'pt'}-${w.lat}-${w.lon}-${i}`} className="bt-nav-waypoint">
                  <span className="bt-nav-waypoint__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <button type="button" className="bt-nav-waypoint__name" onClick={() => showOnMap(w)} title={formatLatLon(w)}>
                    {w.name}
                  </button>
                  <button type="button" className="bt-nav-iconbtn bt-nav-iconbtn--sm" onClick={() => moveWaypoint(i, -1)} disabled={i === 0} aria-label={`Move ${w.name} earlier`}>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="m5 12 5-5 5 5" />
                    </svg>
                  </button>
                  <button type="button" className="bt-nav-iconbtn bt-nav-iconbtn--sm" onClick={() => moveWaypoint(i, 1)} disabled={i === waypoints.length - 1} aria-label={`Move ${w.name} later`}>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="m5 8 5 5 5-5" />
                    </svg>
                  </button>
                  <button type="button" className="bt-nav-iconbtn bt-nav-iconbtn--sm" onClick={() => setWaypoints((ws) => ws.filter((_, j) => j !== i))} aria-label={`Remove ${w.name}`}>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
                    </svg>
                  </button>
                </li>
              ))}
            </ol>
          )}

          <LocationField
            label="Destination"
            role="destination"
            value={destination}
            placeholder="Search or enter coordinates"
            picking={picking === 'destination'}
            onChange={setDestination}
            onPick={() => setPicking((p) => (p === 'destination' ? null : 'destination'))}
          />

          <div className="bt-nav-endpoint-actions">
            <button type="button" className="bt-nav-link" onClick={swap} disabled={!start && !destination}>
              ⇅ Swap
            </button>
            <button type="button" className={`bt-nav-link${picking === 'waypoint' ? ' is-on' : ''}`} onClick={() => setPicking((p) => (p === 'waypoint' ? null : 'waypoint'))}>
              {picking === 'waypoint' ? 'Click the map to add a stop' : '+ Add a stop on the map'}
            </button>
          </div>
        </div>

        <fieldset className="bt-nav-modes">
          <legend className="bt-nav-h4">Route preference</legend>
          <div className="bt-nav-seg" role="radiogroup" aria-label="Route preference">
            {MODES.map((m) => (
              <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={`bt-nav-seg__btn${mode === m.key ? ' is-on' : ''}`} onClick={() => setMode(m.key)} title={m.hint}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="bt-nav-chart__sub">{MODES.find((m) => m.key === mode)!.hint}</p>
          {mode === 'science' && (
            <label className="bt-nav-detour">
              <span>Extra distance you’ll accept</span>
              <select value={detour} onChange={(e) => setDetour(e.target.value as DetourLevel)}>
                {(Object.keys(DETOUR_BUDGETS) as DetourLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {DETOUR_BUDGETS[k].label} (+{Math.round(DETOUR_BUDGETS[k].fraction * 100)}%, at least {DETOUR_BUDGETS[k].minKm} km)
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>

        <p className={`bt-nav-status${computing ? ' is-busy' : ''}${planner.status === 'error' ? ' is-error' : ''}`} role="status" aria-live="polite">
          {statusLine}
        </p>
        {planner.terrain === 'unavailable' && (
          <p className="bt-nav-callout" role="note">
            Jezero terrain data couldn’t be loaded, so only direct-distance previews are available.
          </p>
        )}

        {route && start && destination && (
          <div className={`bt-nav-result${computing ? ' is-stale' : ''}`}>
            <div className="bt-nav-tabs" role="tablist" aria-label="Route information">
              <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-on' : ''} onClick={() => setTab('details')}>
                Route details
              </button>
              <button type="button" role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'is-on' : ''} onClick={() => setTab('discover')}>
                Discover along the way
              </button>
            </div>
            {tab === 'details' ? (
              <RouteDetailsPanel
                route={route}
                // Names come from the route itself, so they always match the numbers beside them
                startName={route.stops[0].name}
                destinationName={route.stops[route.stops.length - 1].name}
                onLocate={onLocateStop}
                onProfileHover={onProfileHover}
              />
            ) : (
              <DiscoverAlongRoute
                route={route}
                added={discoveryStops}
                computing={computing}
                onAdd={addDiscovery}
                onRemove={(s) => setWaypoints((w) => w.filter((x) => x !== s))}
                onRestore={() => setWaypoints((w) => w.filter((x) => x.source !== 'discover'))}
                onShow={(l) => {
                  showOnMap(l, route.kind === 'preview' ? 6 : 14);
                  window.setTimeout(() => locationLayer.current?.openPopup(l), 950);
                }}
              />
            )}
          </div>
        )}

        {!start && !destination && (
          <div className="bt-nav-examples">
            <p className="bt-nav-h4">Try a journey in Jezero Crater</p>
            <button
              type="button"
              className="bt-nav-link"
              onClick={() => {
                setStart(fromLocation(locationById('octavia-e-butler-landing')!));
                setDestination(fromLocation(locationById('jezero-delta-front')!));
              }}
            >
              Octavia E. Butler Landing Site → Jezero Delta
            </button>
            <button
              type="button"
              className="bt-nav-link"
              onClick={() => {
                setStart(fromLocation(locationById('octavia-e-butler-landing')!));
                setDestination(fromLocation(locationById('witch-hazel-hill')!));
                setMode('science');
              }}
            >
              Landing site → Witch Hazel Hill (science route)
            </button>
            <p className="bt-nav-chart__sub">Or click anywhere on the map. Terrain-aware routing covers Jezero Crater; elsewhere you get a direct-distance preview.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
