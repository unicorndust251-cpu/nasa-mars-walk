import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { INTRO } from './introConfig.js';
import { createAnimState, createIntroTimeline } from './introTimeline.js';
import { prefersReducedMotion, waitForTitleFont, webglAvailable } from './introEnv.js';
import { useTitleFit } from './useTitleFit.js';
import './intro.css';

// The 3D bundle (three + R3F) loads in parallel with the map instead of blocking it
const IntroCanvas = lazy(() => import('./IntroCanvas.jsx'));

/** Catches a failed download of the 3D chunk itself (offline, blocked CDN). */
class ChunkBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    this.props.onError?.(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function pickMode() {
  if (!webglAvailable()) return 'typeOnly';
  return prefersReducedMotion() ? 'reduced' : 'full';
}

/**
 * Full-screen cinematic intro. Sits above the Mars map (already mounted underneath and
 * loading its tiles), plays once, descends toward Jezero, hands the descent over to the
 * map through onHandoff, then crossfades away and unmounts.
 */
export default function BeyondTerraIntro({ onExitStart, onHandoff, onDone }) {
  const [mode, setMode] = useState(pickMode);
  const [fontReady, setFontReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(mode === 'typeOnly');
  const [loadingVisible, setLoadingVisible] = useState(false);

  const anim = useRef(createAnimState()).current;
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const titleRef = useRef(null);
  const timelineRef = useRef(null);
  const doneRef = useRef(false);
  const handedOffRef = useRef(false);

  const titleSize = useTitleFit(fontReady);

  const done = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [onDone]);

  // The map must always get its cue exactly once, whichever way the intro ends
  const handoff = useCallback(
    (info) => {
      if (handedOffRef.current) return;
      handedOffRef.current = true;
      onHandoff?.(info);
    },
    [onHandoff]
  );

  /** Leave before the timeline has started (still loading, or 3D failed early). */
  const bailOut = useCallback(() => {
    if (doneRef.current) return;
    onExitStart?.();
    handoff({ reason: 'timeout', mode });
    gsap.to(rootRef.current, { opacity: 0, duration: INTRO.timing.skipExit, ease: 'power1.inOut', onComplete: done });
    window.setTimeout(done, (INTRO.timing.skipExit + 0.6) * 1000);
  }, [done, handoff, mode, onExitStart]);

  const skip = useCallback(() => {
    if (timelineRef.current) timelineRef.current.skip();
    else bailOut();
  }, [bailOut]);

  const handleSceneError = useCallback(() => {
    if (timelineRef.current) timelineRef.current.skip();
    else setMode('typeOnly'); // no planet, but still a graceful typographic hand-off
    setSceneReady(true);
  }, []);

  // Fonts: wait briefly for Exo 2 so the title never reflows mid-animation
  useEffect(() => {
    let alive = true;
    waitForTitleFont().then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Only show a loading hint if assets are genuinely slow; give up entirely after a cap
  useEffect(() => {
    const hint = setTimeout(() => !timelineRef.current && setLoadingVisible(true), 600);
    const cap = setTimeout(() => !timelineRef.current && bailOut(), INTRO.timing.loadTimeout * 1000);
    return () => {
      clearTimeout(hint);
      clearTimeout(cap);
    };
  }, [bailOut]);

  // Start the sequence once the first 3D frame is on screen and the font is in
  useLayoutEffect(() => {
    if (timelineRef.current || doneRef.current || !fontReady || !sceneReady) return;
    setLoadingVisible(false);
    const tl = createIntroTimeline({
      anim,
      root: rootRef.current,
      stage: stageRef.current,
      title: titleRef.current,
      mode,
      onExitStart,
      onHandoff: handoff,
      onComplete: done,
    });
    timelineRef.current = tl;
    tl.play();
  }, [anim, done, fontReady, handoff, mode, onExitStart, sceneReady]);

  // Kill on unmount; clearing the ref lets React StrictMode's dev remount rebuild it cleanly
  useEffect(
    () => () => {
      timelineRef.current?.kill();
      timelineRef.current = null;
    },
    []
  );

  // Skip: click / tap anywhere, or Enter (also Space and Escape)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  // Lock page scroll while the intro covers it
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = 'hidden';
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="bt-intro"
      role="dialog"
      aria-modal="true"
      aria-label="Beyond Terra introduction"
      tabIndex={-1}
      onPointerDown={skip}
    >
      <div ref={stageRef} className="bt-intro__stage">
        {mode !== 'typeOnly' && (
          <ChunkBoundary onError={handleSceneError}>
            <Suspense fallback={null}>
              <IntroCanvas anim={anim} onReady={() => setSceneReady(true)} onError={handleSceneError} />
            </Suspense>
          </ChunkBoundary>
        )}
        <div className="bt-intro__vignette" aria-hidden="true" />
      </div>

      <div className="bt-intro__title-wrap">
        <h1 ref={titleRef} className="bt-intro__title" style={{ fontSize: `${titleSize}px` }}>
          {INTRO.title.text}
        </h1>
      </div>

      <div className={`bt-intro__loading${loadingVisible ? ' is-visible' : ''}`} aria-hidden="true" />
      <p className="bt-visually-hidden">Press Enter or tap to skip the introduction.</p>
    </div>
  );
}
