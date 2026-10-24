import gsap from 'gsap';
import { INTRO } from './introConfig.js';

/**
 * Mutable animation state shared between GSAP (which writes it) and the
 * render loop (which reads it every frame). Plain numbers, no React state,
 * so tweening never causes a re-render.
 */
export function createAnimState() {
  return {
    light: 0, // sunlight + atmosphere intensity, 0 → 1
    stars: 0, // starfield opacity, 0 → 1
    push: 0, // camera approach, 0 = start distance, 1 = hero distance
    exit: 0, // descent toward the surface, 0 → 1
    align: 0, // turn the planet so Jezero Crater sits dead centre, 0 → 1
    spin: 0, // rotation speed multiplier; the timeline starts it, so loading time never shifts the planet
  };
}

/**
 * Builds the sequence.
 * mode: 'full'     — the cinematic 3D intro, ending in a descent onto Jezero
 *       'reduced'  — prefers-reduced-motion: static planet, gentle crossfades only
 *       'typeOnly' — 3D unavailable: title-only fade, then the map
 *
 * onHandoff fires exactly once, at the moment the map underneath should take over
 * (mid-descent, on skip, or when the 3D intro gives up). It receives { reason }.
 */
export function createIntroTimeline({ anim, root, stage, title, mode = 'full', onExitStart, onHandoff, onComplete }) {
  const T = INTRO.timing;
  let finished = false;
  let exiting = false;
  let handedOff = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onComplete?.();
  };
  const startExit = () => {
    if (exiting) return;
    exiting = true;
    onExitStart?.();
  };
  const handoff = (reason) => {
    if (handedOff) return;
    handedOff = true;
    onHandoff?.({ reason, mode });
  };

  // The map's descent runs on wall-clock time, so the intro must too: without this, GSAP's lag
  // smoothing stretches the timeline on slow devices and the two drift apart.
  gsap.ticker.lagSmoothing(0);

  const tl = gsap.timeline({ paused: true, onComplete: finish });

  if (mode === 'full') {
    Object.assign(anim, { light: 0, stars: 0, push: 0, exit: 0, align: 0, spin: 1 });
    gsap.set(title, { opacity: 0, y: 26, filter: 'blur(16px)', letterSpacing: '0.2em' });

    // 0.0–0.7 The reveal: sunlight sweeps in from darkness, stars surface after it
    tl.to(anim, { light: 1, duration: 1.15, ease: 'power2.inOut' }, T.reveal[0]);
    tl.to(anim, { stars: 1, duration: 1.4, ease: 'sine.out' }, 0.2);

    // 0.0–3.3 One continuous, decelerating camera push, still drifting during the hero hold
    tl.to(anim, { push: 1, duration: T.exit[0], ease: 'power2.out' }, 0);

    // 1.5–2.3 Title: fade, rise, blur-to-sharp, tracking settles to 0.12em
    tl.to(
      title,
      { opacity: 1, y: 0, filter: 'blur(0px)', letterSpacing: '0.12em', duration: T.title[1] - T.title[0], ease: 'power3.out' },
      T.title[0]
    );

    // 3.3 → The title lifts away and the camera descends toward Jezero
    const [d0, d1] = T.descent;
    tl.call(startExit, null, d0);
    tl.to(title, { opacity: 0, filter: 'blur(10px)', scale: 1.05, duration: 0.5, ease: 'power1.in' }, d0);
    tl.to(anim, { exit: 1, duration: d1 - d0, ease: 'power2.inOut' }, d0);
    tl.to(anim, { align: 1, duration: d1 - d0, ease: 'power2.inOut' }, d0);
    tl.to(anim, { stars: 0, duration: 0.6, ease: 'power1.in' }, d0 + 0.3);
    // Atmospheric entry: the globe softens just as the map underneath starts to sharpen
    tl.to(stage, { filter: 'blur(5px)', duration: 0.55, ease: 'power1.in' }, T.handoff - 0.3);

    // Handoff: the map, already sitting at the same scale beneath, takes over the descent
    tl.call(() => handoff('descent'), null, T.handoff);
    tl.to(root, { opacity: 0, duration: T.exit[1] - T.handoff, ease: 'power1.inOut' }, T.handoff);
  } else if (mode === 'reduced') {
    Object.assign(anim, { light: 1, stars: 1, push: 1, spin: 0, exit: 0, align: 0 });
    gsap.set(stage, { opacity: 0 });
    gsap.set(title, { opacity: 0 });
    tl.to(stage, { opacity: 1, duration: 0.6, ease: 'none' }, 0);
    tl.to(title, { opacity: 1, duration: 0.6, ease: 'none' }, 0.4);
    tl.call(startExit, null, 2.4);
    tl.call(() => handoff('reduced'), null, 2.4);
    tl.to(root, { opacity: 0, duration: 0.6, ease: 'none' }, 2.4);
  } else {
    gsap.set(title, { opacity: 0, filter: 'blur(10px)' });
    tl.to(title, { opacity: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power2.out' }, 0.2);
    tl.call(startExit, null, 1.8);
    tl.to(title, { opacity: 0, filter: 'blur(8px)', duration: 0.5, ease: 'power1.in' }, 1.8);
    tl.call(() => handoff('typeOnly'), null, 1.9);
    tl.to(root, { opacity: 0, duration: 0.7, ease: 'power1.inOut' }, 1.9);
  }

  /** Leave the intro early, always through a short crossfade, never a hard cut. */
  const skip = () => {
    if (finished) return;
    if (exiting && tl.isActive() && handedOff) {
      // Already handing over: just hurry the remaining fade along
      tl.timeScale(2.2);
      return;
    }
    tl.kill();
    startExit();
    handoff('skip');
    const d = INTRO.timing.skipExit;
    const out = gsap.timeline({ onComplete: finish });
    out.to(title, { opacity: 0, filter: 'blur(8px)', duration: d * 0.6, ease: 'power2.in' }, 0);
    if (mode === 'full') out.to(anim, { exit: Math.max(anim.exit, 0.6), align: 1, duration: d, ease: 'power2.in' }, 0);
    out.to(root, { opacity: 0, duration: d, ease: 'power1.inOut' }, 0.05);
    // Never leave the overlay up, even if frames stall
    window.setTimeout(finish, (d + 0.6) * 1000);
  };

  return {
    play: () => tl.play(0),
    skip,
    kill: () => {
      tl.kill();
      gsap.killTweensOf([anim, title, root, stage]);
    },
    timeline: tl,
  };
}
