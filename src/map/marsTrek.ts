import * as L from 'leaflet';

/**
 * NASA Mars Trek tile services.
 *
 * Trek publishes Mars as OGC WMTS (RESTful) in an equirectangular (simple cylindrical)
 * projection on the Mars 2000 sphere, IAU2000:49900, radius 3,396,190 m:
 *   - longitude −180…180 (planetocentric, east positive), latitude −90…90
 *   - 256 px tiles; level 0 is 2 columns × 1 row, each level doubles both ways
 *   - tile row 0 is the north edge
 *   - URL: {product}/1.0.0/{style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.{ext}
 * Docs: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
 */
export const TREK_TILE_ROOT = 'https://trek.nasa.gov/tiles/Mars/EQ';
export const TREK_HOME = 'https://trek.nasa.gov/mars/';
export const MARS_RADIUS_M = 3_396_190;

/**
 * Mars equirectangular CRS. Leaflet's EPSG:4326 already uses the same plate carrée
 * transform and the same 2 × 1 tile pyramid as Trek, and wraps longitude at ±180°.
 * Only the body changes: distances use the Mars sphere instead of Earth.
 */
export const MarsCRS: L.CRS = L.Util.extend({}, L.CRS.EPSG4326, {
  code: 'IAU2000:49900',
  R: MARS_RADIUS_M,
});

export type LatLngTuple = [number, number];
export type BoundsTuple = [LatLngTuple, LatLngTuple];

export interface TrekLayerDef {
  key: string;
  /** Mars Trek product identifier */
  product: string;
  ext: 'jpg' | 'png';
  /** Short credit shown in the attribution label */
  credit: string;
  /** Deepest zoom the service actually has; Leaflet scales tiles beyond it */
  maxNativeZoom: number;
  /** Don't request this layer below this map zoom */
  minZoom?: number;
  /** Regional products: only request tiles inside this box */
  bounds?: BoundsTuple;
  /** Map zoom range over which the layer fades from 0 to full opacity */
  fadeIn?: [number, number];
  zIndex: number;
}

/** Order matters: global base first, then progressively sharper regional mosaics. */
export const TREK_LAYERS: TrekLayerDef[] = [
  {
    key: 'viking',
    product: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
    ext: 'jpg',
    credit: 'Viking MDIM 2.1 (NASA/USGS)',
    maxNativeZoom: 7,
    zIndex: 1,
  },
  {
    key: 'ctx-jezero',
    product: 'Jezero_CTX_BlockAdj_dd',
    ext: 'png',
    credit: 'MRO CTX (NASA/JPL-Caltech/MSSS)',
    maxNativeZoom: 12,
    minZoom: 6.5,
    bounds: [
      [15.9058, 75.1538],
      [19.4453, 78.8717],
    ],
    fadeIn: [6.8, 8.0],
    zIndex: 2,
  },
  {
    key: 'hirise-jezero',
    product: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
    ext: 'png',
    credit: 'MRO HiRISE (NASA/JPL-Caltech/UArizona)',
    maxNativeZoom: 17,
    minZoom: 11,
    bounds: [
      [18.3068, 77.2229],
      [18.6693, 77.584],
    ],
    fadeIn: [11, 11.8],
    zIndex: 3,
  },
];

export const BASE_LAYER_KEY = 'viking';

export function trekTileTemplate(def: TrekLayerDef): string {
  return `${TREK_TILE_ROOT}/${def.product}/1.0.0/default/default028mm/{z}/{y}/{x}.${def.ext}`;
}

/** Concrete tile URL (used for prefetching). */
export function trekTileUrl(def: TrekLayerDef, z: number, x: number, y: number): string {
  return trekTileTemplate(def).replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x));
}

export function createTrekLayer(def: TrekLayerDef): L.TileLayer {
  return L.tileLayer(trekTileTemplate(def), {
    tileSize: 256,
    maxNativeZoom: def.maxNativeZoom,
    minZoom: def.minZoom ?? 0,
    maxZoom: MAP_LIMITS.maxZoom,
    bounds: def.bounds ? L.latLngBounds(def.bounds) : undefined,
    noWrap: false, // repeat across ±180° so panning east/west never hits an edge
    keepBuffer: 3,
    updateWhenIdle: false,
    updateWhenZooming: true,
    updateInterval: 120,
    zIndex: def.zIndex,
    opacity: def.fadeIn ? 0 : 1,
    className: `bt-trek-layer bt-trek-layer--${def.key}`,
    attribution: '', // the custom attribution label handles credits
  });
}

