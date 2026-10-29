import { useLayoutEffect, useRef } from 'react';
import type { Landmark } from './landmarks';
import type { ExplorerStore } from './explorerStore';
import { formatLat, formatLon } from './geo';
import { Icon } from './icons';

const NARROW = '(max-width: 760px)';

interface LandmarkPanelProps {
  landmark: Landmark;
  store: ExplorerStore;
  onViewOnMap(landmark: Landmark): void;
  /** Use this landmark as the Mars Navigator's start or destination */
  onNavigate?(landmark: Landmark, role: 'start' | 'destination'): void;
}

/** Information about the selected landmark, with the way into its exploration mission. */
export default function LandmarkPanel({ landmark, store, onViewOnMap, onNavigate }: LandmarkPanelProps) {
  const ref = useRef<HTMLElement>(null);

  // Tell the scene how much room the panel takes, so the landmark stays in the clear
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const narrow = window.matchMedia(NARROW).matches;
      store.runtime.insets = narrow ? { right: 0, bottom: r.height } : { right: r.width + 16, bottom: 0 };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      store.runtime.insets = { right: 0, bottom: 0 };
    };
  }, [store]);

  const headingId = `bt-landmark-${landmark.id}`;

  return (
    <aside ref={ref} className="bt-panel" aria-labelledby={headingId}>
      <button type="button" className="bt-panel__close" onClick={() => store.resetView()} aria-label="Close and return to the full globe" title="Back to the full globe">
        <Icon name="close" />
      </button>

      <p className="bt-panel__eyebrow">{landmark.category}</p>
      <h2 id={headingId} className="bt-panel__title">
        {landmark.name}
      </h2>

      <dl className="bt-panel__coords">
        <div>
          <dt>Latitude</dt>
          <dd>{formatLat(landmark.lat)}</dd>
        </div>
        <div>
          <dt>Longitude</dt>
          <dd>{formatLon(landmark.lon)}</dd>
        </div>
      </dl>
      <p className="bt-panel__source">Feature centre, IAU/USGS Gazetteer of Planetary Nomenclature</p>

      <h3 className="bt-panel__subhead">Why it matters</h3>
      <p className="bt-panel__summary">{landmark.summary}</p>

      <div className="bt-panel__mission">
        <p className="bt-panel__mission-title">
          <Icon name="flag" /> Exploration mission
        </p>
        <p className="bt-panel__mission-body">
          {landmark.checkpoints.length} checkpoints on a simulated local route. The astronaut is shown larger than life so you can follow it.
        </p>
      </div>

      <div className="bt-panel__actions">
        <button type="button" className="bt-btn bt-btn--primary" onClick={() => store.startExploration()}>
          <Icon name="play" /> Start Exploration
        </button>
        <button type="button" className="bt-btn" onClick={() => onViewOnMap(landmark)}>
          <Icon name="map" /> View on NASA map
        </button>
      </div>
      {onNavigate && (
        <div className="bt-panel__actions bt-panel__actions--nav">
          <button type="button" className="bt-btn" onClick={() => onNavigate(landmark, 'start')}>
            <Icon name="pin" /> Navigate from here
          </button>
          <button type="button" className="bt-btn" onClick={() => onNavigate(landmark, 'destination')}>
            <Icon name="target" /> Navigate here
          </button>
        </div>
      )}
    </aside>
  );
}
