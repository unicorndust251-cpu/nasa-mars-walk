/**
 * The 26 famous Martian landmarks shown on the globe.
 *
 * Coordinates are feature centres from the IAU/USGS Gazetteer of Planetary Nomenclature
 * (planetocentric latitude, longitude 0–360° east), checked against the Gazetteer's
 * MARS_nomenclature_center_pts dataset. Large features (basins, plains, canyons) span
 * hundreds to thousands of kilometres; the centre is the Gazetteer's reference point,
 * not a precise spot. The Medusae Fossae Formation has no official centre of its own:
 * it uses the IAU feature Medusae Fossae, which lies within the formation.
 *
 * Each landmark also carries the checkpoints of its local exploration mission. Those
 * routes are simulated (see route.ts): checkpoint names describe the kind of terrain
 * found at the site, not surveyed waypoints.
 */

export interface Checkpoint {
  name: string;
  fact: string;
}

export interface Landmark {
  id: string;
  name: string;
  /** Planetocentric latitude, degrees, north positive */
  lat: number;
  /** Longitude, degrees east, 0–360 */
  lon: number;
  category: string;
  /** Gazetteer diameter in km: used to frame the feature on the map */
  diameterKm: number;
  /** Scientific importance, shown in the info panel */
  summary: string;
  checkpoints: Checkpoint[];
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    lat: 18.65,
    lon: 226.2,
    category: 'Shield volcano',
    diameterKm: 610,
    summary:
      'The tallest volcano in the solar system, rising about 22 km above the Mars datum and spreading roughly 600 km across. With no plate tectonics to carry the crust away from its magma source, lava kept piling up in one place for hundreds of millions of years.',
    checkpoints: [
      { name: 'Basal escarpment', fact: 'A ring of cliffs up to about 8 km high surrounds the volcano, possibly where its flanks slumped outward under their own weight.' },
      { name: 'Lava flow fields', fact: 'Long, lobed lava flows drape the flanks. Crater counts suggest some are only tens to hundreds of millions of years old, young by Martian standards.' },
      { name: 'Summit caldera', fact: 'The summit holds six overlapping collapse craters, together about 80 by 60 km and up to 3 km deep, formed as magma chambers drained.' },
    ],
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    lat: -14.01,
    lon: 301.41,
    category: 'Canyon system',
    diameterKm: 3761,
    summary:
      'A canyon system more than 4,000 km long, up to 200 km wide and up to 7 km deep, one of the largest in the solar system. It probably began as cracks in the crust when the Tharsis volcanic region swelled, then widened through collapse, landslides and erosion.',
    checkpoints: [
      { name: 'Canyon rim overlook', fact: 'The canyon walls expose kilometres of layered rock, a cross-section through billions of years of Martian history.' },
      { name: 'Landslide deposits', fact: 'Giant landslides have run out across the canyon floor for tens of kilometres, some among the largest known in the solar system.' },
      { name: 'Interior layered deposits', fact: 'Mounds of finely layered sediment rise from the canyon floors. Orbiters have detected sulfate minerals in them, a sign that water was once involved.' },
    ],
  },
  {
    id: 'jezero',
    name: 'Jezero Crater',
    lat: 18.41,
    lon: 77.69,
    category: 'Impact crater · ancient lake',
    diameterKm: 47.5,
    summary:
      'A 45 km crater that held a lake around 3.5 billion years ago, fed by a river that built a delta on its western side. NASA’s Perseverance rover landed here on 18 February 2021 to search for signs of ancient life and collect rock samples for a possible return to Earth.',
    checkpoints: [
      { name: 'Crater floor', fact: 'Perseverance found the crater floor is made of volcanic rock that was later altered by water, not the lake mud scientists first expected.' },
      { name: 'Delta front', fact: 'The fan-shaped delta preserves layered sediments laid down where the river met the lake, ideal places to trap and preserve organic material.' },
      { name: 'Crater rim', fact: 'Rocks on the rim may include some of the oldest crust in the region, thrown up by the impact that formed the crater.' },
    ],
  },
  {
    id: 'gale',
    name: 'Gale Crater',
    lat: -5.37,
    lon: 137.81,
    category: 'Impact crater',
    diameterKm: 154,
    summary:
      'A 154 km crater with a 5 km high mound of layered rock, Aeolis Mons (Mount Sharp), at its centre. NASA’s Curiosity rover landed here in August 2012 and showed that the crater once held lakes with water that could have supported microbial life.',
    checkpoints: [
      { name: 'Ancient lakebed', fact: 'Mudstones studied by Curiosity formed in a calm lake with near-neutral water and the chemical ingredients life needs.' },
      { name: 'Mount Sharp foothills', fact: 'The mountain’s layers change from clay-rich to sulfate-rich rocks going upward, a record of the climate drying out over time.' },
      { name: 'Dark dune field', fact: 'Curiosity drove among the Bagnold Dunes, the first active sand dunes ever visited on another planet.' },
    ],
  },
  {
    id: 'hellas',
    name: 'Hellas Planitia',
    lat: -42.43,
    lon: 70.5,
    category: 'Impact basin',
    diameterKm: 2299,
    summary:
      'One of the largest impact basins in the solar system, about 2,300 km across and around 7 km deep. Its floor holds some of the lowest ground on Mars, where air pressure is nearly twice the planetary average.',
    checkpoints: [
      { name: 'Basin floor', fact: 'At the bottom of Hellas the thicker air means liquid water could briefly stay stable at the right temperatures before boiling or freezing.' },
      { name: 'Lobate debris aprons', fact: 'Radar from orbit revealed that aprons along the basin’s eastern edge are glaciers of water ice buried under a layer of rocky debris.' },
      { name: 'Dust storm corridor', fact: 'Hellas is a frequent birthplace of Martian dust storms, some of which grow to cover much of the planet.' },
    ],
  },
  {
    id: 'argyre',
    name: 'Argyre Planitia',
    lat: -49.84,
    lon: 316.69,
    category: 'Impact basin',
    diameterKm: 893,
    summary:
      'A well-preserved impact basin about 1,800 km across including its mountainous rim, formed roughly 4 billion years ago. Channels entering and leaving the basin suggest it may once have held a lake.',
    checkpoints: [
      { name: 'Rim massifs', fact: 'Rugged mountain blocks ring the basin, raised in moments by the giant impact that formed it.' },
      { name: 'Sinuous ridges', fact: 'Long winding ridges on the floor have been interpreted by some researchers as eskers, deposits left by rivers flowing beneath ancient ice.' },
      { name: 'Inflow channels', fact: 'Valleys cut into the rim show that water once drained into the basin from the surrounding southern highlands.' },
    ],
  },
  {
    id: 'utopia',
    name: 'Utopia Planitia',
    lat: 46.74,
    lon: 117.52,
    category: 'Lowland plain · impact basin',
    diameterKm: 3560,
    summary:
      'The largest recognised impact basin on Mars, about 3,300 km across, now a smooth northern plain. NASA’s Viking 2 landed here in 1976 and China’s Zhurong rover in 2021.',
    checkpoints: [
      { name: 'Scalloped terrain', fact: 'Scallop-shaped hollows form where ice in the ground turns directly to vapour and the surface sinks.' },
      { name: 'Buried ice sheet', fact: 'Radar found a buried ice deposit here holding about as much water as Lake Superior.' },
      { name: 'Polygonal ground', fact: 'Networks of cracks form polygons as icy soil contracts and expands with the seasons, like permafrost on Earth.' },
    ],
  },
  {
    id: 'elysium-planitia',
    name: 'Elysium Planitia',
    lat: 2.98,
    lon: 154.74,
    category: 'Volcanic plain',
    diameterKm: 3001,
    summary:
      'A broad, flat volcanic plain near the equator with some of the youngest lava surfaces on Mars. NASA’s InSight lander touched down here in 2018 and recorded more than 1,300 marsquakes, revealing the planet’s crust, mantle and liquid core.',
    checkpoints: [
      { name: 'Smooth landing plains', fact: 'InSight’s team chose this region because it is flat, low and close to the equator, which is safe for landing and good for solar power.' },
      { name: 'Lava flow margin', fact: 'Lava flows nearby are among the youngest on Mars, showing volcanic activity continued until geologically recent times.' },
      { name: 'Seismic listening post', fact: 'Many of the quakes InSight detected came from the Cerberus Fossae fractures to the northeast, which may still be active today.' },
    ],
  },
  {
    id: 'arcadia',
    name: 'Arcadia Planitia',
    lat: 49.02,
    lon: 188.15,
    category: 'Lowland plain',
    diameterKm: 2245,
    summary:
      'A smooth northern plain of ancient lava and sediment where water ice lies close beneath the surface. That accessible ice makes it a leading candidate region for future human landings.',
    checkpoints: [
      { name: 'Shallow ice zone', fact: 'Orbital mapping shows water ice within about a metre of the surface across much of this region.' },
      { name: 'Expanded craters', fact: 'Some craters here have grown wider as ice in their walls sublimated away, leaving broad, softened bowls.' },
      { name: 'Smooth lowland plains', fact: 'The northern plains sit several kilometres lower than the southern highlands, part of Mars’ great hemispheric divide.' },
    ],
  },
  {
    id: 'planum-boreum',
    name: 'Planum Boreum',
    lat: 87.32,
    lon: 54.96,
    category: 'Polar ice plateau',
    diameterKm: 355,
    summary:
      'The north polar plateau: a dome of water ice and dust about 1,000 km across and up to 3 km thick. Its layers record climate cycles driven by long-term changes in the tilt of Mars’ axis.',
    checkpoints: [
      { name: 'Layered ice cliffs', fact: 'Exposed scarps show hundreds of alternating layers of ice and dust, each a record of past climate.' },
      { name: 'Spiral trough', fact: 'Troughs spiral out from the pole, shaped by winds flowing down off the ice cap and twisted by the planet’s rotation.' },
      { name: 'Residual ice cap', fact: 'In winter a layer of carbon dioxide frost covers the cap; in summer it vanishes, exposing the permanent water ice beneath.' },
    ],
  },
  {
    id: 'planum-australe',
    name: 'Planum Australe',
    lat: -83.35,
    lon: 157.7,
    category: 'Polar ice plateau',
    diameterKm: 1430,
    summary:
      'The south polar plateau, with layered water-ice deposits up to about 3.7 km thick topped by a permanent cap of frozen carbon dioxide. Radar has detected buried CO₂ ice here, and a much-debated bright radar reflection beneath the ice.',
    checkpoints: [
      { name: '“Swiss cheese” terrain', fact: 'Round pits in the carbon dioxide ice grow wider each summer as the ice sublimates, giving the surface a holey look.' },
      { name: 'Spider terrain', fact: 'Branching “spider” channels are carved by jets of CO₂ gas that burst through the ice when spring sunlight warms the ground below.' },
      { name: 'Radar reflector site', fact: 'In 2018 a radar team reported a reflection beneath the ice they interpreted as liquid water; other scientists argue it has a different cause.' },
    ],
  },
  {
    id: 'elysium-mons',
    name: 'Elysium Mons',
    lat: 25.02,
    lon: 147.21,
    category: 'Volcano',
    diameterKm: 401,
    summary:
      'The largest volcano of the Elysium volcanic province, the second great volcanic region on Mars after Tharsis. It rises about 12.6 km above its base and has a summit caldera roughly 14 km wide.',
    checkpoints: [
      { name: 'Lower flanks', fact: 'The volcano’s gentle slopes were built by countless eruptions of runny basaltic lava.' },
      { name: 'Lava channels', fact: 'Narrow channels on the flanks carried lava downhill, some later crusting over to form tubes.' },
      { name: 'Summit caldera', fact: 'The summit crater formed when the roof of an emptied magma chamber collapsed.' },
    ],
  },
  {
    id: 'arsia-mons',
    name: 'Arsia Mons',
    lat: -8.26,
    lon: 239.91,
    category: 'Shield volcano',
    diameterKm: 470,
    summary:
      'The southernmost of the three Tharsis Montes volcanoes, nearly 18 km tall, with a summit caldera about 110 km across, among the largest in the solar system. Fan-shaped deposits on its western flank are thought to be the remains of ancient glaciers.',
    checkpoints: [
      { name: 'Glacial fan deposit', fact: 'Ridges and lobes on the western flank are thought to mark the edges of glaciers that formed when Mars’ axis was more steeply tilted.' },
      { name: 'Cave skylight candidates', fact: 'Dark pits on the flanks, 100–250 m wide, may be skylights into underground lava caves, possible shelters for future explorers.' },
      { name: 'Giant caldera', fact: 'The caldera is so wide that, standing in the middle, its rim would sit below the horizon.' },
    ],
  },
  {
    id: 'pavonis-mons',
    name: 'Pavonis Mons',
    lat: 1.48,
    lon: 247.04,
    category: 'Shield volcano',
    diameterKm: 367,
    summary:
      'The middle of the three Tharsis Montes, sitting almost exactly on the equator. It rises about 14 km and is crowned by a deep caldera around 47 km wide.',
    checkpoints: [
      { name: 'Pit crater chain', fact: 'Lines of collapse pits trace lava tubes and fractures beneath the surface.' },
      { name: 'Glacial ridges', fact: 'Like its neighbours, Pavonis carries ridged deposits on its flank left by ancient glaciers.' },
      { name: 'Summit caldera', fact: 'The deepest part of the caldera drops about 4.5 km below the rim.' },
    ],
  },
  {
    id: 'ascraeus-mons',
    name: 'Ascraeus Mons',
    lat: 11.92,
    lon: 255.92,
    category: 'Shield volcano',
    diameterKm: 456,
    summary:
      'The northernmost and tallest of the Tharsis Montes, rising about 18 km. Its nested summit calderas record repeated cycles of eruption and collapse.',
    checkpoints: [
      { name: 'Flank lava channels', fact: 'Sinuous channels and collapsed lava tubes wind down the volcano’s sides.' },
      { name: 'Fan-shaped deposit', fact: 'A lobed deposit on the northwest flank is interpreted as the remains of a cold-based glacier.' },
      { name: 'Nested calderas', fact: 'Several overlapping collapse craters show the summit sank again and again as magma drained away.' },
    ],
  },
  {
    id: 'alba-mons',
    name: 'Alba Mons',
    lat: 41.08,
    lon: 249.29,
    category: 'Shield volcano',
    diameterKm: 548,
    summary:
      'By area the largest volcano on Mars, with flows spreading well over 1,000 km, yet only about 6.8 km tall. Its slopes are mostly under 1°, so gentle you would hardly notice the climb.',
    checkpoints: [
      { name: 'Low-slope lava plains', fact: 'Extremely fluid lavas spread across vast distances instead of piling up into a steep cone.' },
      { name: 'Graben ring', fact: 'Long parallel fractures (graben) wrap around the volcano, formed as the crust was stretched by the Tharsis bulge.' },
      { name: 'Summit caldera', fact: 'The broad summit holds a caldera complex where the final eruptions took place.' },
    ],
  },
  {
    id: 'noctis-labyrinthus',
    name: 'Noctis Labyrinthus',
    lat: -6.36,
    lon: 258.81,
    category: 'Canyon network',
    diameterKm: 1190,
    summary:
      'The “labyrinth of the night”: a maze of intersecting troughs at the western end of Valles Marineris, high on the Tharsis bulge. Orbiters have found water-altered minerals, including sulfates and clays, in its valleys.',
    checkpoints: [
      { name: 'Plateau fractures', fact: 'The maze began as a network of faults where the crust stretched and pulled apart.' },
      { name: 'Trough floor', fact: 'Many troughs deepened through collapse, possibly as ground ice or water drained from below.' },
      { name: 'Hydrated mineral outcrops', fact: 'Layers rich in sulfates and clays point to water interacting with the rocks here.' },
    ],
  },
  {
    id: 'mawrth-vallis',
    name: 'Mawrth Vallis',
    lat: 22.43,
    lon: 343.03,
    category: 'Ancient valley',
    diameterKm: 635,
    summary:
      'An ancient outflow valley cut through one of the most clay-rich regions on Mars, with layered clay deposits at least 200 m thick. It was a finalist landing site for both Curiosity and the ExoMars Rosalind Franklin rover.',
    checkpoints: [
      { name: 'Layered clay outcrops', fact: 'Bands of iron- and aluminium-rich clays formed through long contact between rock and water.' },
      { name: 'Channel floor', fact: 'Floods once ran through the valley toward the northern lowlands.' },
      { name: 'Dark capping unit', fact: 'A dark, harder layer caps the bright clays and protects them from erosion.' },
    ],
  },
  {
    id: 'oxia-planum',
    name: 'Oxia Planum',
    lat: 17.28,
    lon: 334.29,
    category: 'Plain · rover landing site',
    diameterKm: 231,
    summary:
      'Chosen as the landing site of the European Space Agency’s Rosalind Franklin rover, planned to launch in 2028. Its clay-bearing rocks are about 3.9 billion years old and may preserve traces of early life.',
    checkpoints: [
      { name: 'Clay-bearing plains', fact: 'Widespread iron- and magnesium-rich clays formed in a wet environment early in Mars’ history.' },
      { name: 'Fan remnant', fact: 'Remains of a fan-shaped deposit suggest a river or delta once flowed into the area.' },
      { name: 'Drill site', fact: 'Rosalind Franklin is designed to drill up to 2 m down, below the depth where radiation destroys organic molecules.' },
    ],
  },
  {
    id: 'gusev',
    name: 'Gusev Crater',
    lat: -14.53,
    lon: 175.52,
    category: 'Impact crater',
    diameterKm: 158,
    summary:
      'A 158 km crater fed by the long valley Ma’adim Vallis, once thought to have held a lake. NASA’s Spirit rover landed here in January 2004 and found evidence of hot water and possibly hot springs in the Columbia Hills.',
    checkpoints: [
      { name: 'Basalt plains', fact: 'Spirit first found volcanic basalt covering the crater floor, hiding the older lake sediments.' },
      { name: 'Hills of altered rock', fact: 'In the Columbia Hills, Spirit found rocks chemically changed by water.' },
      { name: 'Silica deposits', fact: 'Soil about 90% silica, churned up by a stuck wheel, likely formed in a hot spring or steam vent, environments that support microbes on Earth.' },
    ],
  },
  {
    id: 'meridiani',
    name: 'Meridiani Planum',
    lat: -0.04,
    lon: 356.86,
    category: 'Plain · rover landing site',
    diameterKm: 1059,
    summary:
      'An equatorial plain where orbiters detected the mineral hematite, which often forms in water. NASA’s Opportunity rover landed here in January 2004 and explored for more than 14 years, driving over 45 km.',
    checkpoints: [
      { name: 'Concretion field', fact: 'Opportunity found small hematite spheres nicknamed “blueberries”, which grew inside rock soaked by groundwater.' },
      { name: 'Sulfate outcrop', fact: 'Layered rocks contained jarosite, a mineral that forms in acidic water.' },
      { name: 'Impact crater rim', fact: 'Craters such as Endeavour exposed older rocks, letting the rover read deeper into Mars’ past.' },
    ],
  },
  {
    id: 'chryse',
    name: 'Chryse Planitia',
    lat: 28.43,
    lon: 319.69,
    category: 'Lowland plain',
    diameterKm: 1542,
    summary:
      'A smooth plain where several giant outflow channels emptied after enormous floods. NASA’s Viking 1 landed here on 20 July 1976, and Mars Pathfinder with the first Mars rover, Sojourner, landed at its edge in 1997.',
    checkpoints: [
      { name: 'Outflow channel mouth', fact: 'Channels such as Kasei, Ares and Tiu Valles carried catastrophic floods that drained into this basin.' },
      { name: 'Boulder-strewn plain', fact: 'Viking 1’s first images showed a rock-littered plain, likely debris from floods and impacts.' },
      { name: 'Streamlined islands', fact: 'Teardrop-shaped hills were carved by floodwater flowing around crater rims.' },
    ],
  },
  {
    id: 'acidalia',
    name: 'Acidalia Planitia',
    lat: 49.76,
    lon: 339.26,
    category: 'Lowland plain',
    diameterKm: 3505,
    summary:
      'A dark northern plain dotted with thousands of small pitted mounds that may be mud volcanoes, places where fluids from underground once reached the surface. It is also where the fictional Ares 3 crew landed in The Martian.',
    checkpoints: [
      { name: 'Mound field', fact: 'Thousands of pitted mounds resemble mud volcanoes on Earth and could sample material from deep below.' },
      { name: 'Dark lowland plains', fact: 'The dark tone comes from basaltic sand and rock that is less covered by bright dust.' },
      { name: 'Polygonal terrain', fact: 'Giant polygons of cracks may have formed as sediment or ice-rich ground dried and contracted.' },
    ],
  },
  {
    id: 'amazonis',
    name: 'Amazonis Planitia',
    lat: 25.75,
    lon: 197.09,
    category: 'Volcanic plain',
    diameterKm: 2809,
    summary:
      'One of the smoothest surfaces known in the solar system, covered by young lava flows with few craters. It gives its name to the Amazonian period, the most recent era of Martian history.',
    checkpoints: [
      { name: 'Smooth plains', fact: 'Laser altimetry showed these plains vary in height by only a few metres over long distances.' },
      { name: 'Young lava flows', fact: 'Few impact craters means the surface is young, resurfaced by lava in the last few hundred million years.' },
      { name: 'Dust devil tracks', fact: 'HiRISE photographed a dust devil here towering about 20 km into the sky.' },
    ],
  },
  {
    id: 'deuteronilus-mensae',
    name: 'Deuteronilus Mensae',
    lat: 45.11,
    lon: 23.92,
    category: 'Mesas & buried glaciers',
    diameterKm: 919,
    summary:
      'A region of flat-topped mesas along the boundary between the southern highlands and northern lowlands. Radar shows the debris aprons around the mesas are glaciers of nearly pure water ice, hundreds of metres thick, buried under rock.',
    checkpoints: [
      { name: 'Mesa escarpment', fact: 'The mesas are remnants of highland crust, left standing as the boundary retreated through erosion.' },
      { name: 'Debris-covered glacier', fact: 'A thin layer of rock and dust protects the ice beneath from sublimating into the thin air.' },
      { name: 'Lineated valley fill', fact: 'Parallel ridges in the valleys trace the slow flow of ice, like glaciers on Earth.' },
    ],
  },
  {
    id: 'medusae-fossae',
    name: 'Medusae Fossae Formation',
    lat: -2.17,
    lon: 195.8,
    category: 'Wind-eroded deposit',
    diameterKm: 279,
    summary:
      'A soft, easily eroded deposit stretching about 5,000 km along the equator, probably made largely of volcanic ash. It is thought to be the largest single source of dust on Mars, and a 2024 radar study suggests it may contain thick layers of ice.',
    checkpoints: [
      { name: 'Yardang field', fact: 'Wind has sculpted the deposit into long ridges called yardangs, all aligned with the prevailing wind.' },
      { name: 'Layered deposits', fact: 'Fine layers suggest repeated explosive eruptions blanketed the region in ash.' },
      { name: 'Radar ice mystery', fact: 'Radar data hint at ice-rich layers up to 3.7 km thick; if melted, it could cover Mars in water about 1.5–2.7 m deep.' },
    ],
  },
];

const BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]));

export function landmarkById(id: string | null | undefined): Landmark | null {
  return (id && BY_ID.get(id)) || null;
}

/** Case- and accent-insensitive search on name, then category. Best matches first. */
export function searchLandmarks(query: string): Landmark[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(query.trim());
  if (!q) return LANDMARKS;
  const scored: Array<[number, Landmark]> = [];
  for (const l of LANDMARKS) {
    const name = fold(l.name);
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    else if (fold(l.category).includes(q)) score = 3;
    if (score >= 0) scored.push([score, l]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(([, l]) => l);
}
