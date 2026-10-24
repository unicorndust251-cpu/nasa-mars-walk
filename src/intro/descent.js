import { INTRO, JEZERO, heroDistance, spinForLongitude } from './introConfig.js';

// Camera and planet motion shared by every renderer of the intro.

const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const JEZERO_SPIN = spinForLongitude(JEZERO.lon);
const JEZERO_LAT = (JEZERO.lat * Math.PI) / 180;

/**
 * Camera distance from the planet's centre. The descent interpolates altitude in log
 * space, so the fall reads as a constant rate of zoom, like dropping from orbit.
 */
export function cameraDistance(anim, aspect) {
  const hero = heroDistance(aspect);
  const pushed = hero * lerp(INTRO.camera.startScale, 1, anim.push);
  const alt0 = pushed - INTRO.planet.radius;
  const alt1 = INTRO.descent.altitude * INTRO.planet.radius;
  return INTRO.planet.radius + alt0 * Math.pow(alt1 / alt0, anim.exit);
}

/** Small handheld drift, steadied as the camera locks onto the landing site. */
export function cameraDrift(anim, distance, t) {
  const amount = (anim.spin === 0 ? 0 : 1) * (1 - anim.exit) * (distance - INTRO.planet.radius);
  return [Math.sin(t * 0.35) * 0.012 * amount, Math.cos(t * 0.27) * 0.008 * amount];
}

/**
 * Planet orientation. As `align` goes 0 → 1 the spin eases onto the nearest turn that
 * faces Jezero, the axial tilt drops away, and the planet tips by Jezero's latitude,
 * so the crater lands dead centre under the descending camera.
 */
export function planetOrientation(spinAngle, align) {
  const target = JEZERO_SPIN + TAU * Math.round((spinAngle - JEZERO_SPIN) / TAU);
  return {
    spinY: lerp(spinAngle, target, align),
    tiltX: lerp(0, JEZERO_LAT, align),
    tiltZ: lerp(INTRO.planet.axialTilt, 0, align),
  };
}
