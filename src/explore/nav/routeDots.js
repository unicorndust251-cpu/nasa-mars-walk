import * as THREE from 'three';
import { latLonToVec } from '../geo';
import { NAV_COLORS } from './navTextures.js';

/**
 * The glowing dotted route: one point sprite per waypoint, lifted slightly off the surface
 * (so it never flickers against the planet) and parented to the planet, so it turns with it.
 *
 * Waypoints are dense (every ~3 km). Each frame the layer sets a stride so only every
 * 1st, 2nd, 4th... dot is drawn, keeping them evenly spaced about DOT_SPACING_PX apart on
 * screen at any zoom; strides are powers of two, so zooming never reshuffles the dots.
 * Like the landmark markers, dots fade across the horizon instead of being depth-clipped.
 * A soft pulse of light travels from start to destination.
 */

const ALTITUDE = 1.004;
const DOT_SPACING_PX = 13;

const vertexShader = /* glsl */ `
  attribute float aIndex;
  attribute float aT;
  uniform float uStride;
  uniform float uSize;
  uniform float uTravel;
  uniform float uPresence;
  varying float vAlpha;
  varying float vGlow;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 toCam = cameraPosition - world.xyz;
    float facing = dot(normalize(world.xyz), normalize(toCam));
    float keep = mod(aIndex, uStride) < 0.5 ? 1.0 : 0.0;
    float d = (aT - uTravel) / 0.045;
    vGlow = exp(-d * d);
    vAlpha = smoothstep(-0.015, 0.09, facing) * keep * uPresence;
    gl_PointSize = uSize * (1.0 + 0.7 * vGlow) * keep;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  varying float vGlow;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.18, 0.42, r);
    float halo = exp(-r * r * 5.0) * 0.55;
    float a = (core + halo) * vAlpha;
    if (a < 0.01) discard;
    vec3 col = mix(uColor, vec3(1.0, 0.93, 0.85), core * 0.45 + vGlow * 0.5);
    gl_FragColor = vec4(col, a);
  }
`;

export function createRouteDots() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(NAV_COLORS.primary) },
      uStride: { value: 1 },
      uSize: { value: 7 },
      uTravel: { value: -1 },
      uPresence: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 19;
  points.visible = false;

  let stepRad = 0;

  return {
    object: points,
    setRoute(route) {
      points.visible = !!route && !route.identical;
      if (!points.visible) return;
      const n = route.points.length;
      const pos = new Float32Array(n * 3);
      const index = new Float32Array(n);
      const t = new Float32Array(n);
      route.points.forEach((p, i) => {
        const v = latLonToVec(p.lat, p.lon);
        pos[i * 3] = v[0] * ALTITUDE;
        pos[i * 3 + 1] = v[1] * ALTITUDE;
        pos[i * 3 + 2] = v[2] * ALTITUDE;
        index[i] = i;
        t[i] = i / (n - 1);
      });
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1));
      geometry.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      geometry.setDrawRange(0, n);
      stepRad = ((route.angleDeg / (n - 1)) * Math.PI) / 180;
    },
    update({ camera, height, pixelRatio, time, presence, reducedMotion }) {
      if (!points.visible) return;
      // Screen pixels per radian of arc near the centre of the view
      const altitude = Math.max(1e-3, camera.position.length() - ALTITUDE);
      const pxPerRad = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * altitude);
      const want = DOT_SPACING_PX / Math.max(1e-6, stepRad * pxPerRad);
      material.uniforms.uStride.value = want <= 1 ? 1 : 2 ** Math.ceil(Math.log2(want));
      material.uniforms.uSize.value = 7 * pixelRatio;
      material.uniforms.uPresence.value = presence;
      // A pulse sweeps the route every 3.2 s, starting and ending just off its ends
      material.uniforms.uTravel.value = reducedMotion ? -1 : ((time / 3.2) % 1) * 1.2 - 0.1;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
