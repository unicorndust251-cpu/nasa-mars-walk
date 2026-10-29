import { Component, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createAstronaut } from './astronautModel.js';
import { KM_PER_DEG, pointAt } from '../landmarks/route';

/**
 * The astronaut, drawn in a transparent 3D layer over the Leaflet map.
 *
 * The map is the ground plane. An orthographic camera looks down at it from ELEVATION
 * degrees, and every map pixel (x, y) maps to the ground point (x, y / sin ELEVATION), so
 * the astronaut's feet land exactly on its map position while the body, backpack and
 * helmet read in three dimensions.
 */
const ELEVATION = 52 * (Math.PI / 180);
const SIN_E = Math.sin(ELEVATION);
const COS_E = Math.cos(ELEVATION);
/** On-screen height of the figure at the exploration zoom, in CSS px */
const FIGURE_PX = { min: 54, max: 82, ofViewport: 0.09 };
const SPAWN = { drop: 0.9, dust: [0.82, 1.9], height: 7 };

const pxPerKm = (zoom) => (256 * Math.pow(2, zoom)) / 180 / KM_PER_DEG;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function radialTexture(inner = 'rgba(0,0,0,1)', outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.5, inner.replace(/[\d.]+\)$/, '0.55)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.65;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function TiltedCamera() {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(0, 3000 * SIN_E, 3000 * COS_E);
    camera.up.set(0, COS_E, -SIN_E);
    camera.lookAt(0, 0, 0);
    camera.near = 1;
    camera.far = 8000;
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function Astronaut({ map, getState }) {
  const size = useThree((s) => s.size);
  const astro = useMemo(() => createAstronaut(), []);
  const group = useRef();
  const shadow = useRef();
  const dust = useRef();
  const anim = useRef({ yaw: 0, spawnId: -1, spawnT: 99, wasVisible: false });

  const shadowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#000000', transparent: true, opacity: 0.4, depthWrite: false }),
    []
  );
  const dustMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: radialTexture('rgba(255,255,255,1)'),
        color: '#E6CDB8',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    []
  );
  useEffect(
    () => () => {
      astro.dispose();
      shadowMat.map.dispose();
      shadowMat.dispose();
      dustMat.map.dispose();
      dustMat.dispose();
    },
    [astro, shadowMat, dustMat]
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const st = getState();
    const g = group.current;
    const a = anim.current;
    if (!g) return;

    const visible = !!st && st.status !== 'arriving';
    g.visible = shadow.current.visible = visible;
    if (!visible) {
      dust.current.visible = false;
      a.wasVisible = false;
      return;
    }

    // A new landing (first appearance or Restart) replays the touchdown
    if (st.spawnId !== a.spawnId) {
      a.spawnId = st.spawnId;
      a.spawnT = st.reducedMotion ? 99 : 0;
    }
    a.spawnT += dt;

    // Where on screen, and which way is "forward" along the path
    const { route, s } = st;
    const here = pointAt(route, s);
    const nearEnd = s > route.length - 0.05;
    const other = pointAt(route, nearEnd ? s - 0.05 : s + 0.05);
    const p = map.latLngToContainerPoint(here);
    const q = map.latLngToContainerPoint(other);
    let dx = q.x - p.x;
    let dy = q.y - p.y;
    if (nearEnd) {
      dx = -dx;
      dy = -dy;
    }

    const zoom = map.getZoom();
    const zoomScale = THREE.MathUtils.clamp(Math.pow(2, (zoom - st.exploreZoom) * 0.3), 0.6, 1.5);
    const figurePx = THREE.MathUtils.clamp(size.height * FIGURE_PX.ofViewport, FIGURE_PX.min, FIGURE_PX.max) * zoomScale;
    const scale = figurePx / (astro.height * COS_E + 0.3 * SIN_E);

    // Face the direction of travel (ground-plane heading), turning smoothly
    if (Math.hypot(dx, dy) > 0.01) {
      const target = Math.atan2(dx, dy / SIN_E);
      let diff = target - a.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.yaw += diff * (1 - Math.exp(-dt * (st.reducedMotion ? 30 : 7)));
    }

    // Touchdown: drop from above, kick up a ring of dust
    const dropT = Math.min(1, a.spawnT / SPAWN.drop);
    const drop = (1 - easeOutCubic(dropT)) * SPAWN.height;
    const X = p.x - size.width / 2;
    const Z = (p.y - size.height / 2) / SIN_E;
    g.position.set(X, drop * scale, Z);
    g.rotation.y = a.yaw;
    g.scale.setScalar(scale);

    shadow.current.position.set(X + 0.22 * scale, 0, Z + 0.06 * scale);
    shadow.current.scale.set(0.95 * scale, 0.62 * scale, 1);
    shadowMat.opacity = 0.42 * (0.35 + 0.65 * dropT);

    const [d0, d1] = SPAWN.dust;
    const dustT = (a.spawnT - d0) / (d1 - d0);
    dust.current.visible = dustT > 0 && dustT < 1;
    if (dust.current.visible) {
      const r = (0.5 + 2.6 * easeOutCubic(dustT)) * scale;
      dust.current.position.set(X, 0, Z);
      dust.current.scale.set(r, r, 1);
      dustMat.opacity = 0.55 * (1 - dustT);
    }

    // Stride rate follows ground speed on screen, so feet don't skate when you zoom
    const screenSpeed = st.speed * pxPerKm(zoom);
    const cycleHz = THREE.MathUtils.clamp(screenSpeed / (1.45 * scale), 0.55, 3.2);
    astro.update(dt, {
      walkWeight: st.status === 'walking' ? 1 : 0,
      cycleHz,
      wave: st.status === 'complete' ? 1 : 0,
      look: st.status === 'checkpoint' ? 1 : 0,
    });
  });

  return (
    <>
      <mesh ref={shadow} material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={dust} material={dustMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group ref={group}>
        <primitive object={astro.root} />
      </group>
    </>
  );
}

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('[Beyond Terra] Astronaut layer unavailable.', error);
    this.props.onError?.(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Props: map (Leaflet map), getState() → { route, s, status, speed (map-km/s, 0 when still),
 * exploreZoom, spawnId, reducedMotion } read every frame, onError.
 */
export default function AstronautCanvas({ map, getState, onContextLost, onError }) {
  // R3F deliberately loses the context when a canvas unmounts; only a loss while mounted is a failure
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <SceneBoundary onError={onError}>
      <Canvas
        className="bt-astro"
        orthographic
        dpr={[1, 2]}
        camera={{ zoom: 1, near: 1, far: 8000, position: [0, 3000 * SIN_E, 3000 * COS_E] }}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            if (!alive.current) return;
            e.preventDefault();
            onContextLost?.();
          });
        }}
        style={{ pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <TiltedCamera />
        <Environment />
        <hemisphereLight args={['#FFF4EA', '#8C5A43', 0.75]} />
        <directionalLight position={[-0.8, 1.4, 0.6]} intensity={2.4} color="#FFE6CF" />
        <directionalLight position={[0.9, 0.6, -0.8]} intensity={0.5} color="#D6A38B" />
        <SceneBoundary onError={onError}>
          <Astronaut map={map} getState={getState} />
        </SceneBoundary>
      </Canvas>
    </SceneBoundary>
  );
}
