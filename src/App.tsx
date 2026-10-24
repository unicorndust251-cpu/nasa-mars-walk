import { useCallback, useEffect, useRef, useState } from 'react';
import BeyondTerraIntro from './intro/BeyondTerraIntro.jsx';
import { markIntroPlayed, prefersReducedMotion, shouldPlayIntro, webglAvailable } from './intro/introEnv.js';
import { handoffMapZoom } from './intro/introConfig.js';
import { MarsMap, type MarsMapHandle } from './map';

type HandoffReason = 'descent' | 'skip' | 'timeout' | 'typeOnly' | 'reduced';

/** Seconds for the map's own descent into the orbital view of Jezero, by how the intro ended. */
const REVEAL_SECONDS: Record<HandoffReason, number> = {
  descent: 2.8, // continues the globe's fall: from ~1,700 km up down to the crater
  skip: 1.8,
  timeout: 1.8,
  typeOnly: 1.8,
  reduced: 0,
};

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
  const mapRef = useRef<MarsMapHandle>(null);

  // Mark as played as soon as it starts, so a reload mid-intro goes straight to the map
  useEffect(() => {
    if (showIntro) markIntroPlayed();
  }, [showIntro]);

  const handleHandoff = useCallback(({ reason }: { reason: HandoffReason }) => {
    mapRef.current?.reveal({ duration: REVEAL_SECONDS[reason] ?? 1.8 });
  }, []);

  const handleIntroDone = useCallback(() => {
    setShowIntro(false);
    // Keyboard users land on the map, ready to pan with the arrow keys
    mapRef.current?.getMap()?.getContainer().focus({ preventScroll: true });
  }, []);

  return (
    <>
      {/* The map is always mounted first, so it loads during the intro and can never be blocked by it */}
      <MarsMap
        ref={mapRef}
        startZoom={mapStart.startZoom}
        startLevelsAbove={mapStart.startLevelsAbove}
        awaitReveal={mapStart.awaitReveal}
      />
      {showIntro && <BeyondTerraIntro onHandoff={handleHandoff} onDone={handleIntroDone} />}
    </>
  );
}
