import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { INTRO, distanceForFill } from '../intro/introConfig.js';
import {
  createAtmosphereMaterial,
  createMarsMaterial,
  createStarGeometry,
  createStarMaterial,
  prepareMarsTextures,
} from '../intro/marsMaterials.js';
import { EXPLORE } from './exploreConfig';
import { LANDMARKS, landmarkById } from './landmarks';
import { MARS_RADIUS_KM, angularDistanceDeg, nearestLon, tangentBasis, toLon180 } from './geo';
import { buildRoute } from './route';
import { createMarkerLayer } from './markers.js';
import { createDetailTexture, createSite, groundZ } from './siteVisuals.js';
import { buildAstronaut } from './astronaut.js';
import { buildSurfacePatch } from './surfacePatch.js';

/**
 * The 3D globe explorer: the same Mars as the intro (materials, textures, atmosphere,
 * starfield), turned into an interactive globe with landmark markers and astronaut
 * exploration missions.
 *
 * Props: store (explorerStore), labels ({ hover, selected, checkpoints, progress } refs to
 * DOM elements the scene positions every frame), reducedMotion, onReady, onError.
 */

const SUN = new THREE.Vector3(...EXPLORE.sun).normalize();
const FOV = INTRO.camera.fov;
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
const D2R = Math.PI / 180;

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('[Beyond Terra] 3D globe unavailable.', error);
    this.props.onError?.(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Distance at which the whole planet fills a comfortable share of the screen. */
function overviewDistance(aspect) {
  return distanceForFill(Math.min(0.64, 0.82 * aspect), FOV, 1);
}

/** Camera distance that frames a landmark, scaled to its size. */
function landmarkDistance(landmark) {
  const [lo, hi] = EXPLORE.globe.selectAltitude;
  const spanRadii = (landmark.diameterKm * EXPLORE.globe.selectContext) / MARS_RADIUS_KM;
  return 1 + clamp(spanRadii / (2 * TAN_HALF_FOV), lo, hi);
}

/** Rotation that turns (lat, lon) to face +z with north up. */
const orientBasis = new THREE.Matrix4();
function orientationFor(lat, lon, out) {
  const { east, north, up } = tangentBasis(lat, lon);
  orientBasis.makeBasis(new THREE.Vector3(...east), new THREE.Vector3(...north), new THREE.Vector3(...up));
  return out.setFromRotationMatrix(orientBasis).invert();
}

function makePose() {
  return { pos: new THREE.Vector3(0, 0, 5), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
}
function copyPose(a, b) {
  a.pos.copy(b.pos);
  a.target.copy(b.target);
  a.up.copy(b.up);
}

/**
 * Blend two camera poses. Altitude is interpolated in log space, so a fall from orbit to
 * the surface reads as a steady rate of zoom (like the intro's descent) instead of
 * crawling at first and slamming in at the end.
 */
const blendA = new THREE.Vector3();
const blendB = new THREE.Vector3();
function blendPose(a, b, t, out) {
  out.target.lerpVectors(a.target, b.target, t);
  const ra = a.pos.length();
  const rb = b.pos.length();
  const altA = Math.max(1e-6, ra - 1);
  const altB = Math.max(1e-6, rb - 1);
  const alt = Math.exp(Math.log(altA) + (Math.log(altB) - Math.log(altA)) * t);
  blendA.copy(a.pos).divideScalar(ra);
  blendB.copy(b.pos).divideScalar(rb);
  out.pos.lerpVectors(blendA, blendB, t).normalize().multiplyScalar(1 + alt);
  out.up.lerpVectors(a.up, b.up, t).normalize();
}

/* ========================================================================== */

function ExplorerScene({ store, labels, reducedMotion, onReady }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const [color, normal] = useLoader(THREE.TextureLoader, [INTRO.textures.color, INTRO.textures.normal]);

  const mars = useMemo(() => {
    prepareMarsTextures({ color, normal }, gl);
    return createMarsMaterial({ color, normal });
  }, [color, normal, gl]);
  const atmosphere = useMemo(() => {
    const a = createAtmosphereMaterial();
    a.uniforms.uSunDir.value.copy(SUN);
    return a;
  }, []);
  const starGeometry = useMemo(() => createStarGeometry(INTRO.stars), []);
  const stars = useMemo(() => createStarMaterial(Math.min(2, window.devicePixelRatio || 1)), []);
  const markers = useMemo(() => createMarkerLayer(LANDMARKS), []);
  const astronaut = useMemo(() => buildAstronaut(), []);
  const detailTexture = useMemo(() => createDetailTexture(), []);

  const planetRef = useRef();
  const sunRef = useRef();

  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  // All mutable scene state lives here, outside React
  const d = useMemo(() => {
    const state = store.getState();
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const selected = landmarkById(state.selectedId);
    const view = selected
      ? { lat: selected.lat, lon: toLon180(selected.lon), dist: landmarkDistance(selected) }
      : { lat: EXPLORE.globe.overviewLat, lon: toLon180(EXPLORE.globe.openingLon), dist: overviewDistance(aspect) * 1.35 };
    return {
      view,
      velocity: { lat: 0, lon: 0 },
      lastInteraction: -1e9,
      hovered: -1,
      hoverName: '',
      presence: state.mode === 'globe' ? 1 : 0,
      shift: { x: 0, y: 0 },
      pose: makePose(),
      desired: makePose(),
      from: makePose(),
      transition: null,
      mode: state.mode,
      follow: state.follow,
      orbit: { az: 0, el: 0, zoom: 1 },
      camYaw: 0,
      site: null,
      leaving: [],
      siteAppear: 0,
      siteBorn: 0,
      abort: null,
      patchCache: new Map(),
      viewToken: state.view.token,
      ready: false,
      time: 0,
    };
  }, [store]);

  /* ---------------------------------------------------------------- flights */
  const fly = (kind, durationOverride) => {
    const { view } = d;
    const state = store.getState();
    const aspect = gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight);
    let target;
    if (kind === 'landmark') {
      const lm = landmarkById(state.mode === 'explore' ? state.missionId : state.selectedId);
      if (!lm) return;
      target = { lat: lm.lat, lon: nearestLon(toLon180(lm.lon), view.lon), dist: landmarkDistance(lm) };
    } else {
      target = { lat: EXPLORE.globe.overviewLat, lon: view.lon, dist: overviewDistance(aspect) };
    }
    gsap.killTweensOf(view);
    d.velocity.lat = d.velocity.lon = 0;
    const angle = angularDistanceDeg(view.lat, view.lon, target.lat, target.lon);
    const zoomChange = Math.abs(Math.log((target.dist - 1) / Math.max(1e-3, view.dist - 1)));
    const duration = reducedRef.current ? 0 : durationOverride ?? clamp(0.9 + angle / 100 + zoomChange * 0.35, 1, 2.6);
    if (duration <= 0) Object.assign(view, target);
    else gsap.to(view, { ...target, duration, ease: 'power2.inOut' });
  };

  const beginTransition = (seconds) => {
    copyPose(d.from, d.pose);
    d.transition = reducedRef.current || seconds <= 0 ? null : { start: d.time, duration: seconds };
  };

  /* ------------------------------------------------------------------ sites */
  const disposeSite = (site) => {
    site.dispose();
  };

  const enterSite = (landmark) => {
    if (d.site) {
      disposeSite(d.site);
      d.site = null;
    }
    d.leaving.forEach(({ site }) => disposeSite(site));
    d.leaving = [];
    d.abort?.abort();

    const route = buildRoute(landmark.id, landmark.checkpoints.length);
    store.runtime.routeKm = route.totalKm;
    const site = createSite({ landmarkId: landmark.id, route, astronaut, detailTexture });
    const lon = toLon180(landmark.lon);
    const { east, north, up } = tangentBasis(landmark.lat, lon);
    site.group.position.set(...up);
    orientBasis.makeBasis(new THREE.Vector3(...east), new THREE.Vector3(...north), new THREE.Vector3(...up));
    site.group.quaternion.setFromRotationMatrix(orientBasis);
    site.group.scale.setScalar(1 / MARS_RADIUS_KM);
    planetRef.current.add(site.group);
    d.site = site;
    d.siteAppear = 0;
    d.siteBorn = d.time;
    d.camYaw = site.astronautYaw + Math.PI;
    d.orbit = { az: 0, el: 0, zoom: 1 };

    const cached = d.patchCache.get(landmark.id);
    if (cached) {
      site.setImagery(cached);
      store.setImagery('ready');
      return;
    }
    store.setImagery('loading');
    const abort = new AbortController();
    d.abort = abort;
    buildSurfacePatch({ lat: landmark.lat, lon, globeImage: color.image, signal: abort.signal })
      .then(({ canvas }) => {
        d.patchCache.set(landmark.id, canvas);
        if (d.patchCache.size > 4) d.patchCache.delete(d.patchCache.keys().next().value);
        if (d.site === site) {
          site.setImagery(canvas);
          store.setImagery('ready');
        }
      })
      .catch((err) => {
        if (abort.signal.aborted) return;
        console.warn('[Beyond Terra] Site imagery unavailable, using the globe texture.', err);
        if (d.site === site) store.setImagery('fallback');
      });
  };

  const leaveSite = () => {
    d.abort?.abort();
    if (d.site) d.leaving.push({ site: d.site, start: d.time });
    d.site = null;
  };

  /* --------------------------------------------------------- store changes */
  useEffect(() => {
    const sync = () => {
      const state = store.getState();
      if (state.mode !== d.mode) {
        d.mode = state.mode;
        if (state.mode === 'explore') {
          const lm = landmarkById(state.missionId);
          if (lm) {
            enterSite(lm);
            fly('landmark', 0.9);
          }
          d.follow = state.follow;
          beginTransition(EXPLORE.camera.enterSeconds);
        } else {
          leaveSite();
          beginTransition(EXPLORE.camera.exitSeconds);
        }
      } else if (state.mode === 'explore' && state.follow !== d.follow) {
        d.follow = state.follow;
        d.orbit = { az: 0, el: 0, zoom: 1 };
        beginTransition(EXPLORE.camera.switchSeconds);
      }
      if (state.view.token !== d.viewToken) {
        d.viewToken = state.view.token;
        fly(state.view.kind);
      }
    };
    // A deep link straight into exploration starts with the site already built
    const initial = store.getState();
    if (initial.mode === 'explore' && !d.site) {
      const lm = landmarkById(initial.missionId);
      if (lm) {
        d.pose.pos.set(0, 0, d.view.dist);
        enterSite(lm);
        beginTransition(EXPLORE.camera.enterSeconds);
      }
    } else if (initial.mode === 'globe' && !initial.selectedId) {
      fly('overview', reducedRef.current ? 0 : 2.2); // a gentle push-in on arrival
    }
    const unsubscribe = store.subscribe(sync);
    return () => {
      unsubscribe();
      gsap.killTweensOf(d.view);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, d]);

  /* ------------------------------------------------------------ interaction */
  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map();
    let gesture = null; // { x, y, t, moved, pinch }
    const now = () => performance.now() / 1000;

    const local = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const zoomGlobe = (factor) => {
      gsap.killTweensOf(d.view, 'dist');
      const alt = clamp((d.view.dist - 1) * factor, EXPLORE.globe.minDistance - 1, EXPLORE.globe.maxDistance - 1);
      d.view.dist = 1 + alt;
    };
    const zoomSite = (factor) => {
      d.orbit.zoom = clamp(d.orbit.zoom * factor, 0.35, 2.6);
    };

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) gesture = { x: p.x, y: p.y, t: now(), moved: false, pinch: 0, lastX: p.x, lastY: p.y, lastT: now() };
      else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gesture = { ...(gesture || {}), moved: true, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
      }
      d.lastInteraction = d.time;
    };

    const onMove = (e) => {
      const p = local(e);
      // Any pointer activity holds the idle drift, so markers never slide out from under the cursor
      d.lastInteraction = d.time;
      if (!pointers.has(e.pointerId)) {
        // Hover (mouse only)
        if (e.pointerType === 'mouse' && d.mode === 'globe') {
          d.hovered = markers.pick(p.x, p.y, EXPLORE.markers.pickRadiusPx);
          el.style.cursor = d.hovered >= 0 ? 'pointer' : 'grab';
        }
        return;
      }
      pointers.set(e.pointerId, p);
      if (!gesture) return;
      d.lastInteraction = d.time;

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (gesture.pinch > 0 && dist > 0) {
          const factor = gesture.pinch / dist;
          if (d.mode === 'globe') zoomGlobe(factor);
          else zoomSite(factor);
        }
        gesture.pinch = dist;
        return;
      }

      const dx = p.x - gesture.lastX;
      const dy = p.y - gesture.lastY;
      if (!gesture.moved && Math.hypot(p.x - gesture.x, p.y - gesture.y) > 5) {
        gesture.moved = true;
        if (d.mode === 'globe') gsap.killTweensOf(d.view);
        el.style.cursor = 'grabbing';
        d.hovered = -1;
      }
      if (gesture.moved) {
        const t = now();
        const dt = Math.max(1e-3, t - gesture.lastT);
        if (d.mode === 'globe') {
          // Degrees per pixel at the centre of the view, so the surface tracks the pointer
          const degPerPx = ((2 * (d.view.dist - 1) * TAN_HALF_FOV) / el.clientHeight) * (180 / Math.PI);
          const lonStep = (-dx * degPerPx) / Math.max(0.2, Math.cos(d.view.lat * D2R));
          const latStep = dy * degPerPx;
          d.view.lon += lonStep;
          d.view.lat = clamp(d.view.lat + latStep, -EXPLORE.globe.maxDragLat, EXPLORE.globe.maxDragLat);
          d.velocity.lon = lonStep / dt;
          d.velocity.lat = latStep / dt;
        } else {
          d.orbit.az -= dx * 0.006;
          d.orbit.el += dy * 0.004;
        }
        gesture.lastT = t;
      }
      gesture.lastX = p.x;
      gesture.lastY = p.y;
    };

    const onUp = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      el.releasePointerCapture?.(e.pointerId);
      if (pointers.size > 0) return;
      const g = gesture;
      gesture = null;
      el.style.cursor = d.hovered >= 0 ? 'pointer' : 'grab';
      if (!g) return;
      if (!g.moved && now() - g.t < 0.6 && d.mode === 'globe') {
        const p = local(e);
        const radius = e.pointerType === 'mouse' ? EXPLORE.markers.pickRadiusPx : EXPLORE.markers.pickRadiusTouchPx;
        const hit = markers.pick(p.x, p.y, radius);
        if (hit >= 0) store.select(markers.items[hit].landmark.id);
      }
      // Let a quick fling coast, but not a slow drag that stopped
      if (now() - g.lastT > 0.08) d.velocity.lat = d.velocity.lon = 0;
    };

    const onLeave = () => {
      d.hovered = -1;
    };

    const onWheel = (e) => {
      e.preventDefault();
      d.lastInteraction = d.time;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(clamp(delta, -120, 120) * 0.0022);
      if (d.mode === 'globe') zoomGlobe(factor);
      else zoomSite(factor);
    };

    const onKey = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (d.mode !== 'globe') return;
      const stepDeg = clamp((d.view.dist - 1) * 14, 3, 30);
      let handled = true;
      if (e.key === 'ArrowLeft') d.view.lon -= stepDeg;
      else if (e.key === 'ArrowRight') d.view.lon += stepDeg;
      else if (e.key === 'ArrowUp') d.view.lat = clamp(d.view.lat + stepDeg, -EXPLORE.globe.maxDragLat, EXPLORE.globe.maxDragLat);
      else if (e.key === 'ArrowDown') d.view.lat = clamp(d.view.lat - stepDeg, -EXPLORE.globe.maxDragLat, EXPLORE.globe.maxDragLat);
      else if (e.key === '+' || e.key === '=') store.zoomBy(1);
      else if (e.key === '-' || e.key === '_') store.zoomBy(-1);
      else handled = false;
      if (handled) {
        if (e.key.startsWith('Arrow')) gsap.killTweensOf(d.view);
        d.lastInteraction = d.time;
        e.preventDefault();
      }
    };

    el.style.cursor = 'grab';
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [gl, d, markers, store]);

  /* ---------------------------------------------------------------- cleanup */
  useEffect(
    () => () => {
      d.abort?.abort();
      if (d.site) disposeSite(d.site);
      d.leaving.forEach(({ site }) => disposeSite(site));
      // Forget them too: React's development double-mount runs this and then keeps the scene,
      // and the store effect rebuilds a mission site only when none is set
      d.site = null;
      d.leaving = [];
      markers.dispose();
      astronaut.dispose();
      detailTexture.dispose();
      mars.material.dispose();
      atmosphere.material.dispose();
      stars.material.dispose();
      starGeometry.dispose();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /* ============================================================ render loop */
  const tmp = useMemo(
    () => ({
      q: new THREE.Quaternion(),
      v: new THREE.Vector3(),
      w: new THREE.Vector3(),
      sunLocal: new THREE.Vector3(),
      siteQuat: new THREE.Quaternion(),
    }),
    []
  );

  useFrame(({ size, clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20); // visual smoothing: a dropped frame never jolts the camera
    // Mission progress runs on real elapsed time so walking speed never depends on frame rate;
    // the cap only stops a long-backgrounded tab from skipping a whole leg in one frame
    const simDt = Math.min(rawDelta, 0.25);
    d.time = clock.getElapsedTime();
    const state = store.getState();
    const runtime = store.runtime;
    const reduced = reducedRef.current;
    const { view } = d;
    const planet = planetRef.current;

    /* 1. Globe orientation: zoom requests, drift, inertia */
    if (runtime.zoomSteps !== 0) {
      const steps = runtime.zoomSteps;
      runtime.zoomSteps = 0;
      if (d.mode === 'globe') {
        const alt = clamp((view.dist - 1) * Math.exp(-steps * 0.55), EXPLORE.globe.minDistance - 1, EXPLORE.globe.maxDistance - 1);
        gsap.killTweensOf(view, 'dist');
        if (reduced) view.dist = 1 + alt;
        else gsap.to(view, { dist: 1 + alt, duration: 0.5, ease: 'power2.out' });
      } else {
        d.orbit.zoom = clamp(d.orbit.zoom * Math.exp(-steps * 0.45), 0.35, 2.6);
      }
      d.lastInteraction = d.time;
    }

    if (d.mode === 'globe') {
      const coasting = Math.abs(d.velocity.lat) + Math.abs(d.velocity.lon) > 0.01;
      if (coasting && !reduced) {
        view.lon += d.velocity.lon * dt;
        view.lat = clamp(view.lat + d.velocity.lat * dt, -EXPLORE.globe.maxDragLat, EXPLORE.globe.maxDragLat);
        const decay = Math.exp(-dt * 3.2);
        d.velocity.lat *= decay;
        d.velocity.lon *= decay;
      } else {
        d.velocity.lat = d.velocity.lon = 0;
      }
      const idle = d.time - d.lastInteraction > EXPLORE.globe.autoSpinDelay;
      if (idle && !state.selectedId && !reduced && !gsap.isTweening(view)) view.lon += EXPLORE.globe.autoSpin * dt;
    }
    if (view.lon > 540 || view.lon < -540) view.lon = toLon180(view.lon);

    orientationFor(view.lat, view.lon, planet.quaternion);
    planet.updateMatrixWorld(true);

    /* 2. Mission progress */
    const site = d.site;
    let walking = false;
    if (site && state.mode === 'explore' && state.missionId === site.landmarkId) {
      d.siteAppear = Math.min(1, Math.max(0, (d.time - d.siteBorn - 0.9) / 0.7));
      if (state.status === 'walking') {
        walking = true;
        const target = site.route.checkpointKm[Math.min(state.reached, site.route.checkpointKm.length - 1)];
        const speed = EXPLORE.astronaut.speedKmS * (state.hurry ? EXPLORE.astronaut.hurryFactor : 1);
        runtime.distanceKm = Math.min(target, runtime.distanceKm + speed * simDt);
        runtime.walkingMs += simDt * 1000;
        if (runtime.distanceKm >= target - 1e-4) {
          store.arrive(state.reached);
          walking = false;
        }
      }
    }

    /* 3. Camera */
    site?.group.getWorldQuaternion(tmp.siteQuat);
    const desired = d.desired;
    if (d.mode === 'explore' && site) {
      const yawTarget = site.astronautYaw + Math.PI;
      d.camYaw += Math.atan2(Math.sin(yawTarget - d.camYaw), Math.cos(yawTarget - d.camYaw)) * damp(1.6, dt);
      const cfg = d.follow ? EXPLORE.camera.follow : EXPLORE.camera.overview;
      const anchor = tmp.v;
      if (d.follow) anchor.copy(site.astronautPosition).add(tmp.w.set(0, 0, EXPLORE.astronaut.heightKm * 0.45));
      else anchor.set(0, 0, groundZ(0, 0));
      const az = (d.follow ? d.camYaw : -Math.PI / 2) + d.orbit.az;
      const el = clamp(cfg.elevationDeg * D2R + d.orbit.el, EXPLORE.camera.minElevationDeg * D2R, EXPLORE.camera.maxElevationDeg * D2R);
      d.orbit.el = el - cfg.elevationDeg * D2R;
      const dist = cfg.distanceKm * d.orbit.zoom;
      desired.target.copy(anchor);
      desired.pos.set(anchor.x + dist * Math.cos(el) * Math.cos(az), anchor.y + dist * Math.cos(el) * Math.sin(az), anchor.z + dist * Math.sin(el));
      site.group.localToWorld(desired.target);
      site.group.localToWorld(desired.pos);
      desired.up.set(0, 0, 1).applyQuaternion(tmp.siteQuat).normalize();
    } else {
      desired.pos.set(0, 0, view.dist);
      desired.target.set(0, 0, 0);
      desired.up.set(0, 1, 0);
    }

    const pose = d.pose;
    if (d.transition) {
      const p = clamp((d.time - d.transition.start) / d.transition.duration, 0, 1);
      blendPose(d.from, desired, easeInOut(p), pose);
      if (p >= 1) d.transition = null;
    } else if (d.mode === 'explore') {
      pose.pos.lerp(desired.pos, damp(3.2, dt));
      pose.target.lerp(desired.target, damp(5, dt));
      pose.up.lerp(desired.up, damp(4, dt)).normalize();
    } else {
      copyPose(pose, desired);
    }
    camera.position.copy(pose.pos);
    camera.up.copy(pose.up);
    camera.lookAt(pose.target);
    const altitude = Math.max(1e-6, pose.pos.length() - 1);
    camera.near = clamp(altitude * 0.25, 2e-6, 0.08);
    camera.far = 260;

    // Keep the selected landmark clear of the info panel by shifting the view, not the planet
    const wantX = d.mode === 'globe' && state.selectedId ? runtime.insets.right / 2 : 0;
    const wantY = d.mode === 'globe' && state.selectedId ? runtime.insets.bottom / 2 : 0;
    d.shift.x += (wantX - d.shift.x) * damp(reduced ? 30 : 4, dt);
    d.shift.y += (wantY - d.shift.y) * damp(reduced ? 30 : 4, dt);
    if (Math.abs(d.shift.x) + Math.abs(d.shift.y) > 0.5) {
      camera.setViewOffset(size.width, size.height, d.shift.x, d.shift.y, size.width, size.height);
    } else if (camera.view?.enabled) {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    /* 4. Lighting and atmosphere */
    sunRef.current.position.copy(SUN).multiplyScalar(10);
    mars.uniforms.uLight.value = 1;
    mars.uniforms.uSunDirView.value.copy(SUN).transformDirection(camera.matrixWorldInverse);
    const nearSurface = THREE.MathUtils.smoothstep(altitude, 0.004, 0.25);
    atmosphere.uniforms.uLight.value = 0.2 + 0.8 * nearSurface;
    stars.uniforms.uTime.value = d.time;
    stars.uniforms.uOpacity.value = 0.55 + 0.45 * nearSurface;

    /* 5. Markers */
    d.presence += ((d.mode === 'globe' ? 1 : 0) - d.presence) * damp(d.mode === 'globe' ? 3 : 8, dt);
    if (d.mode !== 'globe') d.hovered = -1;
    markers.update({
      camera,
      width: size.width,
      height: size.height,
      time: d.time,
      dt,
      hoveredIndex: d.hovered,
      selectedId: state.selectedId,
      presence: d.presence,
      reducedMotion: reduced,
    });

    const hoverEl = labels.hover.current;
    if (hoverEl) {
      const it = markers.items[d.hovered];
      if (it && it.landmark.id !== state.selectedId) {
        if (d.hoverName !== it.landmark.id) {
          d.hoverName = it.landmark.id;
          hoverEl.querySelector('.bt-tag__name').textContent = it.landmark.name;
          hoverEl.querySelector('.bt-tag__meta').textContent = it.landmark.category;
        }
        hoverEl.style.transform = `translate3d(${it.screen.x}px, ${it.screen.y}px, 0)`;
        hoverEl.style.opacity = String(it.visible);
      } else {
        hoverEl.style.opacity = '0';
      }
    }
    const selectedEl = labels.selected.current;
    if (selectedEl) {
      const it = markers.items.find((m) => m.landmark.id === state.selectedId);
      if (it) {
        selectedEl.style.transform = `translate3d(${it.screen.x}px, ${it.screen.y}px, 0)`;
        selectedEl.style.opacity = String(it.visible);
      } else {
        selectedEl.style.opacity = '0';
      }
    }

    /* 6. Site visuals and labels */
    tmp.sunLocal.copy(SUN).applyQuaternion(tmp.q.copy(tmp.siteQuat).invert());
    const cameraDistanceKm = site ? pose.pos.distanceTo(tmp.w.copy(site.astronautPosition).applyMatrix4(site.group.matrixWorld)) * MARS_RADIUS_KM : 100;
    if (site) {
      site.update({
        time: d.time,
        dt,
        distanceKm: runtime.distanceKm,
        reached: state.reached,
        walking,
        hurry: state.hurry,
        presence: 1,
        appear: d.siteAppear,
        cameraDistanceKm,
        sunLocal: tmp.sunLocal,
        reducedMotion: reduced,
      });
    }
    d.leaving = d.leaving.filter((l) => {
      const fade = 1 - clamp((d.time - l.start) / 1.2, 0, 1);
      l.site.update({
        time: d.time,
        dt,
        distanceKm: runtime.distanceKm,
        reached: 0,
        walking: false,
        hurry: false,
        presence: fade,
        appear: 1,
        cameraDistanceKm: 200,
        sunLocal: tmp.sunLocal,
        reducedMotion: reduced,
      });
      if (fade <= 0) {
        disposeSite(l.site);
        return false;
      }
      return true;
    });

    const cpEl = labels.checkpoints.current;
    if (cpEl) {
      const show = site && d.mode === 'explore' && !d.transition;
      Array.from(cpEl.children).forEach((child, i) => {
        const b = site?.beacons[i];
        if (!show || !b) {
          child.style.opacity = '0';
          return;
        }
        tmp.v.set(b.x, b.y, b.z + (b.last ? 18 : 12) * Math.max(1, cameraDistanceKm / 70) * 0.6);
        site.group.localToWorld(tmp.v);
        tmp.v.project(camera);
        if (tmp.v.z > 1 || Math.abs(tmp.v.x) > 1.2 || Math.abs(tmp.v.y) > 1.2) {
          child.style.opacity = '0';
          return;
        }
        child.style.transform = `translate3d(${((tmp.v.x + 1) / 2) * size.width}px, ${((1 - tmp.v.y) / 2) * size.height}px, 0)`;
        child.style.opacity = '1';
      });
    }

    const progressEl = labels.progress.current;
    if (progressEl && runtime.routeKm > 0) progressEl.style.transform = `scaleX(${clamp(runtime.distanceKm / runtime.routeKm, 0, 1)})`;

    // Tell the page once the first real frame is on screen
    if (!d.ready) {
      d.ready = true;
      requestAnimationFrame(() => onReady?.());
    }
  });

  return (
    <>
      <directionalLight ref={sunRef} color={INTRO.colors.sun} intensity={3.4} />
      <ambientLight color={INTRO.colors.fill} intensity={0.35} />
      {/* Warm sky and dusty ground fill, so the astronaut never turns into a silhouette */}
      <hemisphereLight args={['#ffe6d2', '#4a2a1e', 1.1]} />
      <points geometry={starGeometry} material={stars.material} renderOrder={-1} />
      <group ref={planetRef}>
        <mesh material={mars.material}>
          <sphereGeometry args={[INTRO.planet.radius, INTRO.planet.segments, INTRO.planet.segments / 2]} />
        </mesh>
        <primitive object={markers.object} />
      </group>
      <mesh material={atmosphere.material} scale={atmosphere.uniforms.uShell.value} renderOrder={1}>
        <sphereGeometry args={[INTRO.planet.radius, 96, 48]} />
      </mesh>
    </>
  );
}

export default function ExplorerCanvas({ store, labels, reducedMotion = false, onReady, onError }) {
  return (
    <SceneBoundary onError={onError}>
      <Canvas
        className="bt-explorer__canvas"
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.01, far: 260, position: [0, 0, 5] }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(INTRO.colors.space, 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onError?.(new Error('WebGL context lost'));
          });
        }}
      >
        <SceneBoundary onError={onError}>
          <Suspense fallback={null}>
            <ExplorerScene store={store} labels={labels} reducedMotion={reducedMotion} onReady={onReady} />
          </Suspense>
        </SceneBoundary>
      </Canvas>
    </SceneBoundary>
  );
}
