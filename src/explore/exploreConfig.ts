// Single source of truth for the globe explorer's look, feel and scale.
// Globe distances are in planet radii (the globe has radius 1); site distances are in km.

export const EXPLORE = {
  /**
   * Sun direction in world space: just above and left of the camera, so the whole face of
   * the planet you are looking at is lit (with a thin shadowed edge for depth), and every
   * landmark reads clearly whatever side of Mars it is on.
   */
  sun: [-0.36, 0.3, 0.88] as const,

  globe: {
    /** Closest and farthest camera distance from the planet's centre (radii) */
    minDistance: 1.32,
    maxDistance: 6,
    /** Latitude the camera settles on when showing the whole planet */
    overviewLat: 12,
    /** Longitude the explorer opens on: Tharsis and Valles Marineris */
    openingLon: 285,
    /** Selected landmarks are framed at an altitude scaled to their size, within these bounds (radii) */
    selectAltitude: [1.05, 1.9] as const,
    /** How much ground around a landmark to frame, as a multiple of its diameter */
    selectContext: 3.2,
    /** Keep the camera this far from the poles when dragging (degrees) */
    maxDragLat: 82,
    /** Gentle drift while nobody is interacting, degrees of longitude per second */
    autoSpin: 2.4,
    /** Seconds of inactivity before the drift resumes */
    autoSpinDelay: 6,
  },

  markers: {
    /** Radius of the marker shell (radii): just above the surface so it never clips */
    altitude: 1.006,
    corePx: 8,
    haloPx: 38,
    hoverScale: 1.35,
    selectedScale: 1.55,
    pickRadiusPx: 20,
    pickRadiusTouchPx: 30,
    color: '#ffb07a',
    selectedColor: '#fff1e2',
  },

  site: {
    /** Half-width of the sharp surface patch built from Mars Trek tiles (km) */
    halfSizeKm: 120,
    textureSize: 1024,
    /** Never request more tiles than this for one patch; polar sites drop to a coarser zoom */
    maxTiles: 36,
    tileTimeoutMs: 12000,
  },

  astronaut: {
    /** Height of the figure on the surface (km). Not to scale: a true-scale astronaut would be invisible. */
    heightKm: 5,
    /** Walking speed across the surface (km/s), matched to the figure's size so the stride looks natural */
    speedKmS: 7,
    /** "Next checkpoint" fast-forwards at this multiple of walking speed */
    hurryFactor: 6,
  },

  camera: {
    follow: { distanceKm: 72, elevationDeg: 30 },
    overview: { distanceKm: 235, elevationDeg: 52 },
    minElevationDeg: 10,
    maxElevationDeg: 82,
    enterSeconds: 2.4,
    exitSeconds: 2.0,
    switchSeconds: 1.3,
  },
};
