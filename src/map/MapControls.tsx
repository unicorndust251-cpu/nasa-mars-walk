import { useEffect, useState } from 'react';
import { useMarsMap } from './MarsMapContext';

/** Zoom in, zoom out and return to Jezero. Bottom-right, out of the terrain's way. */
export default function MapControls() {
  const { map, zoomBy, resetView } = useMarsMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);

  const atMax = zoom >= map.getMaxZoom() - 0.01;
  const atMin = zoom <= map.getMinZoom() + 0.01;

  return (
    <div className="bt-map-controls" role="group" aria-label="Map controls">
      <button type="button" className="bt-map-btn" onClick={() => zoomBy(1)} disabled={atMax} aria-label="Zoom in" title="Zoom in">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4.5v11M4.5 10h11" />
        </svg>
      </button>
      <button type="button" className="bt-map-btn" onClick={() => zoomBy(-1)} disabled={atMin} aria-label="Zoom out" title="Zoom out">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4.5 10h11" />
        </svg>
      </button>
      <span className="bt-map-controls__rule" aria-hidden="true" />
      <button
        type="button"
        className="bt-map-btn"
        onClick={resetView}
        aria-label="Return to Jezero Crater"
        title="Return to Jezero Crater"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="5.2" />
          <circle cx="10" cy="10" r="1.1" className="bt-fill" />
          <path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" />
        </svg>
      </button>
    </div>
  );
}
