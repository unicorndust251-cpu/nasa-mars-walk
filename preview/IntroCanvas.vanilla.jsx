// PREVIEW BUILD ONLY.
// A plain-Three.js stand-in for src/intro/IntroCanvas.jsx, used to produce the
// self-contained preview page where React Three Fiber can't be installed.
// It builds the exact same scene from the same shared modules (introConfig,
// marsMaterials, introTimeline), so what the preview shows is what the R3F app renders.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { INTRO } from '../src/intro/introConfig.js';
import { cameraDistance, cameraDrift, planetOrientation } from '../src/intro/descent.js';
import {
  createAtmosphereMaterial,
  createMarsMaterial,
  createStarGeometry,
  createStarMaterial,
  prepareMarsTextures,
} from '../src/intro/marsMaterials.js';
import colorUrl from '../public/textures/mars_color_2k.jpg';
import normalUrl from '../public/textures/mars_normal_2k.jpg';


export default function IntroCanvasVanilla({ anim, onReady, onError }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      onError?.(e);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(INTRO.colors.space, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(INTRO.camera.fov, 1, 0.1, 300);
    const SUN = new THREE.Vector3(...INTRO.sunDirection).normalize();

    const sun = new THREE.DirectionalLight(INTRO.colors.sun, 0);
    sun.position.copy(SUN).multiplyScalar(10);
    const fill = new THREE.AmbientLight(INTRO.colors.fill, 0);
    scene.add(sun, fill);

    const stars = createStarMaterial(renderer.getPixelRatio());
    const starGeo = createStarGeometry(INTRO.stars);
    const points = new THREE.Points(starGeo, stars.material);
    points.renderOrder = -1;
    scene.add(points);

    const tilt = new THREE.Group();
    tilt.rotation.z = INTRO.planet.axialTilt;
    const spin = new THREE.Group();
    spin.rotation.y = INTRO.planet.startRotation;
    tilt.add(spin);
    scene.add(tilt);

    let mars = null;
    let marsGeo = null;
    const atmosphere = createAtmosphereMaterial();
    const atmoGeo = new THREE.SphereGeometry(INTRO.planet.radius, 96, 48);
    const atmoMesh = new THREE.Mesh(atmoGeo, atmosphere.material);
    atmoMesh.scale.setScalar(atmosphere.uniforms.uShell.value);
    atmoMesh.renderOrder = 1;
    tilt.add(atmoMesh);

    let spinAngle = INTRO.planet.startRotation;
    let disposed = false;
    let raf = 0;
    let ready = false;
    let size = { w: 1, h: 1 };
    const clock = new THREE.Clock();

    const resize = () => {
      size = { w: host.clientWidth || window.innerWidth, h: host.clientHeight || window.innerHeight };
      renderer.setSize(size.w, size.h, false);
      camera.aspect = size.w / size.h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const loader = new THREE.TextureLoader();
    Promise.all([loader.loadAsync(colorUrl), loader.loadAsync(normalUrl)])
      .then(([color, normal]) => {
        if (disposed) return;
        prepareMarsTextures({ color, normal }, renderer);
        mars = createMarsMaterial({ color, normal });
        marsGeo = new THREE.SphereGeometry(INTRO.planet.radius, INTRO.planet.segments, INTRO.planet.segments / 2);
        spin.add(new THREE.Mesh(marsGeo, mars.material));
        renderer.compile(scene, camera);
        loop();
      })
      .catch((e) => !disposed && onError?.(e));

    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const delta = Math.min(clock.getDelta(), 1 / 20);
      const t = clock.elapsedTime;

      const d = cameraDistance(anim, size.w / size.h);
      const [dx, dy] = cameraDrift(anim, d, t);
      camera.position.set(dx, dy, d);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      spinAngle += delta * INTRO.planet.spin * anim.spin;
      const o = planetOrientation(spinAngle, anim.align);
      spin.rotation.y = o.spinY;
      tilt.rotation.set(o.tiltX, 0, o.tiltZ);
      sun.intensity = 3.6 * anim.light;
      fill.intensity = 0.05 * anim.light;
      mars.uniforms.uLight.value = anim.light;
      mars.uniforms.uSunDirView.value.copy(SUN).transformDirection(camera.matrixWorldInverse);
      atmosphere.uniforms.uLight.value = anim.light;
      stars.uniforms.uTime.value = t;
      stars.uniforms.uOpacity.value = anim.stars;

      renderer.render(scene, camera);
      if (!ready) {
        ready = true;
        requestAnimationFrame(() => onReady?.());
      }
    };

    const onLost = (e) => {
      e.preventDefault();
      onError?.(new Error('WebGL context lost'));
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      starGeo.dispose();
      stars.material.dispose();
      atmoGeo.dispose();
      atmosphere.material.dispose();
      marsGeo?.dispose();
      mars?.material.dispose();
      mars?.material.map?.dispose();
      mars?.material.normalMap?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="bt-intro__canvas" aria-hidden="true" />;
}
