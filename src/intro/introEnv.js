import { INTRO } from './introConfig.js';

// Browser-environment checks for the intro. Every storage access is guarded:
// private windows and locked-down embeds can throw on sessionStorage.

function safeSession(fn, fallback) {
  try {
    return fn(window.sessionStorage);
  } catch {
    return fallback;
  }
}

/** Show the intro once per browsing session. `?intro` in the URL forces a replay. */
export function shouldPlayIntro() {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).has('intro')) return true;
  } catch {
    /* ignore */
  }
  return safeSession((s) => s.getItem(INTRO.sessionKey) !== '1', true);
}

export function markIntroPlayed() {
  safeSession((s) => s.setItem(INTRO.sessionKey, '1'));
}

export function clearIntroPlayed() {
  safeSession((s) => s.removeItem(INTRO.sessionKey));
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** True when a WebGL context can actually be created (not just when the API exists). */
export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Resolve once the title face is ready, without ever blocking for long. */
export function waitForTitleFont(timeoutMs = 1200) {
  if (!document.fonts?.load) return Promise.resolve();
  const load = Promise.all([
    document.fonts.load(`800 100px "Exo 2"`, INTRO.title.text),
    document.fonts.ready,
  ]).catch(() => {});
  const timeout = new Promise((r) => setTimeout(r, timeoutMs));
  return Promise.race([load, timeout]);
}
