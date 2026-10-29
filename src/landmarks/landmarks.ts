/**
 * The 26 famous Martian landmarks. Coordinates are approximate reference positions,
 * planetocentric, north positive, longitude 0–360° east (as in the brief). Use
 * `mapLon()` for the −180…180° longitudes the map and globe work in.
 */

export interface Checkpoint {
  name: string;
  fact: string;
}

export interface Landmark {
  id: string;
  name: string;
  /** Degrees, north positive */
  lat: number;
  /** Degrees east, 0–360 */
  lon: number;
  category: string;
  importance: string;
  /** The local exploration route's stops, in walking order. The last one completes the mission. */
  checkpoints: Checkpoint[];
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    lat: 18.4,
    lon: 226.0,
    category: 'Shield volcano',
    importance:
      'The tallest volcano in the Solar System, rising about 22 km above the Martian datum and spreading roughly 600 km across. Its gentle slopes were built by countless fluid basaltic lava flows, and some of its youngest flows suggest volcanic activity in the geologically recent past.',
    checkpoints: [
      {
        name: 'Caldera Rim Overlook',
        fact: 'The summit caldera is a nest of six overlapping collapse pits, up to about 3 km deep, each formed when a magma chamber beneath drained away.',
      },
      {
        name: 'Summit Plateau',
        fact: 'Up here the air pressure is only about an eighth of the Martian average, so the summit sits above most of the planet’s dust and much of its weather.',
      },
      {
        name: 'Lava Channel',
        fact: 'The flanks average a slope of only about 5°: the lava was runny enough to travel hundreds of kilometres before cooling, building a broad shield rather than a steep cone.',
      },
      {
        name: 'Terraced Flank',
        fact: 'Concentric terraces on the upper flanks probably formed by faulting as the immense volcano slowly spread outward under its own weight.',
      },
    ],
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    lat: -13.7,
    lon: 290.8,
    category: 'Canyon system',
    importance:
      'A canyon system about 4,000 km long, up to 200 km wide and as much as 7 km deep, long enough to span the continental United States. It began as tectonic rifting beside the Tharsis volcanic bulge and was widened by collapse, landslides and erosion, exposing billions of years of layered rock.',
    checkpoints: [
      {
        name: 'Canyon Rim',
        fact: 'From the rim, the walls drop as much as 7 km to the canyon floor, more than four times the depth of the Grand Canyon.',
      },
      {
        name: 'Landslide Deposit',
        fact: 'Giant landslides have broken away from the canyon walls, some spreading debris across the floor for tens of kilometres.',
      },
      {
        name: 'Layered Wall Outcrop',
        fact: 'The walls expose kilometres of stacked layers, mostly ancient lava flows, recording a long history of volcanism in the Tharsis region.',
      },
      {
        name: 'Interior Layered Deposit',
        fact: 'Light-toned mounds on the canyon floor contain sulfate minerals detected from orbit, which form when water evaporates or alters rock.',
      },
    ],
  },
  {
    id: 'jezero-crater',
    name: 'Jezero Crater',
    lat: 18.4,
    lon: 77.5,
    category: 'Impact crater · ancient lake',
    importance:
      'A crater about 45 km wide that held a lake roughly 3.5 billion years ago, fed by a river that built a delta on its western side. NASA’s Perseverance rover has explored it since February 2021, collecting rock samples that could one day be returned to Earth to search for signs of ancient life.',
    checkpoints: [
      {
        name: 'Octavia E. Butler Landing',
        fact: 'Perseverance touched down here on 18 February 2021. The landing site is named after the science-fiction author Octavia E. Butler.',
      },
      {
        name: 'Crater Floor',
        fact: 'The rover found that the crater floor is made of igneous rock, formed from lava or magma, that was later altered by water.',
      },
      {
        name: 'Western Delta Front',
        fact: 'The fan-shaped delta was laid down where an ancient river entered the lake. Its fine-grained sediments are prime places to look for preserved biosignatures.',
      },
      {
        name: 'Three Forks Sample Depot',
        fact: 'Between December 2022 and January 2023, Perseverance set ten sealed sample tubes on the ground here as a backup cache for a future return mission.',
      },
    ],
  },
  {
    id: 'gale-crater',
    name: 'Gale Crater',
    lat: -5.4,
    lon: 137.8,
    category: 'Impact crater',
    importance:
      'A 154 km wide crater with a 5 km high mountain of layered sediment, Aeolis Mons (Mount Sharp), at its centre. NASA’s Curiosity rover landed here in August 2012 and showed that Gale once held lakes with the chemistry needed to support microbial life.',
    checkpoints: [
      {
        name: 'Bradbury Landing',
        fact: 'Curiosity was lowered onto this spot by a rocket-powered sky crane in August 2012, the first time that landing system was used.',
      },
      {
        name: 'Yellowknife Bay',
        fact: 'Mudstone drilled here in 2013 showed an ancient lake bed with fresh water and the chemical ingredients microbes could have used for energy.',
      },
      {
        name: 'Mount Sharp Foothills',
        fact: 'The mountain’s layers record a shift from a wetter, clay-forming climate in the lower layers to drier, sulfate-rich conditions higher up.',
      },
      {
        name: 'Bagnold Dunes',
        fact: 'These were the first active sand dunes ever studied up close on another planet. They creep slowly downwind, driven by the thin Martian air.',
      },
    ],
  },
  {
    id: 'hellas-planitia',
    name: 'Hellas Planitia',
    lat: -42.4,
    lon: 70.5,
    category: 'Impact basin',
    importance:
      'One of the largest impact basins in the Solar System, about 2,300 km across and more than 7 km deep. It holds the lowest ground on Mars and the highest air pressure on the planet, which makes it important for understanding where liquid water could briefly exist today.',
    checkpoints: [
      {
        name: 'Basin Floor',
        fact: 'The floor lies more than 7 km below the Martian datum, the deepest ground on the planet.',
      },
      {
        name: 'High-Pressure Zone',
        fact: 'Air pressure down here is nearly twice the Martian average. On the warmest days, liquid water could exist briefly before boiling or freezing.',
      },
      {
        name: 'Glacier-like Flows',
        fact: 'Around the basin’s eastern rim, radar shows that lobate debris aprons are buried glaciers: thick ice protected by a thin cover of rock.',
      },
      {
        name: 'Storm Source',
        fact: 'Hellas often fills with frost, clouds and dust haze, and many regional dust storms begin here.',
      },
    ],
  },
  {
    id: 'argyre-planitia',
    name: 'Argyre Planitia',
    lat: -49.8,
    lon: 316.7,
    category: 'Impact basin',
    importance:
      'One of the best-preserved large impact basins on Mars, about 1,800 km across and ringed by rugged mountains. Ancient river valleys drain into it, and it may once have held a lake that overflowed northward, making it key to understanding how water moved across early Mars.',
    checkpoints: [
      {
        name: 'Ancient Basin Floor',
        fact: 'The impact that formed Argyre happened roughly 3.9 billion years ago, during a period of heavy bombardment in the inner Solar System.',
      },
      {
        name: 'Esker Ridges',
        fact: 'Long, winding ridges on the floor are thought to be eskers: sediment laid down by meltwater running in tunnels beneath ancient ice sheets.',
      },
      {
        name: 'Channel Mouth',
        fact: 'River valleys from the south fed into Argyre. It may have filled and spilled north through a chain of channels starting with Uzboi Vallis.',
      },
      {
        name: 'Rim Mountains',
        fact: 'The Charitum and Nereidum Montes ranges around the basin are crustal blocks thrown up by the giant impact.',
      },
    ],
  },
  {
    id: 'utopia-planitia',
    name: 'Utopia Planitia',
    lat: 46.7,
    lon: 117.5,
    category: 'Plain · impact basin',
    importance:
      'A vast lowland plain filling an ancient impact basin about 3,300 km across, among the largest in the Solar System. NASA’s Viking 2 landed here in 1976 and China’s Zhurong rover explored its southern part in 2021. Radar has found large deposits of buried water ice.',
    checkpoints: [
      {
        name: 'Scalloped Depressions',
        fact: 'These scalloped hollows form where ice in the ground slowly turns directly to vapour, letting the surface sag.',
      },
      {
        name: 'Buried Ice Deposit',
        fact: 'In 2016, orbital radar found buried ice beneath part of Utopia holding about as much water as Lake Superior.',
      },
      {
        name: 'Polygon Field',
        fact: 'The ground is cracked into polygons, a pattern made when icy soil repeatedly contracts and expands with the seasons.',
      },
      {
        name: 'Viking 2 Horizon',
        fact: 'Viking 2 landed in Utopia Planitia on 3 September 1976 and later photographed a thin layer of water frost on the ground in winter.',
      },
    ],
  },
  {
    id: 'elysium-planitia',
    name: 'Elysium Planitia',
    lat: 3.0,
    lon: 154.7,
    category: 'Volcanic plain',
    importance:
      'A broad equatorial plain covered by some of the youngest lava flows on Mars. NASA’s InSight lander listened here for marsquakes from 2018 to 2022, revealing the planet’s crust, mantle and large liquid core.',
    checkpoints: [
      {
        name: 'Young Lava Plain',
        fact: 'Few craters mark these lava flows, a sign that they are among the youngest volcanic surfaces on Mars.',
      },
      {
        name: 'Cerberus Fossae',
        fact: 'These deep fissures were the source of many marsquakes recorded by InSight, and a dark ash deposit nearby may be only about 50,000 years old.',
      },
      {
        name: 'Platy Lava Flows',
        fact: 'Raft-like plates on the surface were once proposed to be a frozen sea. Today most scientists see them as broken crust floating on fast-moving lava.',
      },
      {
        name: 'InSight’s Neighbourhood',
        fact: 'InSight recorded more than 1,300 marsquakes from its station in western Elysium Planitia. They showed that Mars has a large liquid iron-rich core.',
      },
    ],
  },
  {
    id: 'arcadia-planitia',
    name: 'Arcadia Planitia',
    lat: 49.02,
    lon: 188.15,
    category: 'Plain',
    importance:
      'A smooth northern plain of relatively young lava flows. Water ice appears to lie very close to the surface here, which makes Arcadia one of the leading candidate regions for future human landings.',
    checkpoints: [
      {
        name: 'Shallow Ice Zone',
        fact: 'Orbital mapping suggests water ice may lie less than a metre below the surface here, within reach of future crews.',
      },
      {
        name: 'Ice-Exposing Crater',
        fact: 'Fresh impact craters at these latitudes have dug up bright, nearly pure water ice that fades over months as it turns to vapour.',
      },
      {
        name: 'Expanded Craters',
        fact: 'Many craters here are oddly wide and shallow, enlarged as ice in the surrounding ground sublimated away.',
      },
      {
        name: 'Smooth Lava Plains',
        fact: 'Arcadia’s smooth surface was laid down by relatively young lava flows that buried older terrain in the northern lowlands.',
      },
    ],
  },
  {
    id: 'planum-boreum',
    name: 'Planum Boreum',
    lat: 85.0,
    lon: 180.0,
    category: 'Polar ice cap',
    importance:
      'The north polar plateau: a dome of layered water ice and dust about 1,000 km across and roughly 3 km thick. Its layers record changes in Mars’ climate over millions of years, much like ice cores on Earth.',
    checkpoints: [
      {
        name: 'Spiral Trough',
        fact: 'The cap’s distinctive spiral troughs are shaped by winds flowing off the dome and by ice sublimating from sunlit slopes.',
      },
      {
        name: 'Layered Ice Cliff',
        fact: 'Bands of ice and dust in the cliffs record climate cycles driven by slow swings in the tilt of Mars’ axis.',
      },
      {
        name: 'Seasonal Frost Field',
        fact: 'Each winter, carbon dioxide from the atmosphere freezes onto the cap as a seasonal frost layer and returns to the air in spring.',
      },
      {
        name: 'Avalanche Scarp',
        fact: 'In 2008, the HiRISE camera caught clouds of ice and dust avalanching down a steep polar scarp in spring.',
      },
    ],
  },
  {
    id: 'planum-australe',
    name: 'Planum Australe',
    lat: -85.0,
    lon: 180.0,
    category: 'Polar ice cap',
    importance:
      'The south polar plateau, a thick stack of water ice and dust topped by a permanent cap of frozen carbon dioxide. If its water ice melted, it would cover the whole planet in a layer about 11 m deep.',
    checkpoints: [
      {
        name: 'Swiss-Cheese Terrain',
        fact: 'Flat-floored pits in the carbon dioxide ice widen by a few metres every year as the ice sublimates, giving the terrain its holey look.',
      },
      {
        name: 'Spider Terrain',
        fact: 'Branching “spider” channels are carved in spring when gas trapped under the seasonal ice bursts out in jets that carry dust.',
      },
      {
        name: 'Layered Deposits',
        fact: 'Radar shows the layered deposits are mostly water ice, enough to cover Mars in about 11 m of water if melted.',
      },
      {
        name: 'Radar-Bright Zone',
        fact: 'In 2018, radar detected a bright reflection about 1.5 km beneath the ice that some scientists interpret as salty liquid water. It is still debated.',
      },
    ],
  },
  {
    id: 'elysium-mons',
    name: 'Elysium Mons',
    lat: 25.0,
    lon: 147.2,
    category: 'Volcano',
    importance:
      'The tallest volcano of the Elysium volcanic province, the second-largest volcanic region on Mars. It rises about 12.6 km above the surrounding plains and records a long history of volcanism separate from Tharsis.',
    checkpoints: [
      {
        name: 'Summit Caldera',
        fact: 'A single caldera about 14 km wide crowns the summit, formed by collapse after magma drained from below.',
      },
      {
        name: 'Upper Flank',
        fact: 'Elysium Mons rises about 12.6 km above its base, almost one and a half times the height of Mount Everest above sea level.',
      },
      {
        name: 'Flank Channels',
        fact: 'Channels on the flanks were carved by flowing lava, or possibly by water released when magma melted ice in the ground.',
      },
      {
        name: 'Elysium Rise',
        fact: 'It is the largest of three volcanoes on the Elysium rise, together with Hecates Tholus and Albor Tholus.',
      },
    ],
  },
  {
    id: 'arsia-mons',
    name: 'Arsia Mons',
    lat: -8.3,
    lon: 239.9,
    category: 'Shield volcano',
    importance:
      'The southernmost of the three Tharsis Montes volcanoes, with one of the largest calderas on Mars. Deposits on its flanks are interpreted as the remains of ancient glaciers, and dark pits may open into underground lava tubes.',
    checkpoints: [
      {
        name: 'Caldera Rim',
        fact: 'The summit caldera is more than 100 km across, larger than many entire volcanoes on Earth.',
      },
      {
        name: 'Glacial Fan Deposit',
        fact: 'A huge fan-shaped deposit on the northwest flank is thought to be left by glaciers that formed when Mars’ axis was more steeply tilted.',
      },
      {
        name: 'Cave Skylight Pits',
        fact: 'Dark, round pits on the flanks may be skylights into lava tubes, natural caves that could shelter future explorers from radiation.',
      },
      {
        name: 'Cloud Plume Viewpoint',
        fact: 'Around southern summer solstice, a long water-ice cloud grows from Arsia Mons each morning, stretching up to about 1,800 km.',
      },
    ],
  },
  {
    id: 'pavonis-mons',
    name: 'Pavonis Mons',
    lat: 0.8,
    lon: 246.6,
    category: 'Shield volcano',
    importance:
      'The central volcano of the Tharsis Montes, sitting almost exactly on the equator. Its deep summit caldera and flank pits make it a key site for studying how Martian volcanoes grew and collapsed.',
    checkpoints: [
      {
        name: 'Deep Caldera',
        fact: 'The main summit caldera is about 45 km wide and roughly 4.5 km deep.',
      },
      {
        name: 'Equator Crossing',
        fact: 'Pavonis Mons sits between Arsia Mons and Ascraeus Mons. The three volcanoes line up about 700 km apart along a great fault trend.',
      },
      {
        name: 'Lava Tube Skylight',
        fact: 'HiRISE spotted a hole about 35 m wide on the flank, with a cavern below. It is likely a collapsed opening into a lava tube.',
      },
      {
        name: 'Glacial Ridges',
        fact: 'Concentric ridges on the northwest flank mark the edges of ancient glaciers that once flowed down the volcano.',
      },
    ],
  },
  {
    id: 'ascraeus-mons',
    name: 'Ascraeus Mons',
    lat: 11.9,
    lon: 255.9,
    category: 'Shield volcano',
    importance:
      'The northernmost and tallest of the Tharsis Montes, standing about 18 km above the Martian datum, second only to Olympus Mons. Its nested summit calderas record repeated eruptions and collapses.',
    checkpoints: [
      {
        name: 'Nested Calderas',
        fact: 'The summit holds several overlapping calderas, each recording a separate episode of eruption and collapse.',
      },
      {
        name: 'Upper Flank',
        fact: 'At about 18 km above datum, Ascraeus Mons is the second-highest volcano on Mars.',
      },
      {
        name: 'Sinuous Rille',
        fact: 'Winding channels on the flanks were carved by flowing lava, some fed from vents far from the summit.',
      },
      {
        name: 'Glacial Fan',
        fact: 'Like its neighbours, Ascraeus has fan-shaped deposits on its northwest flank, interpreted as the traces of past mountain glaciers.',
      },
    ],
  },
  {
    id: 'alba-mons',
    name: 'Alba Mons',
    lat: 41.08,
    lon: 249.29,
    category: 'Volcano',
    importance:
      'By area, the largest volcano on Mars: a low, enormously broad edifice spreading well over 1,000 km across, yet only about 6.8 km tall. Its unusual shape and fractured flanks reveal how Tharsis volcanism and crustal stress interacted.',
    checkpoints: [
      {
        name: 'Low-Slope Flank',
        fact: 'The slopes are typically less than 1°. Standing here, you might not notice you are on a volcano at all.',
      },
      {
        name: 'Tantalus Fossae',
        fact: 'Parallel fault valleys called graben cut across the flanks where the crust was stretched and dropped down between faults.',
      },
      {
        name: 'Summit Caldera Complex',
        fact: 'A central caldera complex sits atop a broad summit dome, the last stage of the volcano’s long eruptive history.',
      },
      {
        name: 'Flank Valleys',
        fact: 'Networks of small valleys on the northern flank may have been carved by water, by lava, or by both.',
      },
    ],
  },
  {
    id: 'noctis-labyrinthus',
    name: 'Noctis Labyrinthus',
    lat: -7.0,
    lon: 258.0,
    category: 'Canyon labyrinth',
    importance:
      'A maze of steep-walled valleys at the western end of Valles Marineris, formed where faults from the Tharsis bulge crossed and the ground collapsed. It contains a striking variety of water-altered minerals.',
    checkpoints: [
      {
        name: 'Graben Intersection',
        fact: 'The labyrinth formed where many fault systems crossed, breaking the crust into blocks that dropped down between them.',
      },
      {
        name: 'Collapse Pit Chain',
        fact: 'Lines of pits formed as the surface caved into voids below, perhaps where ice melted or magma withdrew.',
      },
      {
        name: 'Hydrated Mineral Outcrop',
        fact: 'Orbiters have mapped a remarkable variety of water-altered minerals here, including sulfates and clays.',
      },
      {
        name: 'Morning Fog Valley',
        fact: 'The Viking orbiters photographed bright water-ice fog filling these valleys at dawn and burning off as the Sun rose.',
      },
    ],
  },
  {
    id: 'mawrth-vallis',
    name: 'Mawrth Vallis',
    lat: 22.3,
    lon: 343.5,
    category: 'Valley',
    importance:
      'One of the oldest outflow channels on Mars, about 600 km long. Its walls expose some of the thickest and most varied clay-rich layers on the planet, a record of long-lasting water.',
    checkpoints: [
      {
        name: 'Layered Clay Bluff',
        fact: 'The bluffs expose clay-bearing layers hundreds of metres thick, formed when water altered rock over long periods.',
      },
      {
        name: 'Channel Floor',
        fact: 'Mawrth Vallis was carved by flowing water early in Mars’ history, making it one of the planet’s oldest outflow channels.',
      },
      {
        name: 'Light-Toned Outcrop',
        fact: 'Aluminium-rich clays lie on top of iron- and magnesium-rich clays, a sequence like the leached soils formed by rain on Earth.',
      },
      {
        name: 'Finalist Landing Site',
        fact: 'Mawrth Vallis was a finalist landing site for both NASA’s Curiosity rover and ESA’s Rosalind Franklin rover.',
      },
    ],
  },
  {
    id: 'oxia-planum',
    name: 'Oxia Planum',
    lat: 18.2,
    lon: 335.9,
    category: 'Plain · landing site',
    importance:
      'A low plain rich in clay minerals about 4 billion years old, selected as the landing site for ESA’s Rosalind Franklin rover. Its ancient water-laid sediments are promising places to look for preserved traces of life.',
    checkpoints: [
      {
        name: 'Clay-Rich Plains',
        fact: 'The plain is covered by iron- and magnesium-rich clays, among the oldest water-altered rocks on Mars at about 4 billion years old.',
      },
      {
        name: 'Fan Deposit',
        fact: 'Remnants of a sediment fan or delta at the plain’s eastern edge show where a river once spread out and dropped its load.',
      },
      {
        name: 'Inverted Channels',
        fact: 'Ridges snaking across the plain are inverted channels: old riverbeds that resisted erosion and now stand above the ground around them.',
      },
      {
        name: 'Drill Target',
        fact: 'Rosalind Franklin’s drill is designed to reach 2 m down, where organic molecules are shielded from the radiation that bombards the surface.',
      },
    ],
  },
  {
    id: 'gusev-crater',
    name: 'Gusev Crater',
    lat: -14.6,
    lon: 175.4,
    category: 'Impact crater',
    importance:
      'A 166 km wide crater fed by the Ma’adim Vallis channel, chosen as a possible ancient lake site. NASA’s Spirit rover explored it from 2004 to 2010 and found evidence of hot springs or volcanic steam vents.',
    checkpoints: [
      {
        name: 'Columbia Memorial Station',
        fact: 'Spirit landed here in January 2004. The site is named in honour of the crew of the Space Shuttle Columbia.',
      },
      {
        name: 'Columbia Hills',
        fact: 'Spirit drove kilometres across the plains and then climbed these hills, whose rocks showed clear signs of alteration by water.',
      },
      {
        name: 'Home Plate',
        fact: 'Spirit’s stuck front wheel churned up soil that was nearly pure silica, a likely sign of ancient hot springs or steam vents.',
      },
      {
        name: 'Troy',
        fact: 'Spirit became stuck in soft sand here in 2009. It kept working as a stationary science platform until its last contact in March 2010.',
      },
    ],
  },
  {
    id: 'meridiani-planum',
    name: 'Meridiani Planum',
    lat: -2.0,
    lon: 5.0,
    category: 'Plain · landing site',
    importance:
      'An equatorial plain rich in the mineral hematite, which often forms in water. NASA’s Opportunity rover explored it for more than 14 years, finding clear evidence that liquid water once soaked the ground.',
    checkpoints: [
      {
        name: 'Eagle Crater',
        fact: 'Opportunity bounced to a stop inside Eagle, a crater only about 22 m wide, in January 2004.',
      },
      {
        name: 'Blueberry Field',
        fact: 'Tiny hematite spheres nicknamed “blueberries” formed as groundwater seeped through the rock and deposited minerals.',
      },
      {
        name: 'Endurance Crater',
        fact: 'The walls of Endurance Crater exposed layered sulfate-rich sandstones, laid down and soaked by water long ago.',
      },
      {
        name: 'Endeavour Rim',
        fact: 'Opportunity drove more than 45 km before a planet-wide dust storm ended its mission in June 2018.',
      },
    ],
  },
  {
    id: 'chryse-planitia',
    name: 'Chryse Planitia',
    lat: 28.4,
    lon: 319.7,
    category: 'Plain',
    importance:
      'A smooth lowland plain where several giant outflow channels end, carved by ancient catastrophic floods. It hosted NASA’s Viking 1 lander in 1976, the first long-lived spacecraft on the Martian surface.',
    checkpoints: [
      {
        name: 'Outflow Plains',
        fact: 'Floods pouring out of Kasei, Maja, Ares, Simud and Tiu Valles spread across Chryse, delivering huge volumes of water and sediment.',
      },
      {
        name: 'Streamlined Islands',
        fact: 'Teardrop-shaped islands were sculpted where floodwaters flowed around crater rims and other obstacles.',
      },
      {
        name: 'Viking 1 Plains',
        fact: 'Viking 1 landed in Chryse on 20 July 1976 and returned data until November 1982.',
      },
      {
        name: 'Ares Vallis Mouth',
        fact: 'At the mouth of Ares Vallis, Mars Pathfinder landed in 1997 and released Sojourner, the first wheeled rover on Mars.',
      },
    ],
  },
  {
    id: 'acidalia-planitia',
    name: 'Acidalia Planitia',
    lat: 49.76,
    lon: 339.26,
    category: 'Plain',
    importance:
      'A dark northern plain, visible from Earth through telescopes as Mare Acidalium. It is dotted with small pitted cones that may be mud volcanoes bringing material up from below the surface.',
    checkpoints: [
      {
        name: 'Pitted Cone Field',
        fact: 'Thousands of small pitted cones may be mud volcanoes, which would bring up sediment from deep underground where water may once have circulated.',
      },
      {
        name: 'Dark Sand Plains',
        fact: 'Dark basaltic sand gives the plain its low brightness, which is why it stood out to early telescope observers as a dark marking.',
      },
      {
        name: 'Lowland Basin',
        fact: 'Acidalia lies in the northern lowlands, where some scientists propose an ancient ocean once collected.',
      },
      {
        name: 'Ares 3 Site',
        fact: 'Andy Weir’s novel The Martian sets the fictional Ares 3 mission here, in Acidalia Planitia.',
      },
    ],
  },
  {
    id: 'amazonis-planitia',
    name: 'Amazonis Planitia',
    lat: 25.75,
    lon: 197.09,
    category: 'Plain',
    importance:
      'One of the smoothest surfaces on Mars, covered by young lava and sediment with few craters. The youngest period of Martian history, the Amazonian, is named after it.',
    checkpoints: [
      {
        name: 'Smooth Plain',
        fact: 'Laser altimeter data show Amazonis is among the flattest, smoothest places on the planet.',
      },
      {
        name: 'Young Lava Flows',
        fact: 'The scarcity of craters shows these lava flows are geologically young compared with most of the Martian surface.',
      },
      {
        name: 'Dust Devil Tracks',
        fact: 'In 2012, HiRISE caught a dust devil here towering about 20 km high. Its kin leave dark tracks across the plain.',
      },
      {
        name: 'Amazonian Benchmark',
        fact: 'The Amazonian period, from about 3 billion years ago to the present, takes its name from this plain.',
      },
    ],
  },
  {
    id: 'deuteronilus-mensae',
    name: 'Deuteronilus Mensae',
    lat: 43.9,
    lon: 337.0,
    category: 'Mesa region',
    importance:
      'A region of flat-topped mesas and buttes along the boundary between the southern highlands and northern lowlands. Radar shows that the debris aprons around its mesas are buried glaciers of nearly pure water ice.',
    checkpoints: [
      {
        name: 'Mesa Escarpment',
        fact: 'The mesas are remnants of the old highland crust, left standing as the land around them eroded away.',
      },
      {
        name: 'Lobate Debris Apron',
        fact: 'Radar reveals that these aprons are mostly ice under a thin layer of rock and dust: glaciers preserved for millions of years.',
      },
      {
        name: 'Lineated Valley Fill',
        fact: 'Parallel flow lines on valley floors show where ice once crept downhill like glaciers on Earth.',
      },
      {
        name: 'Dichotomy Boundary',
        fact: 'This is the edge of Mars’ great crustal divide: rugged southern highlands meet the smooth northern lowlands, several kilometres lower.',
      },
    ],
  },
  {
    id: 'medusae-fossae',
    name: 'Medusae Fossae Formation',
    lat: -5.0,
    lon: 180.0,
    category: 'Sedimentary formation',
    importance:
      'An enormous deposit of soft, easily eroded material, probably volcanic ash, stretching about 5,000 km along the equator. Wind has sculpted it into ridges, and its erosion may be the largest single source of the dust that fills Mars’ atmosphere.',
    checkpoints: [
      {
        name: 'Yardang Field',
        fact: 'Long ridges called yardangs have been carved by persistent winds sandblasting the soft deposit.',
      },
      {
        name: 'Soft Layered Cliff',
        fact: 'Radar shows the deposit is unusually low in density, consistent with volcanic ash rather than solid rock.',
      },
      {
        name: 'Dust Source',
        fact: 'As the formation erodes, it may supply much of the fine dust that colours the Martian sky.',
      },
      {
        name: 'Ash Plains',
        fact: 'If it is volcanic ash, the formation records some of the most explosive eruptions in the planet’s history.',
      },
    ],
  },
];

/** Longitude in the −180…180° range the map and globe use. */
export function mapLon(lon360: number): number {
  return lon360 > 180 ? lon360 - 360 : lon360;
}

export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
}

export function formatLon(lon360: number): string {
  return `${lon360.toFixed(2)}° E`;
}

export function landmarkById(id: string | null | undefined): Landmark | undefined {
  return id ? LANDMARKS.find((l) => l.id === id) : undefined;
}

/** Case- and accent-insensitive name search, best matches (prefix, then word start, then anywhere) first. */
export function searchLandmarks(query: string): Landmark[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return LANDMARKS;
  const scored = LANDMARKS.map((l) => {
    const n = norm(l.name);
    const score = n.startsWith(q) ? 0 : n.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : -1;
    return { l, score };
  }).filter((x) => x.score >= 0);
  return scored.sort((a, b) => a.score - b.score).map((x) => x.l);
}
