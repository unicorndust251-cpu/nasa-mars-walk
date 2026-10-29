import * as THREE from 'three';
import { latLonToVec } from '../geo';
import { NAV_COLORS, canvasTexture, glowTexture, horizonFade } from './navTextures.js';

/**
 * The green START marker: a bright core inside a solid ring, with a slow outward ripple.
 * Constant on-screen size, like the landmark markers, but green and ringed so the two can
 * never be confused.
 */
export function createStartMarker() {
  const color = new THREE.Color(NAV_COLORS.start);
  const textures = {
    glow: glowTexture(),
    ring: canvasTexture(128, (ctx, s) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }),
    ripple: canvasTexture(128, (ctx, s) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
      ctx.stroke();
    }),
  };
  const materials = [];
  const sprite = (map) => {
    const m = new THREE.SpriteMaterial({
      map,
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
      toneMapped: false,
    });
    materials.push(m);
    const s = new THREE.Sprite(m);
    s.renderOrder = 22;
    return s;
  };

  const group = new THREE.Group();
  const halo = sprite(textures.glow);
  const ripple = sprite(textures.ripple);
  const core = sprite(textures.ring);
  group.add(halo, ripple, core);
  group.visible = false;

  const world = new THREE.Vector3();
  let visible = 0;

  return {
    object: group,
    world,
    get visible() {
      return visible;
    },
    setPlace(place) {
      group.visible = !!place;
      if (place) group.position.set(...latLonToVec(place.lat, place.lon)).multiplyScalar(1.006);
    },
    update({ camera, height, time, presence, reducedMotion }) {
      if (!group.visible) {
        visible = 0;
        return;
      }
      group.getWorldPosition(world);
      visible = horizonFade(world, camera) * presence;
      const px = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / height;
      const pulse = reducedMotion ? 0 : Math.sin(time * 2.6);
      core.scale.setScalar(20 * px);
      core.material.opacity = visible;
      halo.scale.setScalar(54 * (1 + 0.12 * pulse) * px);
      halo.material.opacity = 0.75 * visible;
      const cycle = reducedMotion ? 0.4 : (time * 0.55) % 1;
      ripple.scale.setScalar((20 + 40 * cycle) * px);
      ripple.material.opacity = (1 - cycle) * 0.8 * visible;
    },
    dispose() {
      materials.forEach((m) => m.dispose());
      Object.values(textures).forEach((t) => t.dispose());
    },
  };
}
