import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExplorerCanvas from './ExplorerCanvas.jsx';
import { createExplorerStore, useExplorer } from './explorerStore';
import { landmarkById, type Landmark } from './landmarks';
import { writeGlobeHash, type GlobeRoute } from './globeRoute';
import { usePrefersReducedMotion } from '../map/usePrefersReducedMotion';
import LandmarkSearch from './LandmarkSearch';
import LandmarkPanel from './LandmarkPanel';
import MissionHud from './MissionHud';
import { Icon } from './icons';
import './explore.css';

export interface ExplorerProps {
  initial: GlobeRoute;
  onClose(): void;
  onViewOnMap(landmark: Landmark): void;
}

/**
 * The 3D globe explorer: 26 glowing landmarks on the rotating planet, an information panel
 * for each, and an astronaut exploration mission at every one of them.
 */
export default function Explorer({ initial, onClose, onViewOnMap }: ExplorerProps) {
  const [store] = useState(() => createExplorerStore({ selectedId: initial.landmarkId, explore: initial.explore }));
  const reducedMotion = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const hoverRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const checkpointsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(() => ({ hover: hoverRef, selected: selectedRef, checkpoints: checkpointsRef, progress: progressRef }), []);

  const selectedId = useExplorer(store, (s) => s.selectedId);
  const mode = useExplorer(store, (s) => s.mode);
  const missionId = useExplorer(store, (s) => s.missionId);
  const reached = useExplorer(store, (s) => s.reached);
  const selected = landmarkById(selectedId);
  const mission = landmarkById(missionId);

  // Keep the URL in step with what's on screen
  useEffect(() => {
    writeGlobeHash({ landmarkId: selectedId, explore: mode === 'explore' });
  }, [selectedId, mode]);

  // Escape steps back out: landmark → full globe (missions handle their own Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (store.getState().mode === 'globe' && store.getState().selectedId) store.resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  // Starting a mission moves focus to its controls, leaving it returns focus to the panel
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const target = mode === 'explore' ? root.querySelector<HTMLElement>('.bt-ctl--primary') : root.querySelector<HTMLElement>('.bt-panel .bt-btn--primary');
    if (document.activeElement && root.contains(document.activeElement) && document.activeElement !== document.body) target?.focus({ preventScroll: true });
  }, [mode]);

  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback(() => setFailed(true), []);

  return (
    <div ref={rootRef} className={`bt-explorer${ready ? ' is-ready' : ''}`} data-mode={mode} role="region" aria-label="3D Mars globe with famous landmarks">
      {!failed && (
        <div className="bt-explorer__stage">
          <ExplorerCanvas store={store} labels={labels} reducedMotion={reducedMotion} onReady={handleReady} onError={handleError} />
        </div>
      )}
      <div className="bt-explorer__vignette" aria-hidden="true" />

      {/* Labels the scene moves every frame */}
      <div className="bt-explorer__labels" aria-hidden="true">
        <div ref={hoverRef} className="bt-tag bt-tag--hover">
          <div className="bt-tag__inner">
            <span className="bt-tag__name" />
            <span className="bt-tag__meta" />
          </div>
        </div>
        <div ref={selectedRef} className="bt-tag bt-tag--selected" hidden={!selected || mode !== 'globe'}>
          <div className="bt-tag__inner">
            <span className="bt-tag__name">{selected?.name}</span>
          </div>
        </div>
        <div ref={checkpointsRef}>
          {mode === 'explore' &&
            mission?.checkpoints.map((c, i) => (
              <div key={c.name} className={`bt-tag bt-tag--checkpoint${i < reached ? ' is-done' : ''}`}>
                <div className="bt-tag__inner">
                  <span className="bt-tag__num">{i + 1}</span>
                  <span className="bt-tag__name">{c.name}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      <header className="bt-explorer__top">
        <button type="button" className="bt-btn bt-btn--ghost" onClick={onClose}>
          <Icon name="back" /> Map
        </button>
        {mode === 'globe' && <LandmarkSearch selectedId={selectedId} onSelect={(id) => store.select(id)} />}
      </header>

      {mode === 'globe' && selected && <LandmarkPanel key={selected.id} landmark={selected} store={store} onViewOnMap={onViewOnMap} />}

      {mode === 'globe' && (
        <>
          <div className={`bt-map-controls bt-globe-controls${selected ? ' has-panel' : ''}`} role="group" aria-label="Globe controls">
            <button type="button" className="bt-map-btn" onClick={() => store.zoomBy(1)} aria-label="Zoom in" title="Zoom in">
              <Icon name="plus" />
            </button>
            <button type="button" className="bt-map-btn" onClick={() => store.zoomBy(-1)} aria-label="Zoom out" title="Zoom out">
              <Icon name="minus" />
            </button>
            <span className="bt-map-controls__rule" aria-hidden="true" />
            <button type="button" className="bt-map-btn" onClick={() => store.resetView()} aria-label="Show the full globe" title="Full globe">
              <Icon name="globe" />
            </button>
          </div>
          <p className={`bt-explorer__hint${selected ? ' has-panel' : ''}`}>
            Drag to turn Mars · scroll or pinch to zoom · click a glowing landmark
          </p>
        </>
      )}

      {mode === 'explore' && <MissionHud store={store} progressRef={progressRef} />}

      {!ready && !failed && (
        <div className="bt-explorer__loading" role="status">
          <span className="bt-visually-hidden">Loading the 3D globe</span>
        </div>
      )}

      {failed && (
        <div className="bt-map__error" role="alert">
          <p className="bt-map__error-title">The 3D globe can’t start here</p>
          <p className="bt-map__error-body">This browser or device couldn’t create a 3D view. The NASA map still works.</p>
          <button type="button" className="bt-map__retry" onClick={onClose}>
            Back to the map
          </button>
        </div>
      )}
    </div>
  );
}
