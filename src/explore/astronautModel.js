import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * A full-body astronaut in a classic white NASA extravehicular suit: hard upper torso,
 * life-support backpack, chest control module, bearing rings at every joint, bulky gloves
 * and boots, and a helmet with a gold sun visor. Built from primitives so it needs no
 * downloads, rigged with simple pivots, and animated procedurally.
 *
 * Units are metres; the figure stands about 1.9 m tall with its feet at y = 0, facing +z.
 */
export function createAstronaut() {
  const disposables = [];
  const track = (x) => (disposables.push(x), x);

  const mat = {
    suit: track(new THREE.MeshStandardMaterial({ color: '#ECE9E3', roughness: 0.86, metalness: 0 })),
    suitShade: track(new THREE.MeshStandardMaterial({ color: '#DAD5CD', roughness: 0.9, metalness: 0 })),
    hardShell: track(new THREE.MeshStandardMaterial({ color: '#F4F2EE', roughness: 0.42, metalness: 0.02 })),
    bearing: track(new THREE.MeshStandardMaterial({ color: '#AEB4BB', roughness: 0.32, metalness: 0.75 })),
    dark: track(new THREE.MeshStandardMaterial({ color: '#3B3F45', roughness: 0.55, metalness: 0.3 })),
    visor: track(new THREE.MeshStandardMaterial({ color: '#D9A441', roughness: 0.1, metalness: 1, envMapIntensity: 1.4 })),
    glove: track(new THREE.MeshStandardMaterial({ color: '#E6E2DA', roughness: 0.8 })),
    boot: track(new THREE.MeshStandardMaterial({ color: '#DCD8D1', roughness: 0.88 })),
    sole: track(new THREE.MeshStandardMaterial({ color: '#56514D', roughness: 0.95 })),
    stripe: track(new THREE.MeshStandardMaterial({ color: '#B8402F', roughness: 0.7 })),
    lamp: track(new THREE.MeshStandardMaterial({ color: '#FFF6E5', emissive: '#FFE7B8', emissiveIntensity: 1.6, roughness: 0.3 })),
    patch: track(new THREE.MeshStandardMaterial({ color: '#2C4A86', roughness: 0.7 })),
  };

  const capsule = (r, len, m) => new THREE.Mesh(track(new THREE.CapsuleGeometry(r, len, 6, 16)), m);
  const ring = (r, tube, m) => {
    const mesh = new THREE.Mesh(track(new THREE.TorusGeometry(r, tube, 10, 28)), m);
    mesh.rotation.x = Math.PI / 2; // lie flat, around a vertical limb
    return mesh;
  };
  const box = (w, h, d, radius, m) => new THREE.Mesh(track(new RoundedBoxGeometry(w, h, d, 3, radius)), m);
  const sphere = (r, m, ...range) => new THREE.Mesh(track(new THREE.SphereGeometry(r, 32, 20, ...range)), m);
  const cylinder = (r, h, m) => new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, h, 18)), m);

  const root = new THREE.Group();
  root.name = 'astronaut';
  const body = new THREE.Group(); // bobs and leans while walking
  root.add(body);

  /* ----------------------------------------------------------- pelvis + legs */
  const pelvis = capsule(0.165, 0.1, mat.suit);
  pelvis.scale.set(1.22, 1, 0.92);
  pelvis.position.y = 0.98;
  body.add(pelvis);
  const waist = ring(0.2, 0.026, mat.bearing);
  waist.position.y = 1.08;
  body.add(waist);

  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.11 * side, 0.93, 0);
    const thigh = capsule(0.09, 0.24, mat.suit);
    thigh.position.y = -0.2;
    hip.add(thigh);
    // Red commander stripes, as on the classic EVA suits
    const stripe = ring(0.093, 0.016, mat.stripe);
    stripe.position.y = -0.17;
    hip.add(stripe);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const kneeRing = ring(0.085, 0.02, mat.bearing);
    knee.add(kneeRing);
    const shin = capsule(0.082, 0.24, mat.suitShade);
    shin.position.y = -0.19;
    knee.add(shin);
    const ankle = new THREE.Group();
    ankle.position.y = -0.4;
    knee.add(ankle);
    const ankleRing = ring(0.08, 0.018, mat.bearing);
    ankleRing.position.y = 0.04;
    ankle.add(ankleRing);
    const boot = box(0.16, 0.12, 0.29, 0.045, mat.boot);
    boot.position.set(0, -0.04, 0.045);
    ankle.add(boot);
    const sole = box(0.165, 0.035, 0.3, 0.012, mat.sole);
    sole.position.set(0, -0.095, 0.045);
    ankle.add(sole);
    body.add(hip);
    return { hip, knee, ankle };
  }
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  /* ------------------------------------------------------------------ torso */
  const torso = new THREE.Group();
  torso.position.y = 1.08;
  body.add(torso);

  const hut = capsule(0.205, 0.26, mat.hardShell); // hard upper torso
  hut.scale.set(1.28, 1, 0.92);
  hut.position.y = 0.22;
  torso.add(hut);

  const neckRing = ring(0.145, 0.03, mat.bearing);
  neckRing.position.y = 0.49;
  torso.add(neckRing);

  // Display and control module on the chest
  const dcm = box(0.27, 0.13, 0.11, 0.025, mat.suitShade);
  dcm.position.set(0, 0.24, 0.2);
  torso.add(dcm);
  const dcmPanel = box(0.17, 0.06, 0.02, 0.008, mat.dark);
  dcmPanel.position.set(0.02, 0.255, 0.258);
  torso.add(dcmPanel);
  for (const [x, m] of [
    [-0.095, mat.stripe],
    [-0.06, mat.bearing],
  ]) {
    const knob = cylinder(0.014, 0.03, m);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(x, 0.255, 0.262);
    torso.add(knob);
  }
  const patch = box(0.07, 0.05, 0.012, 0.006, mat.patch);
  patch.position.set(0.17, 0.32, 0.165);
  patch.rotation.y = 0.45;
  torso.add(patch);

  // Portable life-support system (backpack)
  const plss = box(0.5, 0.64, 0.24, 0.06, mat.hardShell);
  plss.position.set(0, 0.25, -0.25);
  torso.add(plss);
  const plssTop = box(0.42, 0.08, 0.2, 0.03, mat.suitShade);
  plssTop.position.set(0, 0.6, -0.25);
  torso.add(plssTop);
  const plssPanel = box(0.32, 0.22, 0.02, 0.01, mat.suitShade);
  plssPanel.position.set(0, 0.16, -0.375);
  torso.add(plssPanel);
  const antenna = cylinder(0.006, 0.22, mat.dark);
  antenna.position.set(0.18, 0.74, -0.3);
  torso.add(antenna);
  const hose = new THREE.Mesh(
    track(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.2, 0.05, -0.13),
          new THREE.Vector3(0.27, 0.0, 0.02),
          new THREE.Vector3(0.12, 0.18, 0.22),
        ]),
        20,
        0.016,
        8
      )
    ),
    mat.dark
  );
  torso.add(hose);

  /* ----------------------------------------------------------------- helmet */
  const head = new THREE.Group();
  head.position.y = 0.62;
  torso.add(head);
  const shell = sphere(0.19, mat.hardShell);
  head.add(shell);
  // Gold sun visor across the front of the bubble
  const visor = sphere(0.197, mat.visor, Math.PI / 2 - 1.0, 2.0, 0.92, 1.08);
  head.add(visor);
  for (const side of [1, -1]) {
    const lampHousing = box(0.05, 0.045, 0.08, 0.012, mat.suitShade);
    lampHousing.position.set(0.17 * side, 0.08, 0.06);
    head.add(lampHousing);
    const lamp = cylinder(0.016, 0.01, mat.lamp);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0.17 * side, 0.08, 0.102);
    head.add(lamp);
  }

  /* ------------------------------------------------------------------- arms */
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.3 * side, 0.43, 0);
    torso.add(shoulder);
    const cap = sphere(0.1, mat.hardShell);
    cap.scale.set(1, 0.9, 1);
    shoulder.add(cap);
    const shoulderRing = ring(0.085, 0.02, mat.bearing);
    shoulderRing.position.y = -0.08;
    shoulder.add(shoulderRing);
    const upper = capsule(0.074, 0.18, mat.suit);
    upper.position.y = -0.18;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    const elbowRing = ring(0.072, 0.018, mat.bearing);
    elbow.add(elbowRing);
    const fore = capsule(0.068, 0.17, mat.suitShade);
    fore.position.y = -0.14;
    elbow.add(fore);
    const wristRing = ring(0.066, 0.02, mat.bearing);
    wristRing.position.y = -0.28;
    elbow.add(wristRing);
    const glove = sphere(0.072, mat.glove);
    glove.scale.set(0.95, 1.25, 0.78);
    glove.position.y = -0.36;
    elbow.add(glove);
    return { shoulder, elbow };
  }
  const armL = makeArm(1);
  const armR = makeArm(-1);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  /* -------------------------------------------------------------- animation */
  const state = { phase: 0, walk: 0, wave: 0, look: 0, time: 0 };

  /**
   * Pose the figure. walkWeight 0 → 1 blends idle into the walk; cycleHz is the stride
   * rate; wave 0 → 1 raises the right arm to wave; look turns the helmet to scan around.
   */
  function update(dt, { walkWeight = 0, cycleHz = 1, wave = 0, look = 0 } = {}) {
    state.time += dt;
    const k = 1 - Math.exp(-dt * 6);
    state.walk += (walkWeight - state.walk) * k;
    state.wave += (wave - state.wave) * (1 - Math.exp(-dt * 4));
    state.look += (look - state.look) * (1 - Math.exp(-dt * 2.5));
    if (state.walk > 0.01) state.phase += dt * cycleHz * Math.PI * 2;

    const w = state.walk;
    const p = state.phase;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const t = state.time;

    // Legs: long, loping low-gravity strides
    legL.hip.rotation.x = -s * 0.52 * w;
    legR.hip.rotation.x = s * 0.52 * w;
    legL.knee.rotation.x = w * (0.1 + 0.8 * Math.max(0, c));
    legR.knee.rotation.x = w * (0.1 + 0.8 * Math.max(0, -c));
    legL.ankle.rotation.x = -(legL.hip.rotation.x + legL.knee.rotation.x) * 0.55;
    legR.ankle.rotation.x = -(legR.hip.rotation.x + legR.knee.rotation.x) * 0.55;

    // Body: a soft bounce each step (Mars has 38% of Earth's gravity), a slight lean and twist
    const breathe = Math.sin(t * 1.7) * 0.006 * (1 - w);
    body.position.y = w * (Math.abs(s) * 0.05 - 0.035) + breathe;
    body.rotation.x = 0.09 * w;
    torso.rotation.y = s * 0.07 * w;
    torso.rotation.x = -0.03 * w;

    // Arms swing against the legs; bulky suit keeps them slightly out from the body
    armL.shoulder.rotation.x = s * 0.38 * w;
    armR.shoulder.rotation.x = -s * 0.38 * w;
    armL.shoulder.rotation.z = 0.16 + 0.02 * Math.sin(t * 1.7);
    armR.shoulder.rotation.z = -0.16 - 0.02 * Math.sin(t * 1.7);
    armL.elbow.rotation.x = -0.32 - 0.22 * w * Math.max(0, s);
    armR.elbow.rotation.x = -0.32 - 0.22 * w * Math.max(0, -s);
    armR.elbow.rotation.z = 0;

    // Wave: right arm up and out, forearm rocking
    if (state.wave > 0.001) {
      const v = state.wave;
      armR.shoulder.rotation.x *= 1 - v;
      armR.shoulder.rotation.z = THREE.MathUtils.lerp(armR.shoulder.rotation.z, -2.55, v);
      armR.elbow.rotation.x = THREE.MathUtils.lerp(armR.elbow.rotation.x, -0.2, v);
      armR.elbow.rotation.z = v * (-0.25 + 0.4 * Math.sin(t * 7.5));
    }

    // Helmet: scans the terrain at checkpoints, otherwise looks along the path
    head.rotation.y = state.look * Math.sin(t * 0.8) * 0.65 - torso.rotation.y * 0.8;
    head.rotation.x = 0.06 * w;
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  update(0);
  return { root, update, dispose, height: 1.9 };
}
