# Beyond Terra

A cinematic 3D Mars intro that descends straight into a full-screen, interactive NASA Mars Trek map of Jezero Crater.

Built with React 18, TypeScript (map and app shell), Three.js, React Three Fiber, GSAP and Leaflet.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # production build in dist/
```

The intro plays once per browser session. Add `?intro` to the URL to see it again.

## What happens on load

| Time | Beat |
| --- | --- |
| 0.0–3.3 s | The original intro: Mars emerges from darkness, BEYOND TERRA settles over the rotating planet |
| 3.3–4.65 s | The title lifts away. The camera falls toward the surface while the planet turns Jezero Crater to dead centre |
| 4.2 s | Handoff. The map has been sitting underneath at the same scale (about 1,700 km up) with its tiles already loaded |
| 4.2–7.0 s | The globe dissolves; the map keeps descending to an orbital view of Jezero and pulls into focus |

Skipping (click, tap, Enter, Space, Escape) hands over to the map at once and it flies down in 1.8 s. With reduced motion, both the intro and the map use plain crossfades and the map never animates its camera. Without WebGL, a title-only intro hands over to the map.

## The map

**Imagery.** All imagery comes from NASA Mars Trek's WMTS tile service and is shown untinted:

| Layer | Trek product | Zoom |
| --- | --- | --- |
| Viking MDIM 2.1 colour mosaic, global, 232 m/px | `Mars_Viking_MDIM21_ClrMosaic_global_232m` | native to 7 |
| MRO CTX mosaic of Jezero, ~6 m/px | `Jezero_CTX_BlockAdj_dd` | fades in 6.8–8, native to 12 |
| MRO HiRISE orthomosaic of the Mars 2020 landing site, 25 cm/px | `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd` | fades in 11–11.8, native to 17 |

**Coordinate system.** Trek serves Mars in an equirectangular projection on the Mars 2000 sphere (IAU2000:49900, radius 3,396,190 m), with longitudes from −180° to 180°, east positive. Tiles are 256 px. Level 0 is two columns by one row, row 0 is the north edge, and the URL order is `{z}/{y}/{x}`. The map uses Leaflet's plate carrée CRS, which has exactly this tile pyramid, with the Mars radius in place of Earth's (`src/map/marsTrek.ts`). This is not Web Mercator.

**Navigation**
- Drag to pan, with inertia.
- Mouse wheel and trackpad zoom smoothly around the cursor.
- Double-click to zoom in; Shift+double-click to zoom out.
- Pinch to zoom on touch screens.
- Arrow keys pan; + and − zoom.
- Longitude wraps forever in both directions. Latitude stops at the poles, and the minimum zoom keeps the whole planet filling the screen height.
- Reset flies back to Jezero the short way round.

**Loading and failure**
- Only tiles inside the viewport are requested, and regional layers only within their coverage boxes.
- While the intro plays, the map preloads the tiles for the orbital view.
- New tiles fade in over 0.45 s.
- If Trek fails or never answers before any imagery loads, the map shows "Mars imagery is unavailable" with a Try again button. It retries automatically when the browser comes back online. It never draws a placeholder map.

## Building on the map

`<MarsMap>` is reusable and renders any children as overlays above the imagery. Inside them, `useMarsMap()` gives you the Leaflet map and the view controls:

```tsx
import { MarsMap, useMarsMap } from './map';

function RouteLayer() {
  const { map } = useMarsMap();
  // e.g. L.polyline(points).addTo(map) in an effect
  return null;
}

<MarsMap>
  <RouteLayer />
</MarsMap>
```

The `MarsMapHandle` ref exposes `reveal()`, `resetView()` and `getMap()`. In development builds the map is also available in the console as `window.__marsMap`.

## Where things live

```
src/
  App.tsx                    Map underneath, intro on top, handoff between them
  map/
    marsTrek.ts              Trek endpoints, Mars CRS, layers, Jezero framing, tile prefetch
    MarsMap.tsx              The map component (Leaflet), reveal and reset, loading and error states
    smoothZoom.ts            Spring-eased wheel, double-click and button zoom
    MapControls.tsx          Zoom in, zoom out, return to Jezero
    MapAttribution.tsx       Credits for the Trek products on screen
    useTileHealth.ts         Detects a Trek outage without faking imagery
    MarsMapContext.ts        useMarsMap() for future overlays
    map.css                  Interface styling in the Beyond Terra palette
  intro/                     The 3D intro (unchanged look; adds the descent)
    descent.js               Camera fall and Jezero alignment, shared by every renderer
    introConfig.js           Timing, colours, camera, handoff zoom maths
    introTimeline.js         GSAP sequence and handoff cue
    ...
public/textures/             Globe textures for the intro only (not used by the map)
```

## Credits

- Map imagery: NASA Mars Trek (https://trek.nasa.gov/mars/). Viking MDIM 2.1 (NASA/USGS); MRO CTX (NASA/JPL-Caltech/MSSS); MRO HiRISE (NASA/JPL-Caltech/University of Arizona).
- Intro globe: colour map from Solar System Scope (CC BY 4.0), based on NASA imagery; relief from MOLA elevation data.
