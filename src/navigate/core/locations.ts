import sampleData from '../data/jezero-sample-sites.json' with { type: 'json' };
import { LANDMARKS } from '../../explore/landmarks.ts';
import { normalizeLon, type LatLon } from './marsGeo.ts';

/**
 * Database of verified Martian locations for search, markers and science routing.
 *
 * Sources, and nothing else:
 *  - NASA Mars 2020 rover localizations (MMGIS) joined with NASA's published sample list, for the
 *    landing site and every sampling site (src/navigate/data/jezero-sample-sites.json, built by
 *    scripts/build-jezero-locations.mjs).
 *  - The IAU/USGS Gazetteer of Planetary Nomenclature, for officially named features (in and around
 *    Jezero, and the 26 global landmarks shared with the globe explorer).
 * Informal regions (Séítah, the delta front, the upper fan...) are placed at the centroid of NASA's
 * sampling sites in that region, and say so in their accuracy note.
 */

export type LocationScale = 'global' | 'regional' | 'local';

export interface MarsLocation extends LatLon {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  region: string;
  description: string;
  mission: string | null;
  source: string;
  sourceUrl: string;
  /** Coordinate reference convention */
  convention: string;
  /** Human-readable accuracy statement */
  accuracy: string;
  /** Approximate position uncertainty in metres, when it can be stated */
  accuracyM: number | null;
  datasets: string[];
  /**
   * Curated scientific weight used by the Scientific Discovery mode (documented, not measured):
   * 3 = Perseverance sampling site or key mission discovery, 2 = feature studied by the rover or a
   * major region, 1 = officially named feature, 0 = navigation reference only.
   */
  scienceValue: 0 | 1 | 2 | 3;
  scale: LocationScale;
}

const CONVENTION = 'Planetocentric latitude, east-positive longitude, Mars 2000 sphere';
const NASA_SAMPLES_URL = 'https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/';
const MMGIS_URL = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';
const GAZETTEER_URL = 'https://planetarynames.wr.usgs.gov/';
const JEZERO_DATASETS = [
  'USGS Mars 2020 CTX DEM mosaic (20 m)',
  'Mars Trek: MRO CTX mosaic (~6 m)',
  'Mars Trek: MRO HiRISE orthomosaic (25 cm)',
];
const ROVER_SOURCE = 'NASA Mars 2020: rover localization (MMGIS) at the sol the sample was sealed, NASA sample list';

type Sample = (typeof sampleData.samples)[number];

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const bySite = new Map<string, Sample[]>();
for (const s of sampleData.samples) {
  if (s.type === 'Atmospheric') continue; // Roubion was an atmosphere sample, not a rock site
  const list = bySite.get(s.feature) ?? [];
  list.push(s);
  bySite.set(s.feature, list);
}

/** What NASA's list says about each sampled rock or feature, kept to the published facts. */
const SAMPLE_SITE_NOTES: Record<string, { description: string; aliases?: string[]; value?: 2 | 3 }> = {
  Rochette: {
    description: 'Rock on Artuby Ridge that gave Perseverance its first rock cores. Igneous rock of the crater floor.',
    aliases: ['Artuby Ridge'],
  },
  Brac: { description: 'Igneous rock in South Séítah, an olivine-rich part of the crater floor.', aliases: ['South Séítah'] },
  Issole: { description: 'Igneous rock in South Séítah, sampled twice by Perseverance.' },
  Sid: { description: 'Igneous rock at the Ch’ał outcrop near the Octavia E. Butler landing site.', aliases: ['Ch’ał outcrop', 'Chal'] },
  'Skinner Ridge': { description: 'Sedimentary rock at the front of Jezero’s western delta, the first delta-front samples.' },
  'Wildcat Ridge': {
    description: 'Fine-grained sedimentary rock at the delta front, in the area called Hogwallow Flats, where Perseverance’s SHERLOC instrument detected organic signals.',
  },
  Amalik: { description: 'Sedimentary rock on the delta front, sampled twice.' },
  'Hidden Harbor': { description: 'Sedimentary rock on the delta front.' },
  'Observation Mountain': { description: 'Regolith (loose surface material) sampled on the delta front, likely a mix of sedimentary and igneous grains.' },
  Berea: { description: 'Sedimentary rock on the upper fan, above the delta front.' },
  'Emerald Lake': { description: 'Sedimentary rock on the upper fan.' },
  'Dream Lake': { description: 'Sedimentary rock on the upper fan.' },
  'Hans Amundsen Memorial Workspace': { description: 'Sedimentary rock in the margin unit, near the crater’s inner rim.' },
  'Turquoise Bay': { description: 'Sedimentary rock in the margin unit.' },
  'Bunsen Peak': { description: 'Silica-cemented carbonate rock in the margin unit.' },
  'Cheyava Falls': {
    description: 'Sedimentary rock in Neretva Vallis, the ancient river valley that fed the lake. NASA described features in this rock as a potential biosignature that needs further study.',
  },
  'Shallow Bay': { description: 'Igneous or impact-melted rock on Witch Hazel Hill, on the crater rim.' },
  Tablelands: { description: 'Serpentinite on Witch Hazel Hill, a rock formed when water reacts with olivine-rich rock.' },
  'Broom Point': { description: 'Igneous or impact-melted rock on Witch Hazel Hill, on the crater rim.' },
};

