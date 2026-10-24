import * as THREE from 'three';
import { EXPLORE } from './exploreConfig';
import { latLonToVec, toLon180 } from './geo';

/**
 * Glowing landmark markers. One group of sprites per landmark, all children of the planet,
 * so they turn with it. Sprites keep a constant on-screen size (sizeAttenuation off) and
 * are drawn without depth testing; instead each marker is faded out as it passes over the
 * horizon, which hides markers behind the planet without clipping those near the limb.
 *
 * Picking happens in screen space against the projected marker positions, which is more
 * forgiving than raycasting tiny sprites and works the same for mouse and touch.
 */

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTextures() {
  const glow = canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  const core = canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  const ring = canvasTexture(128, (ctx, s) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  });
  return { glow, core, ring };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createMarkerLayer(landmarks) {
  const textures = createTextures();
  const group = new THREE.Group();
  const baseColor = new THREE.Color(EXPLORE.markers.color);
  const selectedColor = new THREE.Color(EXPLORE.markers.selectedColor);
  const materials = [];

  const sprite = (map, opacity = 1) => {
    const m = new THREE.SpriteMaterial({
      map,
      color: baseColor.clone(),
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    materials.push(m);
    const s = new THREE.Sprite(m);
    s.renderOrder = 20;
    return s;
  };

  const items = landmarks.map((landmark, i) => {
    const local = new THREE.Vector3(...latLonToVec(landmark.lat, toLon180(landmark.lon))).multiplyScalar(EXPLORE.markers.altitude);
    const halo = sprite(textures.glow, 0.5);
    const ring = sprite(textures.ring, 0);
    const core = sprite(textures.core, 1);
    for (const s of [halo, ring, core]) {
      s.position.copy(local);
      group.add(s);
    }
    return {
      landmark,
      local,
      halo,
      ring,
      core,
      world: new THREE.Vector3(),
      screen: { x: -1e4, y: -1e4 },
      visible: 0,
      hover: 0,
      selected: 0,
      phase: i * 1.73,
    };
  });

  const tmp = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  /**
   * Per frame. presence: 0–1, how much the markers are shown at all (they fade out during
   * exploration). Returns nothing; read positions with screenPosition() and pick().
   */
  function update({ camera, width, height, time, dt, hoveredIndex, selectedId, presence, reducedMotion }) {
    const pxToScale = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / height;
    const ease = 1 - Math.exp(-dt * 10);

    items.forEach((it, i) => {
      it.world.copy(it.local).applyMatrix4(group.matrixWorld);
      toCamera.copy(camera.position).sub(it.world);
      const dist = toCamera.length();
      tmp.copy(it.world).normalize();
      const facing = tmp.dot(toCamera) / (dist || 1);
      // Fade across the horizon instead of popping
      it.visible = smoothstep(-0.015, 0.09, facing) * presence;

      it.hover += ((i === hoveredIndex ? 1 : 0) - it.hover) * ease;
      it.selected += ((it.landmark.id === selectedId ? 1 : 0) - it.selected) * ease;

      const pulse = reducedMotion ? 0 : Math.sin(time * 2.3 + it.phase);
      const grow = 1 + it.hover * (EXPLORE.markers.hoverScale - 1) + it.selected * (EXPLORE.markers.selectedScale - 1);

      it.core.scale.setScalar(EXPLORE.markers.corePx * grow * pxToScale);
      it.core.material.opacity = it.visible;
      it.core.material.color.copy(baseColor).lerp(selectedColor, Math.max(it.selected, it.hover * 0.6));

      it.halo.scale.setScalar(EXPLORE.markers.haloPx * (1 + 0.16 * pulse) * (1 + 0.3 * it.selected + 0.2 * it.hover) * pxToScale);
      it.halo.material.opacity = (0.7 + 0.25 * pulse + 0.3 * it.selected) * it.visible;
      it.halo.material.color.copy(baseColor).lerp(selectedColor, it.selected * 0.5);

      // Selected marker sends out a slow ripple
      const cycle = reducedMotion ? 0.35 : (time * 0.6 + it.phase) % 1;
      it.ring.scale.setScalar((14 + 34 * cycle) * pxToScale);
      it.ring.material.opacity = (1 - cycle) * 0.85 * it.selected * it.visible;
      it.ring.material.color.copy(selectedColor);

      tmp.copy(it.world).project(camera);
      const inFront = tmp.z < 1;
      it.screen.x = inFront ? ((tmp.x + 1) / 2) * width : -1e4;
      it.screen.y = inFront ? ((1 - tmp.y) / 2) * height : -1e4;
    });
  }

  /** Index of the visible marker nearest to a screen point within `radius` px, or −1. */
  function pick(x, y, radius) {
    let best = -1;
    let bestD = radius;
    items.forEach((it, i) => {
      if (it.visible < 0.35) return;
      const d = Math.hypot(it.screen.x - x, it.screen.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  return {
    object: group,
    items,
    update,
    pick,
    dispose() {
      materials.forEach((m) => m.dispose());
      Object.values(textures).forEach((t) => t.dispose());
    },
  };
}
