import * as L from 'leaflet';
import type { MarsLocation } from '../core/locations.ts';
import { formatLatLon, type LatLon } from '../core/marsGeo.ts';
import { nearestCopy } from './routeLayers.ts';

/**
 * Database locations on the map, without clutter:
 *  - zoom-dependent visibility: planet-scale landmarks when zoomed out, Jezero's named features
 *    from regional zoom, rover sites only when zoomed in close;
 *  - screen-space clustering: markers closer than CLUSTER_PX merge into a count badge that
 *    zooms in when clicked;
 *  - names on hover, details and route actions on click.
 */

const CLUSTER_PX = 38;

function visibleAt(l: MarsLocation, zoom: number): boolean {
  if (l.scale === 'global') return zoom < 8.5;
  if (l.scale === 'regional') return zoom >= 7;
  return zoom >= 10.5;
}

export type PlaceAction = 'start' | 'destination' | 'waypoint';

export interface PopupSpec {
  title: string;
  kicker?: string;
  coords: LatLon;
  description?: string;
  meta?: string[];
  actions: Array<{ label: string; action: () => void; primary?: boolean }>;
}

/** Popup content built with DOM APIs (names and descriptions are data, never HTML). */
export function buildPopup(spec: PopupSpec): HTMLElement {
  const root = document.createElement('div');
  root.className = 'bt-nav-popup';
  const add = (tag: string, className: string, text: string) => {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    root.appendChild(el);
    return el;
  };
  if (spec.kicker) add('p', 'bt-nav-popup__kicker', spec.kicker);
  add('p', 'bt-nav-popup__title', spec.title);
  add('p', 'bt-nav-popup__coords', formatLatLon(spec.coords));
  if (spec.description) add('p', 'bt-nav-popup__body', spec.description);
  spec.meta?.forEach((m) => add('p', 'bt-nav-popup__meta', m));
  const actions = document.createElement('div');
  actions.className = 'bt-nav-popup__actions';
  for (const a of spec.actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `bt-nav-popup__btn${a.primary ? ' is-primary' : ''}`;
    b.textContent = a.label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      a.action();
    });
    actions.appendChild(b);
  }
  root.appendChild(actions);
  L.DomEvent.disableClickPropagation(root);
  return root;
}

export function placeActions(onAction: (action: PlaceAction) => void, close: () => void) {
  return [
    { label: 'Set as start', action: () => (onAction('start'), close()) },
    { label: 'Set as destination', action: () => (onAction('destination'), close()), primary: true },
    { label: 'Add as waypoint', action: () => (onAction('waypoint'), close()) },
  ];
}

export class LocationLayer {
  private map: L.Map;
  private locations: MarsLocation[];
  private onAction: (location: MarsLocation, action: PlaceAction) => void;
  private group = L.layerGroup();
  private update = () => this.render();

  constructor(map: L.Map, locations: MarsLocation[], onAction: (location: MarsLocation, action: PlaceAction) => void) {
    this.map = map;
    this.locations = locations;
    this.onAction = onAction;
    this.group.addTo(map);
    map.on('zoomend moveend resize', this.update);
    this.render();
  }

  destroy() {
    this.map.off('zoomend moveend resize', this.update);
    this.group.remove();
  }

  /** Opens the details popup for a location (used by search results and stop lists too). */
  openPopup(l: MarsLocation) {
    const at = nearestCopy(l, this.map.getCenter().lng);
    const popup = L.popup({ className: 'bt-nav-leaflet-popup', maxWidth: 300, autoPanPadding: L.point(24, 24) });
    popup
      .setLatLng(at)
      .setContent(
        buildPopup({
          kicker: l.category,
          title: l.name,
          coords: l,
          description: l.description,
          meta: [`Source: ${l.source}`, `Accuracy: ${l.accuracy}`, ...(l.mission ? [`Mission: ${l.mission}`] : [])],
          actions: placeActions((action) => this.onAction(l, action), () => this.map.closePopup(popup)),
        })
      )
      .openOn(this.map);
  }

  private render() {
    const map = this.map;
    const zoom = map.getZoom();
    const size = map.getSize();
    const centerLng = map.getCenter().lng;
    const visible = this.locations
      .filter((l) => visibleAt(l, zoom))
      .map((l) => ({ l, at: nearestCopy(l, centerLng) }))
      .map((v) => ({ ...v, px: map.latLngToContainerPoint(v.at) }))
      .filter((v) => v.px.x > -60 && v.px.y > -60 && v.px.x < size.x + 60 && v.px.y < size.y + 60)
      .sort((a, b) => b.l.scienceValue - a.l.scienceValue);

    // Greedy clustering in screen space, most important first
    const clusters: Array<{ members: typeof visible; px: L.Point }> = [];
    for (const v of visible) {
      const c = clusters.find((k) => k.px.distanceTo(v.px) < CLUSTER_PX);
      if (c) c.members.push(v);
      else clusters.push({ members: [v], px: v.px });
    }

    this.group.clearLayers();
    for (const c of clusters) {
      if (c.members.length === 1) {
        const { l, at } = c.members[0];
        const marker = L.marker(at, {
          icon: L.divIcon({
            className: `bt-nav-poi bt-nav-poi--${l.scale}${l.scienceValue >= 3 ? ' is-sample' : ''}`,
            html: '<span></span>',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          keyboard: true,
          title: l.name,
          alt: l.name,
          riseOnHover: true,
        });
        marker.bindTooltip(l.name, { direction: 'top', offset: [0, -8], className: 'bt-nav-tooltip' });
        marker.on('click', () => this.openPopup(l));
        marker.addTo(this.group);
      } else {
        const bounds = L.latLngBounds(c.members.map((m) => m.at));
        const marker = L.marker(c.members[0].at, {
          icon: L.divIcon({
            className: 'bt-nav-cluster',
            html: `<span>${c.members.length}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          keyboard: true,
          title: `${c.members.length} places: ${c.members.map((m) => m.l.name).join(', ')}`,
        });
        marker.bindTooltip(c.members.map((m) => m.l.name).slice(0, 5).join(' · ') + (c.members.length > 5 ? ' …' : ''), {
          direction: 'top',
          offset: [0, -12],
          className: 'bt-nav-tooltip',
        });
        marker.on('click', () => {
          const z = map.getBoundsZoom(bounds.pad(0.6));
          if (z <= zoom + 0.2) map.setView(bounds.getCenter(), zoom + 2);
          else map.flyToBounds(bounds.pad(0.6), { duration: 0.8 });
        });
        marker.addTo(this.group);
      }
    }
  }
}
