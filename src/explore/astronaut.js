import * as THREE from 'three';

/**
 * A small procedural astronaut with a walk cycle, built from primitives so it needs no
 * model download. Built in metres: about 1.8 tall, feet at y = 0, facing +z, y up.
 * To use a GLB instead, replace buildAstronaut() with a loader that returns the same
 * { object, update, dispose } shape.
 */

const STRIDE = 1.5; // metres per full walk cycle (two steps)

export function buildAstronaut() {
  const disposables = [];
  const mat = (params) => {
    const m = new THREE.MeshStandardMaterial(params);
    disposables.push(m);
    return m;
  };
  const geo = (g) => {
    disposables.push(g);
    return g;
  };

  const suit = mat({ color: '#ece6df', roughness: 0.72, metalness: 0 });
  const trim = mat({ color: '#b87860', roughness: 0.6, metalness: 0 });
  const dark = mat({ color: '#5c4c45', roughness: 0.85, metalness: 0 });
  const visor = mat({ color: '#d29a3c', roughness: 0.18, metalness: 1, emissive: '#3a2410', emissiveIntensity: 0.6 });
  const lamp = mat({ color: '#fff1e2', emissive: '#ffd2a6', emissiveIntensity: 2.4 });

  const mesh = (g, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo(g), m);
    o.position.set(x, y, z);
    return o;
  };

  const root = new THREE.Group(); // positioned and oriented by the caller
  const body = new THREE.Group(); // bobs with each step
  root.add(body);

  // Torso and backpack
  const torso = new THREE.Group();
  torso.position.y = 1.12;
  body.add(torso);
  const chest = mesh(new THREE.CapsuleGeometry(0.25, 0.36, 6, 14), suit);
  chest.scale.set(1, 1, 0.82);
  torso.add(chest);
  const belt = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 18), trim, 0, -0.2, 0);
  belt.scale.z = 0.84;
  torso.add(belt);
  torso.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), trim, 0, 0.08, 0.2)); // chest control unit
  const pack = mesh(new THREE.BoxGeometry(0.44, 0.52, 0.22), suit, 0, 0.04, -0.27);
  torso.add(pack);
  torso.add(mesh(new THREE.BoxGeometry(0.36, 0.06, 0.2), trim, 0, 0.3, -0.27));

  // Helmet with a gold visor and a small lamp
  const head = new THREE.Group();
  head.position.y = 0.48;
  torso.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.2, 24, 18), suit));
  const shield = mesh(new THREE.SphereGeometry(0.205, 24, 16, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.26, Math.PI * 0.4), visor);
  shield.rotation.y = Math.PI / 2; // centre the slice on +z
  head.add(shield);
  head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), lamp, 0.13, 0.14, 0.09));

  // Limbs: each joint is a group whose origin is the pivot
  const limb = (radius, length, material) => mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material, 0, -length / 2 - radius * 0.4, 0);

  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(0.12 * side, 0.86, 0);
    hip.add(limb(0.1, 0.3, suit));
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    knee.add(limb(0.09, 0.28, suit));
    knee.add(mesh(new THREE.BoxGeometry(0.17, 0.1, 0.28), dark, 0, -0.38, 0.04));
    body.add(hip);
    return { hip, knee };
  };

  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.33 * side, 1.38, 0);
    shoulder.add(limb(0.075, 0.24, suit));
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);
    elbow.add(limb(0.07, 0.22, suit));
    elbow.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), trim, 0, -0.33, 0));
    body.add(shoulder);
    return { shoulder, elbow };
  };

  const legs = [makeLeg(-1), makeLeg(1)];
  const arms = [makeArm(-1), makeArm(1)];

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });

  let phase = 0;
  let walk = 0; // 0 = standing, 1 = full stride; eased so starts and stops are smooth
  let time = 0;

  /**
   * dt: seconds. walking: whether the figure is moving. metresPerSecond: ground speed in
   * the model's own metres, so the legs keep pace with the movement.
   */
  function update(dt, walking, metresPerSecond = 1.4) {
    time += dt;
    walk += ((walking ? 1 : 0) - walk) * (1 - Math.exp(-dt * 6));
    if (walking) phase += ((metresPerSecond * dt) / STRIDE) * Math.PI * 2;

    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const swing = 0.55 * walk;

    legs[0].hip.rotation.x = -s * swing;
    legs[1].hip.rotation.x = s * swing;
    legs[0].knee.rotation.x = Math.max(0, c) * 0.9 * walk;
    legs[1].knee.rotation.x = Math.max(0, -c) * 0.9 * walk;

    arms[0].shoulder.rotation.x = s * 0.45 * walk;
    arms[1].shoulder.rotation.x = -s * 0.45 * walk;
    arms[0].elbow.rotation.x = -0.35 - 0.15 * walk;
    arms[1].elbow.rotation.x = -0.35 - 0.15 * walk;
    arms[0].shoulder.rotation.z = -0.08;
    arms[1].shoulder.rotation.z = 0.08;

    // Low gravity: a slightly bouncy gait, highest as the legs pass each other
    const breathe = Math.sin(time * 1.6) * 0.008 * (1 - walk);
    body.position.y = (0.045 * (1 + Math.cos(2 * phase)) * 0.5) * walk + breathe;
    torso.rotation.y = s * 0.08 * walk;
    torso.rotation.x = 0.06 * walk;
  }

  update(0, false);

  return {
    object: root,
    heightMetres: 1.8,
    update,
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
