import * as L from 'leaflet';
import type { LatLon } from '../core/marsGeo.ts';
import type { RouteResult, RouteStop } from '../core/routePlanner.ts';

/**
 * Leaflet drawing for routes: kept separate from planning. Everything here only displays what
 * the planner computed; the path is drawn through the planner's coordinates exactly.
 */

export const ROUTE_PANE = 'btRoutePane';

export function ensureRoutePane(map: L.Map) {
  if (!map.getPane(ROUTE_PANE)) {
    const pane = map.createPane(ROUTE_PANE);
    pane.style.zIndex = '450'; // above imagery (200–400), below markers (600)
  }
}

/**
 * Longitudes for drawing: each point takes the copy of its longitude nearest the previous one,
 * so a path never jumps across the ±180° seam, and the whole path sits on the world copy
 * nearest `referenceLng` (the map centre).
 */
export function unwrapForMap(points: LatLon[], referenceLng: number): L.LatLng[] {
  if (!points.length) return [];
  const out: L.LatLng[] = [];
  let prev = points[0].lon + 360 * Math.round((referenceLng - points[0].lon) / 360);
  out.push(L.latLng(points[0].lat, prev));
  for (let i = 1; i < points.length; i++) {
    const lon = points[i].lon + 360 * Math.round((prev - points[i].lon) / 360);
    out.push(L.latLng(points[i].lat, lon));
    prev = lon;
  }
  return out;
}

export function nearestCopy(p: LatLon, referenceLng: number): L.LatLng {
  return L.latLng(p.lat, p.lon + 360 * Math.round((referenceLng - p.lon) / 360));
}

export type MarkerRole = 'start' | 'destination' | 'waypoint' | 'science' | 'pin';

export function markerIcon(role: MarkerRole, label?: string): L.DivIcon {
  const size = role === 'start' || role === 'destination' ? 30 : role === 'pin' ? 22 : 18;
  return L.divIcon({
    className: `bt-nav-marker bt-nav-marker--${role}`,
    html: `<span class="bt-nav-marker__dot">${label ? `<span class="bt-nav-marker__label"></span>` : ''}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Sets a marker label without HTML injection (names come from data). */
export function setMarkerLabel(marker: L.Marker, text: string) {
  const el = marker.getElement()?.querySelector('.bt-nav-marker__label');
  if (el) el.textContent = text;
}

/**
 * Draws a route: a dark casing for contrast on bright terrain, then the Dust Rose path. A new
 * route draws itself in along its length (or fades in, for dashed direct previews).
 */
export function drawRoute(group: L.LayerGroup, map: L.Map, route: RouteResult, animate: boolean): L.Polyline {
  group.clearLayers();
  const latlngs = unwrapForMap(route.coordinates, map.getCenter().lng);
  const renderer = L.svg({ padding: 0.5, pane: ROUTE_PANE });
  const preview = route.kind === 'preview';
  L.polyline(latlngs, {
    pane: ROUTE_PANE,
    renderer,
    color: '#171413',
    opacity: 0.55,
    weight: preview ? 6 : 8,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
    className: 'bt-nav-route-casing',
  }).addTo(group);
  const line = L.polyline(latlngs, {
    pane: ROUTE_PANE,
    renderer,
    color: '#E8C2AD',
    weight: preview ? 3 : 4,
    opacity: 1,
    dashArray: preview ? '2 9' : undefined,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
    className: `bt-nav-route${preview ? ' bt-nav-route--preview' : ''}`,
  }).addTo(group);

  if (animate) {
    const path = line.getElement() as SVGPathElement | undefined;
    const casing = (group.getLayers()[0] as L.Polyline).getElement() as SVGPathElement | undefined;
    if (path && !preview && typeof path.getTotalLength === 'function') {
      const len = path.getTotalLength();
      for (const el of [path, casing]) {
        if (!el) continue;
        el.style.transition = 'none';
        el.style.strokeDasharray = `${len} ${len}`;
        el.style.strokeDashoffset = `${len}`;
      }
      // Next frame: draw in, then drop the dash so later zooms render normally
      requestAnimationFrame(() => {
        for (const el of [path, casing]) {
          if (!el) continue;
          el.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22, 0.61, 0.36, 1)';
          el.style.strokeDashoffset = '0';
        }
        window.setTimeout(() => {
          for (const el of [path, casing]) {
            if (!el) continue;
            el.style.transition = '';
            el.style.strokeDasharray = '';
            el.style.strokeDashoffset = '';
          }
        }, 1200);
      });
    } else if (path) {
      path.style.opacity = '0';
      requestAnimationFrame(() => {
        path.style.transition = 'opacity 0.6s ease';
        path.style.opacity = '1';
      });
    }
  }
  return line;
}

/** Bounds of a route on the map's current world copy. */
export function routeBounds(route: RouteResult, map: L.Map): L.LatLngBounds {
  return L.latLngBounds(unwrapForMap(route.coordinates, map.getCenter().lng));
}

/** Stop markers placed by the visitor (draggable) and by the planner (science stops). */
export interface StopMarkerHandlers {
  onDragEnd(kind: 'start' | 'destination' | 'waypoint', index: number, at: LatLon): void;
  onSelect(stop: RouteStop | { name: string; lat: number; lon: number }): void;
}