/** 0 → 1 opacity for a layer at a given zoom. */
export function layerOpacityAt(def: TrekLayerDef, zoom: number): number {
  if (!def.fadeIn) return 1;
  const [a, b] = def.fadeIn;
  const t = Math.min(1, Math.max(0, (zoom - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Layers that actually contribute imagery to the current view. */
export function visibleLayers(map: L.Map): TrekLayerDef[] {
  if (!map || !map.getZoom || !map.getBounds || !map.getSize) return [];

  try {
    const zoom = map.getZoom();
    const view = map.getBounds();
    return TREK_LAYERS.filter((def) => {
      if (layerOpacityAt(def, zoom) <= 0.02) return false;
      if (def.minZoom !== undefined && zoom < def.minZoom) return false;
      if (!def.bounds) return true;
      // compare against every world copy in view
      const b = L.latLngBounds(def.bounds);
      const west = view.getWest();
      const east = view.getEast();
      for (let k = Math.floor((west - 180) / 360); k <= Math.ceil((east + 180) / 360); k++) {
        const shifted = L.latLngBounds([b.getSouth(), b.getWest() + k * 360], [b.getNorth(), b.getEast() + k * 360]);
        if (shifted.intersects(view)) return true;
      }
      return false;
    });
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Jezero Crater                                                              */
/* -------------------------------------------------------------------------- */

/** Crater centre, IAU Gazetteer of Planetary Nomenclature (planetocentric, east positive). */
export const JEZERO_CENTER: LatLngTuple = [18.41, 77.69];
/** Rim to rim (47.5 km wide crater) with a little room for the western delta. */
export const JEZERO_FRAME: BoundsTuple = [
  [18.0, 77.22],
  [18.82, 78.12],
];

export const MAP_LIMITS = {
  maxZoom: 18,
  orbitZoomMax: 9.4,
};

/** Smallest zoom at which the planet's full height still covers the viewport (no empty bands at the poles). */
export function minZoomForViewport(heightPx: number): number {
  return Math.max(0, Math.log2(heightPx / 256));
}

/** Zoom that frames Jezero Crater in the current viewport. */
export function jezeroOrbitZoom(map: L.Map): number {
  const z = map.getBoundsZoom(L.latLngBounds(JEZERO_FRAME), false, L.point(32, 32));
  return Math.min(MAP_LIMITS.orbitZoomMax, Math.max(map.getMinZoom(), z));
}

/** The copy of a longitude closest to a reference longitude, so flights take the short way round. */
export function nearestWorldLng(lng: number, referenceLng: number): number {
  return lng + 360 * Math.round((referenceLng - lng) / 360);
}

/**
 * Warm the browser cache with the tiles a view will need, without adding them to the map.
 * Used during the intro so the orbital view of Jezero is ready when the descent lands.
 */
export function prefetchView(map: L.Map, center: L.LatLngExpression, zoom: number, maxTiles = 48): HTMLImageElement[] {
  const size = map.getSize();
  const images: HTMLImageElement[] = [];
  for (const def of TREK_LAYERS) {
    if (def.minZoom !== undefined && zoom < def.minZoom) continue;
    if (layerOpacityAt(def, zoom) <= 0.02) continue;
    const z = Math.min(Math.round(zoom), def.maxNativeZoom);
    const scale = Math.pow(2, zoom - z);
    const c = map.project(center, z);
    const half = size.divideBy(2 * scale);
    const min = c.subtract(half).divideBy(256).floor();
    const max = c.add(half).divideBy(256).floor();
    const cols = 2 * Math.pow(2, z);
    const rows = Math.pow(2, z);
    const box = def.bounds ? L.latLngBounds(def.bounds) : null;
    for (let y = Math.max(0, min.y); y <= Math.min(rows - 1, max.y); y++) {
      for (let x = min.x; x <= max.x; x++) {
        if (images.length >= maxTiles) return images;
        if (box) {
          const nw = map.unproject(L.point(x * 256, y * 256), z);
          const se = map.unproject(L.point((x + 1) * 256, (y + 1) * 256), z);
          if (!box.intersects(L.latLngBounds(nw, se))) continue;
        }
        const wrappedX = ((x % cols) + cols) % cols;
        const img = new Image();
        img.decoding = 'async';
        img.src = trekTileUrl(def, z, wrappedX, y);
        images.push(img);
      }
    }
  }
  return images;
}
