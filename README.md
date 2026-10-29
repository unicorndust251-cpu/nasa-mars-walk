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

## The 3D globe explorer

The **3D globe** button on the map opens an interactive version of the intro's Mars, with the same shaders, textures, atmosphere and starfield, and 26 famous landmarks on it.

**Landmarks**
- 26 glowing, gently pulsing markers fixed to the planet. They turn with it and fade out as they pass behind the horizon.
- Hover shows the name; click or tap flies the globe there, highlights the marker and opens a panel with latitude, longitude, category and why the place matters.
- Search finds any landmark by name or category (`/` focuses it; arrow keys and Enter choose). The empty search lists all 26.
- The globe button, the panel's close button or Escape return to the full planet.
- Drag to turn Mars (with inertia), scroll or pinch to zoom, arrow keys and +/− also work. It drifts slowly when left alone.

Coordinates are feature centres from the IAU/USGS Gazetteer of Planetary Nomenclature, checked against its `MARS_nomenclature_center_pts` dataset (planetocentric latitude, longitude 0–360° E). Several differ from commonly quoted values, for example Deuteronilus Mensae is at 23.9° E and Meridiani Planum at 356.9° E. The Medusae Fossae Formation has no official centre, so it uses the IAU feature Medusae Fossae.

**Astronaut missions.** Each landmark has its own local mission; the landmarks are never joined into one route.
- **Start Exploration** descends from orbit to the site. A sharp image of the ground is built on the fly from Mars Trek's Viking tiles (about 45× sharper than the globe texture), reprojected around the site and colour-matched to the globe.
- A procedural astronaut stands at the start point, walks a smooth route to three checkpoints, faces where it is going and stays on the ground. Movement uses real elapsed time, so speed does not depend on frame rate.
- At each checkpoint it stops and a "Checkpoint reached" card shows the checkpoint's name and a scientific fact. After the last one: "MISSION COMPLETE — EXPLORATION SUCCESSFUL" with a summary.
- Controls: Start, Pause, Resume, Next checkpoint (fast-forward), Restart, Camera follow on/off, Exit. Keyboard: Space starts/pauses/resumes, N skips ahead, Escape exits.
- **Routes are simulated.** No verified, terrain-safe paths exist for most sites, so each route is generated (deterministically, per landmark) and labelled as simulated on screen. The astronaut is drawn about 5 km tall so it can be followed across ~230 m/px imagery; it is labelled "not to scale".

**Links.** The view is kept in the URL: `#globe`, `#globe/olympus-mons`, `#globe/olympus-mons/explore`.

If the browser has no WebGL, the globe button is hidden. If Mars Trek imagery can't load, missions fall back to the globe texture and say so.

## Mars Navigator

The **Navigator** button on the 3D globe opens a panel for planning a geographic route between two points. It's open by default on wide screens and works as a bottom sheet on phones. The astronaut types in both ends; nothing detects a position, and the site has no live positioning on Mars.

- **Start and destination** accept a place name or coordinates. Names match case- and accent-insensitively, partial names suggest matches (`Jez` → Jezero Crater, `Nili` → Nili Fossae, Nili Planum…), and same-named features are told apart by type and position. Coordinates can be typed as `18.40, 77.50`, `5.4S 137.8E` or `18.4N 77.5W`, or entered in the Lat / Lon boxes. Out-of-range values (for example latitude 95°) are rejected with a message.
- **Searchable places:** the 26 featured landmarks plus all 2,051 IAU-approved Mars feature names in the USGS Gazetteer. The Gazetteer list loads the first time a field is used. Only the 26 landmarks keep permanent glowing markers; other places appear only when chosen. A Gazetteer record for the same feature as a landmark (Jezero → Jezero Crater) is merged into the landmark.
- **On the globe:** a green **START** marker, a **MISSION TARGET** beacon (hexagonal pad, cyan beam, ground pulse and reticle) and a glowing dotted orange route that follows the planet's curve and turns with it. The camera flies to each point as it is chosen, then frames the whole route. Routes longer than about 140° of arc get the hemisphere overview instead. **Focus Start**, **Focus Destination**, **Show Full Route** and **Reset Route** do what they say. A landmark's info panel can also hand it to the navigator (**Navigate from here** / **Navigate here**).
- **Distance** is the Haversine great-circle distance on a sphere of radius 3,389.5 km (the Mars mean radius). It updates whenever either end changes. It is a geographic surface distance, not a walking distance.
- **Edge cases:** routes wrap across 0°/360° and pass over the poles. Identical points give 0 km and no line. For exactly opposite points every great circle is equally short, so the route takes a fixed one (due north from the start) and the panel says so.
- **Not a safe path.** The route is labelled *Simulated geographic route — terrain safety not yet verified*. It ignores relief, slopes, rocks and every other hazard.
- **For a future astronaut walk:** the route's evenly spaced waypoints (about every 3 km, each with its distance from the start) are kept in `navStore.getState().route`. `pointAtKm(route, km)` in `routeGeometry.ts` interpolates along them, so an animation can step through a local stretch.

