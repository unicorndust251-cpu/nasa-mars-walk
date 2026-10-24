// Single source of truth for the intro's look and timing.
// Every renderer (React Three Fiber in the app) reads from here.

/** Jezero Crater, IAU Gazetteer (planetocentric, east positive). The descent lands here. */
export const JEZERO = { lat: 18.41, lon: 77.69 };

/**
 * Spin angle (rotation.y of the planet) that turns a longitude to face the camera.
 * Three's sphere UVs put u = 0 (the map's −180° edge) at −x, with longitude increasing
 * eastward across the front face, so lon maps to phi = lon + 180°.
 */
export function spinForLongitude(lonDeg) {
  const phi = ((lonDeg + 180) * Math.PI) / 180;
  return -Math.atan2(-Math.cos(phi), Math.sin(phi));
}

const SPIN_RATE = 0.085; // rad/s
const DESCENT_START = 3.3; // s

export const INTRO = {
  // Timeline, in seconds (spec §3)
  timing: {
    reveal: [0.0, 0.7],
    rotation: [0.7, 1.5],
    title: [1.5, 2.3],
    hero: [2.3, 3.3],
    exit: [3.3, 4.95], // title lifts, descent, crossfade into the map
    descent: [DESCENT_START, 4.65], // camera falls toward Jezero
    handoff: 4.2, // the map underneath takes over the descent
    total: 4.95,
    skipExit: 0.65, // crossfade length when a visitor skips
    loadTimeout: 6.0, // give up on 3D and reveal the map after this long
  },

  colors: {
    space: '#050507',
    title: '#F5F1ED',
    sun: '#FFD7AE', // warm, soft amber sunlight
    fill: '#3A2620', // the faintest bounce on the night side
    rimInner: '#C46A3C', // burnt orange near the limb
    rimOuter: '#D6A38B', // copper glow (Beyond Terra palette)
    terminator: '#B87860', // muted terracotta scatter at the day/night line
  },

  camera: {
    fov: 30,
    // Fraction of the viewport height the planet's disc fills at the hero moment
    heroFill: 0.7,
    // On narrow/portrait screens, cap the disc at this fraction of viewport width
    heroFillWidth: 0.84,
    startScale: 1.22, // start further back; the push-in closes this gap
  },

  descent: {
    // Camera altitude above the surface, in planet radii, where the globe hands over to the map.
    // 0.5 R ≈ 1,700 km up: the planet overfills the frame and the view spans ~15° of latitude.
    altitude: 0.5,
  },

  planet: {
    radius: 1,
    segments: 160,
    axialTilt: 25.19 * (Math.PI / 180), // Mars' real obliquity
    // Start with Syrtis Major and Isidis in view, so Jezero rotates to just short of centre
    // by the time the descent begins; the descent then turns it the last ~10° under the camera.
    startRotation: spinForLongitude(JEZERO.lon) - 0.17 - SPIN_RATE * DESCENT_START,
    spin: SPIN_RATE, // slow and stately, but visibly turning behind the title
    normalScale: 0.85,
  },

  // Sun position in world space: upper-left and slightly in front of the planet
  sunDirection: [-0.86, 0.3, 0.52],

  textures: {
    color: '/textures/mars_color_2k.jpg',
    normal: '/textures/mars_normal_2k.jpg',
  },

  stars: {
    count: 2600,
    radius: [55, 95],
  },

  title: {
    text: 'BEYOND TERRA',
    // Title width relative to the planet's on-screen diameter (slightly wider than the disc)
    overhang: 1.24,
    maxViewportWidth: 0.94,
  },

  sessionKey: 'beyond-terra:intro-played',
};

/**
 * Camera distance that makes a sphere of `radius` fill `fill` of the viewport height,
 * accounting for perspective (the silhouette of a sphere is smaller than its diameter).
 */
export function distanceForFill(fill, fovDeg, radius = 1) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const angular = Math.atan(fill * t);
  return radius / Math.sin(angular);
}

/** How much of the viewport height the planet should fill at the hero moment for this aspect. */
export function heroFillFor(aspect) {
  const { heroFill, heroFillWidth } = INTRO.camera;
  return Math.min(heroFill, heroFillWidth * aspect);
}

export function heroDistance(aspect) {
  return distanceForFill(heroFillFor(aspect), INTRO.camera.fov, INTRO.planet.radius);
}

/**
 * Map zoom whose scale matches the globe at the end of the descent.
 * Trek's equirectangular level 0 is 256 px for 180° of latitude, so
 * zoom = log2(180 × viewportHeight / (256 × degrees visible)).
 */
export function handoffMapZoom(viewportHeight) {
  const alt = INTRO.descent.altitude;
  const visibleDeg = 2 * alt * Math.tan((INTRO.camera.fov * Math.PI) / 360) * (180 / Math.PI);
  return Math.log2((180 * viewportHeight) / (256 * visibleDeg));
}

/** Planet diameter in CSS pixels at the hero moment — used to size the title. */
export function heroDiameterPx(width, height) {
  return heroFillFor(width / height) * height;
}