function sampleSiteRecord(feature: string, samples: Sample[]): MarsLocation {
  const first = samples[0];
  const note = SAMPLE_SITE_NOTES[feature];
  const names = samples.map((s) => `${s.name} (sample ${s.number}, sol ${s.solSealed})`).join('; ');
  const maxOffset = Math.max(...samples.map((s) => s.maxOffsetM ?? 0));
  return {
    id: `m20-${slug(feature)}`,
    name: feature,
    aliases: note?.aliases ?? [],
    lat: first.lat,
    lon: normalizeLon(first.lon),
    category: `Perseverance sample site · ${first.type.toLowerCase()}`,
    region: `Jezero Crater · ${first.location}`,
    description: `${note?.description ?? `${first.type} sample site.`} Samples: ${names}.`,
    mission: 'Mars 2020 Perseverance',
    source: ROVER_SOURCE,
    sourceUrl: NASA_SAMPLES_URL,
    convention: CONVENTION,
    accuracy: `Rover position on sol ${first.localization.sol}; the sampling spot lies within about ${maxOffset} m (distance to the next published localization).`,
    accuracyM: maxOffset,
    datasets: JEZERO_DATASETS,
    scienceValue: note?.value ?? 3,
    scale: 'local',
  };
}

function centroid(points: LatLon[]): LatLon {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
}

const sitesIn = (location: string) => sampleData.samples.filter((s) => s.location === location);

function regionRecord(
  id: string,
  name: string,
  samples: Sample[],
  description: string,
  extentNote: string,
  aliases: string[] = []
): MarsLocation {
  const c = centroid(samples);
  return {
    id,
    name,
    aliases,
    lat: c.lat,
    lon: normalizeLon(c.lon),
    category: 'Geologic region (informal name)',
    region: 'Jezero Crater',
    description,
    mission: 'Mars 2020 Perseverance',
    source: `Centroid of NASA Perseverance sampling sites in this region (${[...new Set(samples.map((s) => s.feature))].join(', ')})`,
    sourceUrl: NASA_SAMPLES_URL,
    convention: CONVENTION,
    accuracy: `Representative point, not a boundary: ${extentNote}`,
    accuracyM: null,
    datasets: JEZERO_DATASETS,
    scienceValue: 2,
    scale: 'local',
  };
}

const landing: MarsLocation = {
  id: 'octavia-e-butler-landing',
  name: 'Octavia E. Butler Landing Site',
  aliases: ['Perseverance landing site', 'Mars 2020 landing site', 'Butler landing'],
  lat: sampleData.landing.lat,
  lon: normalizeLon(sampleData.landing.lon),
  category: 'Rover landing site',
  region: 'Jezero Crater',
  description:
    'Where NASA’s Perseverance rover landed on 18 February 2021, on the floor of Jezero Crater. Named after the science-fiction author Octavia E. Butler.',
  mission: 'Mars 2020 Perseverance',
  source: `NASA Mars 2020 rover localization, sol ${sampleData.landing.localization.sol} (first position fix)`,
  sourceUrl: MMGIS_URL,
  convention: CONVENTION,
  accuracy: 'Rover localization (metres)',
  accuracyM: 5,
  datasets: JEZERO_DATASETS,
  scienceValue: 2,
  scale: 'local',
};

