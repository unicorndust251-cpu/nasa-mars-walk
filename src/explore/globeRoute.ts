import { landmarkById } from './landmarks';

/**
 * The globe explorer lives in the URL hash, so views can be shared and survive a reload:
 *   #globe                       the whole planet
 *   #globe/olympus-mons          a landmark selected
 *   #globe/olympus-mons/explore  its astronaut mission
 */
export interface GlobeRoute {
  landmarkId: string | null;
  explore: boolean;
}

export function parseGlobeHash(hash: string = typeof window === 'undefined' ? '' : window.location.hash): GlobeRoute | null {
  const m = /^#globe(?:\/([a-z0-9-]+))?(\/explore)?\/?$/i.exec(hash);
  if (!m) return null;
  const landmark = landmarkById(m[1]?.toLowerCase());
  return { landmarkId: landmark?.id ?? null, explore: !!landmark && !!m[2] };
}

export function globeHash(route: GlobeRoute | null): string {
  if (!route) return '';
  if (!route.landmarkId) return '#globe';
  return `#globe/${route.landmarkId}${route.explore ? '/explore' : ''}`;
}

/** Replace the hash without adding history entries or scrolling. */
export function writeGlobeHash(route: GlobeRoute | null) {
  try {
    const hash = globeHash(route);
    if (window.location.hash === hash || (!hash && !window.location.hash)) return;
    const url = window.location.pathname + window.location.search + hash;
    window.history.replaceState(window.history.state, '', url);
  } catch {
    /* sandboxed frames can refuse history access; the explorer still works */
  }
}
