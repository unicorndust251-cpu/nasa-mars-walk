import { useEffect, useState } from 'react';
import { useMarsMap } from './MarsMapContext';
import { TREK_HOME, visibleLayers } from './marsTrek';

/** Credits only the Mars Trek products that are actually on screen. */
export default function MapAttribution() {
  const { map } = useMarsMap();
  const [credits, setCredits] = useState<string[]>([]);

  useEffect(() => {
    if (!map) {
      setCredits([]);
      return undefined;
    }

    const update = () => {
      try {
        setCredits(visibleLayers(map).map((d) => d.credit));
      } catch {
        setCredits([]);
      }
    };

    update();
    map.on('moveend zoomend', update);
    return () => {
      map.off('moveend zoomend', update);
    };
  }, [map]);

  return (
    <p className="bt-map-attribution">
      <a href={TREK_HOME} target="_blank" rel="noreferrer">
        NASA Mars Trek
      </a>
      {credits.length > 0 && <span className="bt-map-attribution__credits"> · {credits.join(' · ')}</span>}
    </p>
  );
}