const wildcat = bySite.get('Wildcat Ridge')!;
const hogwallow: MarsLocation = {
  ...sampleSiteRecord('Wildcat Ridge', wildcat),
  id: 'hogwallow-flats',
  name: 'Hogwallow Flats',
  aliases: ['Wildcat Ridge area'],
  category: 'Geologic area (informal name)',
  description:
    'A stretch of fine-grained, layered rock at the base of the delta front. Perseverance returned here to sample the mudstone Wildcat Ridge, in which it detected organic signals.',
  accuracy: 'Placed at the Wildcat Ridge sampling site, which the Mastcam-Z team locates in Hogwallow Flats; the flats extend beyond this point.',
  source: `${ROVER_SOURCE}; area identification: Mastcam-Z team (mastcamz.asu.edu)`,
  scienceValue: 2,
};

/** IAU-named features in and around Jezero (Gazetteer of Planetary Nomenclature, centre points). */
const IAU_JEZERO: Array<[string, number, number, number, string, string]> = [
  ['Belva', 18.48, 77.38, 0.9, 'Crater', 'A small impact crater on top of the western delta. Its walls expose the delta’s layered sediments, which Perseverance imaged from the rim.'],
  ['Hartwell', 18.53, 77.72, 1.7, 'Crater', 'A small crater on the floor of Jezero, named in 2020 when features of the Mars 2020 landing region were given official names.'],
  ['Marysville', 18.13, 77.18, 1.85, 'Crater', 'A small crater in the Jezero region, named in 2020.'],
  ['Dacono', 18.34, 77.95, 2.2, 'Crater', 'A small crater in the eastern part of the Jezero region, named in 2020.'],
  ['Sedona', 17.84, 77.54, 7.4, 'Crater', 'A 7.4 km crater south of Jezero, named in 2020.'],
  ['Angelica', 18.65, 76.95, 3.5, 'Crater', 'A 3.5 km crater west of Jezero, named in 2020.'],
  ['Ulricehamn', 17.95, 76.91, 2.34, 'Crater', 'A small crater west of Jezero, named in 2020.'],
  ['Neretva Vallis', 18.55, 77.2, 17, 'Valley', 'The ancient river valley that entered Jezero from the west and built its delta.'],
  ['Sava Vallis', 19.09, 77.13, 62, 'Valley', 'A second ancient inlet valley that reached Jezero from the north.'],
  ['Pliva Vallis', 18.67, 78.35, 30, 'Valley', 'A valley on Jezero’s eastern side, interpreted as the outlet where lake water once overflowed the rim.'],
  ['Una Vallis', 18.29, 77.07, 5, 'Valley', 'A small valley west of Jezero, named in 2020.'],
  ['Jezero Mons', 18.16, 78.23, 27, 'Mountain', 'A 27 km mountain beside Jezero’s southeastern rim, named in 2021.'],
  ['Nili Planum', 18.6, 77.1, 128.55, 'Plain', 'The plain surrounding Jezero to the west.'],
];

const iauJezero: MarsLocation[] = IAU_JEZERO.map(([name, lat, lon, diameterKm, kind, description]) => ({
  id: `iau-${slug(name)}`,
  name,
  aliases: [],
  lat,
  lon: normalizeLon(lon),
  category: `IAU-named ${kind.toLowerCase()} · ${diameterKm} km`,
  region: 'Jezero region',
  description,
  mission: null,
  source: 'IAU/USGS Gazetteer of Planetary Nomenclature (feature centre)',
  sourceUrl: GAZETTEER_URL,
  convention: CONVENTION,
  accuracy: `Gazetteer feature centre (2 decimal places, about ±0.3 km); the feature is ${diameterKm} km across.`,
  accuracyM: 300,
  datasets: JEZERO_DATASETS,
  scienceValue: name === 'Neretva Vallis' || name === 'Belva' ? 2 : 1,
  scale: diameterKm > 15 ? 'regional' : 'local',
}));

