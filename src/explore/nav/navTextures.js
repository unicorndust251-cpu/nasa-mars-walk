import * as THREE from 'three';

/** Shared helpers for the navigator's scene objects. */

export const NAV_COLORS = {
  start: '#3dffa0',
  primary: '#ff5722',
  cyan: '#3de8ff',
};

export function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function glowTexture() {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const toCamera = new THREE.Vector3();
const normal = new THREE.Vector3();

/**
 * How much a point on the globe faces the camera, faded across the horizon so objects
 * slide out of view behind the planet instead of popping (as the landmark markers do).
 */
export function horizonFade(world, camera) {
  toCamera.copy(camera.position).sub(world);
  const dist = toCamera.length() || 1;
  normal.copy(world).normalize();
  return smoothstep(-0.015, 0.09, normal.dot(toCamera) / dist);
}
