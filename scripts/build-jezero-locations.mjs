// Builds src/navigate/data/jezero-sample-sites.json: where Perseverance collected its samples.
//
// Two NASA sources, joined by sol:
//  1. The sample list (sample, sol sealed, rock/feature, sampling location, rock type), from
//     https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ (transcribed below).
//  2. Perseverance's localized positions, from NASA's Mars 2020 mission map (MMGIS):
//     https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
// The rover stays parked while coring, so each sample is placed at the rover's last localized
// position on or before the sol it was sealed. Samples whose sol is not yet published are omitted.
//
// Usage: node scripts/build-jezero-locations.mjs <path to M20_waypoints.json>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-jezero-locations.mjs <M20_waypoints.json>');
  process.exit(1);
}

// [number, sample, sol sealed, date sealed, rock/feature, sampling location, type] — as published by NASA
const SAMPLES = [
  [1, 'Roubion', 164, '2021-08-06', 'Roubion', 'Polygon Valley', 'Atmospheric'],
  [2, 'Montdenier', 194, '2021-09-06', 'Rochette', 'Artuby Ridge', 'Igneous'],
  [3, 'Montagnac', 196, '2021-09-08', 'Rochette', 'Artuby Ridge', 'Igneous'],
  [4, 'Salette', 262, '2021-11-15', 'Brac', 'South Séítah', 'Igneous'],
  [5, 'Coulettes', 271, '2021-11-24', 'Brac', 'South Séítah', 'Igneous'],
  [6, 'Robine', 298, '2021-12-22', 'Issole', 'South Séítah', 'Igneous'],
  [7, 'Malay', 337, '2022-01-31', 'Issole', 'South Séítah', 'Igneous'],
  [8, 'Ha’ahóni', 371, '2022-03-07', 'Sid', 'Octavia E. Butler Landing / Ch’ał outcrop', 'Igneous'],
  [9, 'Atsá', 377, '2022-03-13', 'Sid', 'Octavia E. Butler Landing / Ch’ał outcrop', 'Igneous'],
  [10, 'Swift Run', 490, '2022-07-07', 'Skinner Ridge', 'Delta Front', 'Sedimentary'],
  [11, 'Skyland', 495, '2022-07-12', 'Skinner Ridge', 'Delta Front', 'Sedimentary'],
  [12, 'Hazeltop', 509, '2022-07-27', 'Wildcat Ridge', 'Delta Front', 'Sedimentary'],
  [13, 'Bearwallow', 516, '2022-08-03', 'Wildcat Ridge', 'Delta Front', 'Sedimentary'],
  [14, 'Shuyak', 575, '2022-10-02', 'Amalik', 'Delta Front', 'Sedimentary'],
  [15, 'Mageik', 619, '2022-11-16', 'Amalik', 'Delta Front', 'Sedimentary'],
  [16, 'Kukaklek', 631, '2022-11-29', 'Hidden Harbor', 'Delta Front', 'Sedimentary'],
  [17, 'Atmo Mountain', 634, '2022-12-02', 'Observation Mountain', 'Delta Front', 'Regolith'],
  [18, 'Crosswind Lake', 639, '2022-12-07', 'Observation Mountain', 'Delta Front', 'Regolith'],
  [19, 'Melyn', 749, '2023-03-30', 'Berea', 'Upper Fan', 'Sedimentary'],
  [20, 'Otis Peak', 832, '2023-06-23', 'Emerald Lake', 'Upper Fan', 'Sedimentary'],
  [21, 'Pilot Mountain', 913, '2023-09-15', 'Dream Lake', 'Upper Fan', 'Sedimentary'],
  [22, 'Pelican Point', 923, '2023-09-25', 'Hans Amundsen Memorial Workspace', 'Margin Unit', 'Sedimentary'],
  [23, 'Lefroy Bay', 949, '2023-10-21', 'Turquoise Bay', 'Margin Unit', 'Sedimentary'],
  [24, 'Comet Geyser', 1088, '2024-03-12', 'Bunsen Peak', 'Margin Unit', 'Silica-cemented carbonate'],
  [25, 'Sapphire Canyon', 1215, '2024-07-21', 'Cheyava Falls', 'Neretva Vallis', 'Sedimentary'],
  [26, 'Silver Mountain', 1401, '2025-01-28', 'Shallow Bay', 'Crater Rim (Witch Hazel Hill)', 'Igneous/impactite'],
  [27, 'Green Gardens', 1433, '2025-03-02', 'Tablelands', 'Crater Rim (Witch Hazel Hill)', 'Serpentinite'],
  [28, 'Main River', 1441, '2025-03-10', 'Broom Point', 'Crater Rim (Witch Hazel Hill)', 'Igneous/impactite'],
];

const waypoints = JSON.parse(fs.readFileSync(src, 'utf8'))
  .features.map((f) => f.properties)
  .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  .sort((a, b) => a.sol - b.sol || a.site - b.site || a.drive - b.drive);

const landing = waypoints[0];

// Great-circle distance in metres on the Mars 2000 sphere used by the localizations
const distanceM = (a, b) => {
  const R = 3396190;
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const samples = SAMPLES.map(([number, name, sol, date, feature, location, type]) => {
  const before = waypoints.filter((w) => w.sol <= sol);
  const at = before[before.length - 1];
  if (!at) throw new Error(`No localization before sol ${sol}`);
  // The file holds end-of-drive fixes, not every drive. If the rover moved between this fix and the
  // sealing sol, it was somewhere on the way to the next fix: that distance bounds the uncertainty.
  const next = waypoints[waypoints.indexOf(at) + 1];
  const uncertaintyM = next ? Math.round(distanceM(at, next)) : null;
  return {
    number,
    name,
    solSealed: sol,
    dateSealed: date,
    feature,
    location,
    type,
    lat: Number(at.lat.toFixed(6)),
    lon: Number(at.lon.toFixed(6)),
    elevationM: at.elev_geoid > -9000 ? Number(at.elev_geoid.toFixed(1)) : null,
    localization: { sol: at.sol, site: at.site, drive: at.drive, note: at.Note },
    // Upper bound on how far the sampling spot can be from this position
    maxOffsetM: uncertaintyM,
    nextLocalizationSol: next?.sol ?? null,
  };
});

const out = {
  generatedFrom: [
    'NASA Mars 2020 rock samples list: https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/',
    'NASA Mars 2020 MMGIS rover localizations: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
  ],
  method: 'Each sample is placed at the rover’s last localized position on or before the sol the sample was sealed.',
  coordinateConvention: 'Planetocentric latitude, longitude positive east (−180…180), Mars 2000 sphere',
  landing: {
    lat: Number(landing.lat.toFixed(6)),
    lon: Number(landing.lon.toFixed(6)),
    elevationM: Number(landing.elev_geoid.toFixed(1)),
    localization: { sol: landing.sol, site: landing.site, drive: landing.drive, note: landing.Note },
  },
  samples,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '..', 'src', 'navigate', 'data', 'jezero-sample-sites.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${samples.length} sample sites to ${outPath}`);
for (const s of samples) console.log(`${String(s.number).padStart(2)} ${s.name.padEnd(16)} sol ${String(s.solSealed).padStart(4)} → loc sol ${String(s.localization.sol).padStart(4)} (next ${s.nextLocalizationSol}, ≤${s.maxOffsetM} m)  ${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}  ${s.feature}`);