**Coordinates and corrections.** Every place uses its Gazetteer feature centre: planetocentric latitude, longitude 0–360° E. Large features (anything over 60 km) are flagged as having a reference point, not an exact position. The project brief listed reference coordinates for 36 places. Checked against the Gazetteer's `MARS_nomenclature_center_pts` dataset, these differ from the official centres by more than 0.3°, so the official values are used:

| Place | Brief | Gazetteer (used) |
| --- | --- | --- |
| Valles Marineris | −13.74, 300.80 | −14.01, 301.41 |
| Planum Boreum | 85.00, 180.00 | 87.32, 54.96 |
| Planum Australe | −85.00, 180.00 | −83.35, 157.70 |
| Pavonis Mons | 0.80, 246.60 | 1.48, 247.04 |
| Noctis Labyrinthus | −7.00, 258.00 | −6.36, 258.81 |
| Mawrth Vallis | 22.30, 343.50 | 22.43, 343.03 |
| Oxia Planum | 18.20, 335.90 | 17.28, 334.29 |
| Meridiani Planum | −2.00, 5.00 | −0.04, 356.86 |
| Deuteronilus Mensae | 43.90, 337.00 | 45.11, 23.92 |
| Medusae Fossae (Formation) | −5.00, 180.00 | −2.17, 195.80 |
| Nili Fossae | 22.56, 76.80 | 22.02, 76.69 |
| Syrtis Major Planum | 8.40, 69.50 | 9.20, 67.10 |

The other 24 agree to within 0.3° (most to 0.05°). The 26 landmarks already used the Gazetteer values, so they are unchanged. To refresh the name index, download `MARS_nomenclature_center_pts.zip` from the USGS Astrogeology site and run `node scripts/build-mars-places.mjs path/to/MARS_nomenclature_center_pts.dbf`.

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
    marsMaterials.js         Mars, atmosphere and star shaders, shared with the globe explorer
    ...
  explore/                   The 3D globe explorer (loads only when opened)
    landmarks.ts             The 26 landmarks: Gazetteer coordinates, categories, facts, checkpoints
    exploreConfig.ts         Look, feel and scale of the globe and the missions
    explorerStore.ts         Selection and mission state (idle, walking, paused, completed)
    geo.ts                   Lat/lon ↔ globe maths, matched to the texture
    route.ts                 Simulated, deterministic local routes
    ExplorerCanvas.jsx       The scene: globe, camera, picking, mission loop
    markers.js               Glowing markers, horizon fade, screen-space picking
    siteVisuals.js           Imagery patch, route ribbon, checkpoint beacons
    surfacePatch.js          Builds a site's ground image from Mars Trek tiles
    astronaut.js             Procedural astronaut and walk cycle
    Explorer.tsx             Interface: search, landmark panel, mission HUD, navigator
    nav/                     Mars Navigator
      places.ts              Searchable places: featured landmarks + Gazetteer index (lazy)
      data/marsGazetteer.json  2,051 IAU Mars feature names, built by scripts/build-mars-places.mjs
      search.ts              Name matching, suggestions, duplicate names
      coordinates.ts         Lat/lon parsing, validation, 0–360° E normalisation
      distance.ts            Haversine great-circle distance (R = 3,389.5 km)
      routeGeometry.ts       Great-circle waypoints, pointAtKm for future astronaut movement
      navCamera.ts           Camera framing for a point or a whole route
      navStore.ts            Start, destination, route and camera requests
      navLayer.js            Puts the START marker, beacon and route on the planet
      startMarker.js · missionBeacon.js · routeDots.js   The three scene objects
      MarsNavigator.tsx · PlaceField.tsx · nav.css         The panel
scripts/build-mars-places.mjs  Rebuilds the name index from the USGS Gazetteer
public/textures/             Globe textures for the intro and the globe explorer (not used by the map)
```

## Credits

- Map imagery: NASA Mars Trek (https://trek.nasa.gov/mars/). Viking MDIM 2.1 (NASA/USGS); MRO CTX (NASA/JPL-Caltech/MSSS); MRO HiRISE (NASA/JPL-Caltech/University of Arizona).
- Intro globe: colour map from Solar System Scope (CC BY 4.0), based on NASA imagery; relief from MOLA elevation data.
