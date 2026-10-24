import * as THREE from 'three';
import { MARS_ALBEDO_GRADE } from '../intro/marsMaterials.js';
import { EXPLORE } from './exploreConfig';
import { MARS_RADIUS_KM, surfaceDropKm } from './geo';
import { poseAt } from './route';

/**
 * Everything drawn at an exploration site, in a group whose units are km on the local
 * tangent plane: x east, y north, z up, origin on the surface at the landmark. The caller
 * attaches the group to the planet and scales it by 1 / Mars radius.
 */

/** Height of the patch above the true sphere (km), so it always sits over the globe's facets. */
const PATCH_LIFT = 0.05;

export function groundZ(x, y) {
  return surfaceDropKm(x, y) + PATCH_LIFT;
}

/** Tileable value noise, used as fine bump detail so close views don't look smeared. */
export function createDetailTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const octaves = [
    [8, 0.5],
    [16, 0.3],
    [32, 0.2],
  ];
  const lattice = octaves.map(([cells]) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return g;
  });
  const fade = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      octaves.forEach(([cells, weight], o) => {
        const g = lattice[o];
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const x0 = Math.floor(fx) % cells;
        const y0 = Math.floor(fy) % cells;
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % cells;
        const tx = fade(fx - Math.floor(fx));
        const ty = fade(fy - Math.floor(fy));
        const a = g[y0 * cells + x0] + (g[y0 * cells + x1] - g[y0 * cells + x0]) * tx;
        const b = g[y1 * cells + x0] + (g[y1 * cells + x1] - g[y1 * cells + x0]) * tx;
        v += (a + (b - a) * ty) * weight;
      });
      const k = (y * size + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(v * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.channel = 1;
  tex.needsUpdate = true;
  return tex;
}

function radialTexture(stops) {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  stops.forEach(([at, alpha]) => g.addColorStop(at, `rgba(255,255,255,${alpha})`));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}

function createRibbon(route) {
  const n = route.distances.length;
  const centers = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 2);
  const sides = new Float32Array(n * 2);
  const dists = new Float32Array(n * 2);
  const index = [];
  const pose = { x: 0, y: 0, dx: 1, dy: 0 };
  for (let i = 0; i < n; i++) {
    poseAt(route, route.distances[i] + (i === n - 1 ? -1e-3 : 1e-3), pose);
    const x = route.points[i * 2];
    const y = route.points[i * 2 + 1];
    const z = groundZ(x, y) + 0.12;
    for (let s = 0; s < 2; s++) {
      const v = i * 2 + s;
      centers.set([x, y, z], v * 3);
      normals.set([-pose.dy, pose.dx], v * 2);
      sides[v] = s === 0 ? -1 : 1;
      dists[v] = route.distances[i];
    }
    if (i < n - 1) {
      // Counter-clockwise seen from above (side −1 is the right-hand edge), so the ribbon faces up
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(centers, 3));
  geometry.setAttribute('aNormal2', new THREE.BufferAttribute(normals, 2));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
  geometry.setAttribute('aDist', new THREE.BufferAttribute(dists, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTraveled: { value: 0 },
      uTime: { value: 0 },
      uHalfWidth: { value: 0.4 },
      uDash: { value: 3 },
      uOpacity: { value: 0 },
      uDone: { value: new THREE.Color('#ffb07a') },
      uAhead: { value: new THREE.Color('#f3e5dc') },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aNormal2;
      attribute float aSide;
      attribute float aDist;
      uniform float uHalfWidth;
      varying float vSide;
      varying float vDist;
      void main() {
        vSide = aSide;
        vDist = aDist;
        vec3 p = position + vec3(aNormal2 * aSide * uHalfWidth, 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTraveled;
      uniform float uTime;
      uniform float uDash;
      uniform float uOpacity;
      uniform vec3 uDone;
      uniform vec3 uAhead;
      varying float vSide;
      varying float vDist;
      void main() {
        float done = step(vDist, uTraveled);
        float dash = step(0.42, fract(vDist / uDash - uTime * 0.5));
        float edge = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
        vec3 col = mix(uAhead, uDone, done);
        float a = edge * mix(0.1 + 0.55 * dash, 0.95, done) * uOpacity;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 5;
  return mesh;
}

function createPillarMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float fall = pow(1.0 - vH, 1.6);
        float core = pow(abs(dot(normalize(vN), normalize(vView))), 1.5);
        gl_FragColor = vec4(uColor * fall * core * uIntensity, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Builds the site. `astronaut` is the shared figure from buildAstronaut(); the site only
 * borrows it and gives it back in dispose().
 */
export function createSite({ landmarkId, route, astronaut, detailTexture }) {
  const S = EXPLORE.site.halfSizeKm;
  const heightKm = EXPLORE.astronaut.heightKm;
  const group = new THREE.Group();
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };

  /* ------------------------------------------------------------ imagery patch */
  const patchGeometry = keep(new THREE.PlaneGeometry(2 * S, 2 * S, 128, 128));
  const pos = patchGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, groundZ(pos.getX(i), pos.getY(i)));
  patchGeometry.computeVertexNormals();
  const uv = patchGeometry.attributes.uv;
  const uv1 = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    uv1[i * 2] = uv.getX(i) * 40; // detail repeats every 6 km
    uv1[i * 2 + 1] = uv.getY(i) * 40;
  }
  patchGeometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));

  const patchMaterial = keep(
    new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0,
      roughness: 0.96,
      metalness: 0,
      bumpMap: detailTexture,
      bumpScale: 1.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  patchMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>${MARS_ALBEDO_GRADE}`);
  };
  patchMaterial.customProgramCacheKey = () => 'beyond-terra-site-patch-v1';
  const patch = new THREE.Mesh(patchGeometry, patchMaterial);
  patch.visible = false;
  patch.renderOrder = 1;
  group.add(patch);
  let patchTexture = null;
  let patchFade = 0;

  /* ------------------------------------------------------------- route ribbon */
  const ribbon = createRibbon(route);
  keep(ribbon.geometry);
  keep(ribbon.material);
  group.add(ribbon);

  /* ------------------------------------------------------- checkpoint beacons */
  const pillarGeometry = keep(new THREE.CylinderGeometry(0.55, 0.55, 1, 20, 1, true));
  pillarGeometry.translate(0, 0.5, 0);
  pillarGeometry.rotateX(Math.PI / 2); // stand along +z
  const ringGeometry = keep(new THREE.RingGeometry(1.3, 1.75, 48));
  const padGeometry = keep(new THREE.RingGeometry(2.2, 2.5, 48));

  const beacons = route.checkpoints.map(([x, y], i) => {
    const last = i === route.checkpoints.length - 1;
    const z = groundZ(x, y);
    const pillar = new THREE.Mesh(pillarGeometry, keep(createPillarMaterial('#ffb07a')));
    pillar.position.set(x, y, z);
    pillar.scale.set(1, 1, last ? 18 : 12);
    pillar.renderOrder = 6;
    const ring = new THREE.Mesh(
      ringGeometry,
      keep(new THREE.MeshBasicMaterial({ color: '#ffb07a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    );
    ring.position.set(x, y, z + 0.15);
    ring.renderOrder = 6;
    group.add(pillar, ring);
    return { pillar, ring, x, y, z, last };
  });

  const [sx, sy] = route.start;
  const pad = new THREE.Mesh(
    padGeometry,
    keep(new THREE.MeshBasicMaterial({ color: '#f3e5dc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  );
  pad.position.set(sx, sy, groundZ(sx, sy) + 0.15);
  pad.renderOrder = 6;
  group.add(pad);

  /* --------------------------------------------------------------- astronaut */
  const holder = new THREE.Group();
  holder.add(astronaut.object);
  group.add(holder);
  const kmPerModelMetre = heightKm / astronaut.heightMetres;

  const shadowTex = keep(radialTexture([[0, 0.55], [0.5, 0.25], [1, 0]]));
  const shadow = new THREE.Mesh(
    keep(new THREE.CircleGeometry(heightKm * 0.32, 32)),
    keep(new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: shadowTex, transparent: true, opacity: 0, depthWrite: false }))
  );
  shadow.renderOrder = 4;
  group.add(shadow);

  const footRing = new THREE.Mesh(
    keep(new THREE.RingGeometry(heightKm * 0.38, heightKm * 0.42, 48)),
    keep(new THREE.MeshBasicMaterial({ color: '#ffb07a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  );
  footRing.renderOrder = 6;
  group.add(footRing);

  const routePose = { x: 0, y: 0, dx: 1, dy: 0 };
  let yaw = Math.atan2(poseAt(route, 0, routePose).dy, routePose.dx);
  const astroPos = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

  /**
   * Per frame. presence: 0–1 fade for the whole site (enter / leave). appear: 0–1 for the
   * astronaut's arrival. sunLocal: sun direction in this group's frame.
   */
  function update({ time, dt, distanceKm, reached, walking, hurry, presence, appear, cameraDistanceKm, sunLocal, reducedMotion }) {
    // Patch fades in once its imagery arrives
    if (patchTexture) patchFade = Math.min(1, patchFade + dt / 0.9);
    patchMaterial.opacity = patchFade * presence;
    patch.visible = patchMaterial.opacity > 0.001;

    // Astronaut follows the route, turning smoothly toward the direction of travel
    poseAt(route, distanceKm, routePose);
    const z = groundZ(routePose.x, routePose.y);
    astroPos.set(routePose.x, routePose.y, z);
    const targetYaw = Math.atan2(routePose.dy, routePose.dx);
    yaw += angleDelta(yaw, targetYaw) * (1 - Math.exp(-dt * (hurry ? 14 : 7)));

    up.set(routePose.x / MARS_RADIUS_KM, routePose.y / MARS_RADIUS_KM, 1).normalize();
    forward.set(Math.cos(yaw), Math.sin(yaw), 0);
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    right.crossVectors(up, forward);
    basis.makeBasis(right, up, forward);
    holder.quaternion.setFromRotationMatrix(basis);
    holder.position.copy(astroPos);
    const a = Math.max(0.0001, appear * presence);
    holder.scale.setScalar(kmPerModelMetre * (0.6 + 0.4 * a));
    holder.visible = appear * presence > 0.01;
    const speedKmS = EXPLORE.astronaut.speedKmS * (hurry ? EXPLORE.astronaut.hurryFactor : 1);
    astronaut.update(dt, walking, speedKmS / kmPerModelMetre);

    // Soft shadow, cast away from the sun
    const k = Math.min(2.5, Math.max(0, 1 / Math.max(0.2, sunLocal.z)));
    shadow.position.set(astroPos.x - sunLocal.x * k * heightKm * 0.25, astroPos.y - sunLocal.y * k * heightKm * 0.25, z + 0.08);
    shadow.material.opacity = 0.8 * appear * presence;

    footRing.position.set(astroPos.x, astroPos.y, z + 0.14);
    const ringPulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3);
    footRing.material.opacity = (0.25 + 0.25 * ringPulse) * appear * presence;
    const ringScale = Math.max(1, cameraDistanceKm / 90);
    footRing.scale.setScalar(ringScale);

    // Route: brighter behind the astronaut, flowing dashes ahead; width keeps a steady on-screen size
    const halfWidth = Math.min(1.4, Math.max(0.12, cameraDistanceKm * 0.0045));
    ribbon.material.uniforms.uHalfWidth.value = halfWidth;
    ribbon.material.uniforms.uDash.value = halfWidth * 9;
    ribbon.material.uniforms.uTraveled.value = distanceKm;
    ribbon.material.uniforms.uTime.value = reducedMotion ? 0 : time;
    ribbon.material.uniforms.uOpacity.value = presence;

    beacons.forEach((b, i) => {
      const isNext = i === reached;
      const done = i < reached;
      const pulse = reducedMotion ? 0.6 : 0.6 + 0.4 * Math.sin(time * 2.6 + i);
      const intensity = done ? 0.35 : isNext ? 0.9 + 0.5 * pulse : 0.55;
      b.pillar.material.uniforms.uIntensity.value = intensity * presence;
      b.pillar.material.uniforms.uColor.value.set(done ? '#f3e5dc' : b.last ? '#ffd27a' : '#ffb07a');
      b.ring.material.opacity = (done ? 0.35 : 0.75) * presence;
      b.ring.material.color.set(done ? '#f3e5dc' : '#ffb07a');
      const s = Math.max(1, cameraDistanceKm / 70);
      b.ring.scale.setScalar(s);
      b.pillar.scale.x = b.pillar.scale.y = s;
    });
    pad.material.opacity = 0.45 * presence;
    pad.scale.setScalar(Math.max(1, cameraDistanceKm / 70));
  }

  function setImagery(canvas) {
    patchTexture?.dispose();
    patchTexture = new THREE.CanvasTexture(canvas);
    patchTexture.colorSpace = THREE.SRGBColorSpace;
    patchTexture.anisotropy = 8;
    patchMaterial.map = patchTexture;
    patchMaterial.needsUpdate = true;
  }

  return {
    landmarkId,
    route,
    group,
    astronautPosition: astroPos,
    get astronautYaw() {
      return yaw;
    },
    beacons,
    update,
    setImagery,
    dispose() {
      holder.remove(astronaut.object);
      patchTexture?.dispose();
      disposables.forEach((d) => d.dispose());
      group.removeFromParent();
    },
  };
}
