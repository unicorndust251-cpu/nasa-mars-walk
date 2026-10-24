import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { INTRO } from './introConfig.js';
import { cameraDistance, cameraDrift, planetOrientation } from './descent.js';
import {
  createAtmosphereMaterial,
  createMarsMaterial,
  createStarGeometry,
  createStarMaterial,
  prepareMarsTextures,
} from './marsMaterials.js';

const SUN_WORLD = new THREE.Vector3(...INTRO.sunDirection).normalize();

/** Camera push-in driven by the shared animation state, with a barely-there handheld drift. */
function CameraRig({ anim }) {
  const { camera, size } = useThree();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const d = cameraDistance(anim, size.width / size.height);
    const [dx, dy] = cameraDrift(anim, d, t);
    camera.position.set(dx, dy, d);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Sunlight({ anim }) {
  const sun = useRef();
  const fill = useRef();
  useFrame(() => {
    sun.current.intensity = 3.6 * anim.light;
    fill.current.intensity = 0.05 * anim.light;
  });
  return (
    <>
      <directionalLight
        ref={sun}
        color={INTRO.colors.sun}
        position={SUN_WORLD.clone().multiplyScalar(10).toArray()}
        intensity={0}
      />
      <ambientLight ref={fill} color={INTRO.colors.fill} intensity={0} />
    </>
  );
}

function Mars({ anim, onReady }) {
  const gl = useThree((s) => s.gl);
  const [color, normal] = useLoader(THREE.TextureLoader, [INTRO.textures.color, INTRO.textures.normal]);
  const tiltRef = useRef();
  const spinRef = useRef();
  const spinAngle = useRef(INTRO.planet.startRotation);
  const readyRef = useRef(false);

  const mars = useMemo(() => {
    prepareMarsTextures({ color, normal }, gl);
    return createMarsMaterial({ color, normal });
  }, [color, normal, gl]);
  const atmosphere = useMemo(() => createAtmosphereMaterial(), []);

  useEffect(
    () => () => {
      mars.material.dispose();
      atmosphere.material.dispose();
    },
    [mars, atmosphere]
  );

  useFrame(({ camera }, delta) => {
    // Clamp delta so a dropped frame or a background tab never makes the planet jump
    spinAngle.current += Math.min(delta, 1 / 20) * INTRO.planet.spin * anim.spin;

    // During the descent the planet turns so Jezero Crater lands dead centre
    const o = planetOrientation(spinAngle.current, anim.align);
    spinRef.current.rotation.y = o.spinY;
    tiltRef.current.rotation.set(o.tiltX, 0, o.tiltZ);
    mars.uniforms.uLight.value = anim.light;
    mars.uniforms.uSunDirView.value.copy(SUN_WORLD).transformDirection(camera.matrixWorldInverse);
    atmosphere.uniforms.uLight.value = anim.light;

    // Signal readiness after the first real frame, so the timeline never starts on a blank canvas
    if (!readyRef.current) {
      readyRef.current = true;
      requestAnimationFrame(() => onReady?.());
    }
  });

  return (
    <group ref={tiltRef} rotation={[0, 0, INTRO.planet.axialTilt]}>
      <group ref={spinRef} rotation={[0, INTRO.planet.startRotation, 0]}>
        <mesh material={mars.material}>
          <sphereGeometry args={[INTRO.planet.radius, INTRO.planet.segments, INTRO.planet.segments / 2]} />
        </mesh>
      </group>
      <mesh material={atmosphere.material} scale={atmosphere.uniforms.uShell.value} renderOrder={1}>
        <sphereGeometry args={[INTRO.planet.radius, 96, 48]} />
      </mesh>
    </group>
  );
}

function Starfield({ anim }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => createStarGeometry(INTRO.stars), []);
  const stars = useMemo(() => createStarMaterial(dpr), [dpr]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => stars.material.dispose(), [stars]);
  useFrame(({ clock }) => {
    stars.uniforms.uTime.value = clock.getElapsedTime();
    stars.uniforms.uOpacity.value = anim.stars;
  });
  return <points geometry={geometry} material={stars.material} renderOrder={-1} />;
}

export default function IntroScene({ anim, onReady }) {
  return (
    <>
      <CameraRig anim={anim} />
      <Starfield anim={anim} />
      <Sunlight anim={anim} />
      <Mars anim={anim} onReady={onReady} />
    </>
  );
}
