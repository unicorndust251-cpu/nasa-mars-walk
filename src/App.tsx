import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import BeyondTerraIntro from './intro/BeyondTerraIntro.jsx';
import { markIntroPlayed, prefersReducedMotion, shouldPlayIntro, webglAvailable } from './intro/introEnv.js';
import { handoffMapZoom } from './intro/introConfig.js';
import { MarsMap, nearestWorldLng, type MarsMapHandle } from './map';
import GlobeEntry from './explore/GlobeEntry';
import { parseGlobeHash, writeGlobeHash, type GlobeRoute } from './explore/globeRoute';
import { toLon180 } from './explore/geo';
import type { Landmark } from './explore/landmarks';

// The 3D globe shares the intro's three.js chunk and loads only when opened
const Explorer = lazy(() => import('./explore/Explorer'));

type HandoffReason = 'descent' | 'skip' | 'timeout' | 'typeOnly' | 'reduced';

/** Seconds for the map's own descent into the orbital view of Jezero, by how the intro ended. */
const REVEAL_SECONDS: Record<HandoffReason, number> = {
  descent: 2.8, // continues the globe's fall: from ~1,700 km up down to the crater
  skip: 1.8,
  timeout: 1.8,
  typeOnly: 1.8,
  reduced: 0,
};

const KM_PER_DEGREE = 59.27; // on the Mars 2000 sphere

interface MapStart {
  startZoom?: number;
  startLevelsAbove: number;
  awaitReveal: boolean;
}

function planMapStart(introPlays: boolean): MapStart {
  if (!introPlays) return { startLevelsAbove: 0, awaitReveal: false };
  if (prefersReducedMotion()) return { startLevelsAbove: 0, awaitReveal: true };
  // The 3D descent ends at a known altitude; mount the map at the matching scale beneath it
  if (webglAvailable()) return { startZoom: handoffMapZoom(window.innerHeight), startLevelsAbove: 0, awaitReveal: true };
  return { startLevelsAbove: 1.5, awaitReveal: true };
}

export default function App() {
  const [showIntro, setShowIntro] = useState<boolean>(shouldPlayIntro);
  const [mapStart] = useState(() => planMapStart(showIntro));
  const [canGlobe] = useState(webglAvailable);
  const [globe, setGlobe] = useState<GlobeRoute | null>(() => (canGlobe ? parseGlobeHash() : null));
  const mapRef = useRef<MarsMapHandle>(null);

  // Mark as played as soon as it starts, so a reload mid-intro goes straight to the map
  useEffect(() => {
    if (showIntro) markIntroPlayed();
  }, [showIntro]);

  // Back/forward or an edited URL can open or close the globe
  useEffect(() => {
    if (!canGlobe) return undefined;
    const onHash = () => setGlobe(parseGlobeHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [canGlobe]);

  const handleHandoff = useCallback(({ reason }: { reason: HandoffReason }) => {
    mapRef.current?.reveal({ duration: REVEAL_SECONDS[reason] ?? 1.8 });
  }, []);

  const handleIntroDone = useCallback(() => {
    setShowIntro(false);
    // Keyboard users land on the map, ready to pan with the arrow keys (unless the globe is open)
    if (!parseGlobeHash()) mapRef.current?.getMap()?.getContainer().focus({ preventScroll: true });
  }, []);

  const openGlobe = useCallback(() => setGlobe({ landmarkId: null, explore: false }), []);

  const closeGlobe = useCallback(() => {
    setGlobe(null);
    writeGlobeHash(null);
    mapRef.current?.getMap()?.getContainer().focus({ preventScroll: true });
  }, []);

  /** Leave the globe and fly the NASA map to a landmark, framed to its size. */
  const viewOnMap = useCallback(
    (landmark: Landmark) => {
      closeGlobe();
      const map = mapRef.current?.getMap();
      if (!map) return;
      const lng = nearestWorldLng(toLon180(landmark.lon), map.getCenter().lng);
      const halfLat = Math.min(80, (landmark.diameterKm * 0.6) / KM_PER_DEGREE);
      const halfLng = Math.min(170, halfLat / Math.max(0.05, Math.cos((landmark.lat * Math.PI) / 180)));
      const bounds = L.latLngBounds(
        [Math.max(-90, landmark.lat - halfLat), lng - halfLng],
        [Math.min(90, landmark.lat + halfLat), lng + halfLng]
      );
      const zoom = Math.max(map.getMinZoom(), Math.min(9, map.getBoundsZoom(bounds, false, L.point(48, 48))));
      map.stop();
      if (prefersReducedMotion()) map.setView([landmark.lat, lng], zoom, { animate: false });
      else map.flyTo([landmark.lat, lng], zoom, { duration: 2.2, easeLinearity: 0.15 });
    },
    [closeGlobe]
  );

  return (
    <>
      {/* The map is always mounted first, so it loads during the intro and can never be blocked by it */}
      <MarsMap
        ref={mapRef}
        startZoom={mapStart.startZoom}
        startLevelsAbove={mapStart.startLevelsAbove}
        awaitReveal={mapStart.awaitReveal}
      >
        {canGlobe && !globe && <GlobeEntry onOpen={openGlobe} />}
      </MarsMap>
      {globe && (
        <Suspense fallback={<div className="bt-explorer-pending" aria-hidden="true" />}>
          <Explorer initial={globe} onClose={closeGlobe} onViewOnMap={viewOnMap} />
        </Suspense>
      )}
      {showIntro && <BeyondTerraIntro onHandoff={handleHandoff} onDone={handleIntroDone} />}
    </>
  );
}
