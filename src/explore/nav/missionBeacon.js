import * as THREE from 'three';
import { latLonToVec } from '../geo';
import { NAV_COLORS, canvasTexture, horizonFade } from './navTextures.js';

/**
 * The destination's MISSION BEACON: a glowing hexagonal pad on the ground, a cyan light beam
 * rising from it, a ripple spreading over the surface and a target reticle floating at the
 * top of the beam. Built in a local frame whose +y is the surface normal, then scaled with
 * the camera's distance so it reads at the same size from orbit and up close.
 */

const UP = new THREE.Vector3(0, 1, 0);

const beamVertex = /* glsl */ `
  varying float vH;
  void main() {
    vH = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying float vH;
  void main() {
    float fade = pow(1.0 - vH, 1.6);
    float shimmer = 0.85 + 0.15 * sin(vH * 40.0 - uTime * 6.0);
    vec3 col = mix(vec3(1.0), uColor, smoothstep(0.0, 0.35, vH));
    gl_FragColor = vec4(col, fade * shimmer * uOpacity);
  }
`;

function reticleTexture() {
  return canvasTexture(256, (ctx, s) => {
    const c = s / 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = NAV_COLORS.cyan;
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    // Ticks pointing in, like a targeting reticle
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * s * 0.46, c + Math.sin(a) * s * 0.46);
      ctx.lineTo(c + Math.cos(a) * s * 0.24, c + Math.sin(a) * s * 0.24);
      ctx.stroke();
    }
    ctx.fillStyle = NAV_COLORS.primary;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function createMissionBeacon() {
  const group = new THREE.Group();
  group.visible = false;
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  const basic = (color, opacity) =>
    track(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
  const flat = (geometry) => track(geometry).rotateX(-Math.PI / 2); // lie on the ground (xz)

  const hexFill = new THREE.Mesh(flat(new THREE.CircleGeometry(0.2, 6)), basic(NAV_COLORS.primary, 0.4));
  const hexEdge = new THREE.Mesh(flat(new THREE.RingGeometry(0.2, 0.24, 6)), basic(NAV_COLORS.cyan, 1));
  const ripple = new THREE.Mesh(flat(new THREE.RingGeometry(0.92, 1, 64)), basic(NAV_COLORS.cyan, 0.6));

  const beamMaterial = track(
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(NAV_COLORS.cyan) }, uOpacity: { value: 1 }, uTime: { value: 0 } },
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  const beamCore = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.06, 1, 20, 1, true).translate(0, 0.5, 0)), beamMaterial);
  const beamHaloMaterial = track(beamMaterial.clone());
  const beamHalo = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.15, 0.8, 20, 1, true).translate(0, 0.4, 0)), beamHaloMaterial);

  const reticleMap = track(reticleTexture());
  const reticleMaterial = track(new THREE.SpriteMaterial({ map: reticleMap, transparent: true, depthWrite: false, toneMapped: false }));
  const reticle = new THREE.Sprite(reticleMaterial);
  reticle.position.y = 1.12;
  reticle.scale.setScalar(0.34);

  for (const m of [hexFill, hexEdge, ripple, beamHalo, beamCore, reticle]) {
    m.renderOrder = 21;
    group.add(m);
  }

  const world = new THREE.Vector3();
  const top = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let visible = 0;

  return {
    object: group,
    world,
    /** World position of the reticle, where the label goes */
    top,
    get visible() {
      return visible;
    },
    setPlace(place) {
      group.visible = !!place;
      if (!place) return;
      normal.set(...latLonToVec(place.lat, place.lon));
      group.position.copy(normal).multiplyScalar(1.0015);
      group.quaternion.setFromUnitVectors(UP, normal);
    },
    update({ camera, time, presence, reducedMotion }) {
      if (!group.visible) {
        visible = 0;
        return;
      }
      group.getWorldPosition(world);
      visible = horizonFade(world, camera) * presence;
      // Roughly constant size on screen: about 9% of the view height tall
      const scale = Math.max(0.004, camera.position.distanceTo(world) * 0.05);
      group.scale.setScalar(scale);

      const pulse = reducedMotion ? 0 : Math.sin(time * 3);
      hexFill.material.opacity = (0.35 + 0.12 * pulse) * visible;
      hexEdge.material.opacity = visible;
      const cycle = reducedMotion ? 0.5 : (time * 0.5) % 1;
      ripple.scale.setScalar(0.22 + 0.4 * cycle);
      ripple.material.opacity = (1 - cycle) * 0.6 * visible;
      beamMaterial.uniforms.uOpacity.value = 0.95 * visible;
      beamMaterial.uniforms.uTime.value = reducedMotion ? 0 : time;
      beamHaloMaterial.uniforms.uOpacity.value = 0.28 * visible;
      reticleMaterial.opacity = visible;
      reticleMaterial.rotation = reducedMotion ? 0 : time * 0.35;
      reticle.scale.setScalar(0.34 * (1 + 0.06 * pulse));

      group.updateMatrixWorld(true);
      reticle.getWorldPosition(top);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