const global: MarsLocation[] = LANDMARKS.map((l) => ({
  id: `landmark-${l.id}`,
  name: l.name,
  aliases: l.id === 'jezero' ? ['Jezero'] : [],
  lat: l.lat,
  lon: normalizeLon(l.lon),
  category: l.category,
  region: 'Mars',
  description: l.summary,
  mission:
    l.id === 'jezero'
      ? 'Mars 2020 Perseverance'
      : l.id === 'gale'
        ? 'Mars Science Laboratory Curiosity'
        : l.id === 'gusev'
          ? 'Mars Exploration Rover Spirit'
          : l.id === 'meridiani'
            ? 'Mars Exploration Rover Opportunity'
            : l.id === 'elysium-planitia'
              ? 'InSight'
              : null,
  source: 'IAU/USGS Gazetteer of Planetary Nomenclature (feature centre)',
  sourceUrl: GAZETTEER_URL,
  convention: CONVENTION,
  accuracy: `Gazetteer feature centre; the feature is about ${Math.round(l.diameterKm).toLocaleString('en-US')} km across.`,
  accuracyM: null,
  datasets: ['Mars Trek: Viking MDIM 2.1 colour mosaic (232 m)'],
  scienceValue: 0,
  scale: 'global',
}));

const sampleSites = [...bySite.entries()].map(([feature, samples]) => sampleSiteRecord(feature, samples));

const regions: MarsLocation[] = [
  regionRecord(
    'jezero-delta-front',
    'Jezero Delta (delta front)',
    sitesIn('Delta Front'),
    'The front of the fan-shaped delta built by the river that flowed in through Neretva Vallis. Its layered sediments were laid down where the river met the lake, and Perseverance sampled them in 2022.',
    'the delta covers several kilometres of the crater’s western floor.',
    ['Jezero Delta', 'Western delta', 'Delta front']
  ),
  regionRecord(
    'jezero-upper-fan',
    'Upper fan',
    sitesIn('Upper Fan'),
    'The top of the western fan, above the delta front, explored by Perseverance in 2023.',
    'the upper fan spans a few kilometres.',
    ['Upper delta']
  ),
  regionRecord(
    'jezero-margin-unit',
    'Margin unit',
    sitesIn('Margin Unit'),
    'Rocks along the inner edge of the crater rim, explored by Perseverance in 2023–2024. Sampled rocks include a silica-cemented carbonate.',
    'the unit runs along the inside of the western rim.',
    ['Margin carbonates']
  ),
  regionRecord(
    'seitah-south',
    'Séítah (south)',
    sitesIn('South Séítah'),
    'A region of olivine-rich igneous rock on the crater floor, west of the landing site, explored by Perseverance in 2021. Its name means “amidst the sand” in Navajo.',
    'Séítah covers several square kilometres; this point is the centre of its southern sampling sites.',
    ['Seitah', 'Séítah']
  ),
  regionRecord(
    'witch-hazel-hill',
    'Witch Hazel Hill',
    sitesIn('Crater Rim (Witch Hazel Hill)'),
    'A hill on Jezero’s western crater rim where Perseverance sampled rim rocks in 2025, including a serpentinite.',
    'the hill spans several hundred metres.',
    ['Crater rim']
  ),
];

export const LOCATIONS: MarsLocation[] = [landing, ...regions, hogwallow, ...sampleSites, ...iauJezero, ...global];

const BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

export function locationById(id: string | null | undefined): MarsLocation | null {
  return (id && BY_ID.get(id)) || null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').toLowerCase();

/** Autocomplete search over names and aliases (then category and region), best matches first. */
export function searchLocations(query: string, limit = 8): MarsLocation[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: Array<[number, MarsLocation]> = [];
  for (const l of LOCATIONS) {
    const names = [l.name, ...l.aliases].map(fold);
    let score = -1;
    if (names.some((n) => n === q)) score = 0;
    else if (names.some((n) => n.startsWith(q))) score = 1;
    else if (names.some((n) => n.split(/[\s(),-]+/).some((w) => w.startsWith(q)))) score = 2;
    else if (names.some((n) => n.includes(q))) score = 3;
    else if (fold(l.category).includes(q) || fold(l.region).includes(q)) score = 4;
    if (score >= 0) scored.push([score + (l.scale === 'local' ? 0 : 0.1), l]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([, l]) => l);
}
