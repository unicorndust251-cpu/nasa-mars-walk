import { useEffect, useRef, type RefObject } from 'react';
import { landmarkById } from './landmarks';
import { useExplorer, type ExplorerStore } from './explorerStore';
import { Icon } from './icons';

interface MissionHudProps {
  store: ExplorerStore;
  progressRef: RefObject<HTMLDivElement>;
}

function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

/** Everything on screen during an astronaut mission: status, progress, controls, checkpoint cards. */
export default function MissionHud({ store, progressRef }: MissionHudProps) {
  const missionId = useExplorer(store, (s) => s.missionId);
  const status = useExplorer(store, (s) => s.status);
  const reached = useExplorer(store, (s) => s.reached);
  const card = useExplorer(store, (s) => s.card);
  const follow = useExplorer(store, (s) => s.follow);
  const imagery = useExplorer(store, (s) => s.imagery);
  const hurry = useExplorer(store, (s) => s.hurry);
  const summary = useExplorer(store, (s) => s.summary);
  const landmark = landmarkById(missionId);
  const completeRef = useRef<HTMLDivElement>(null);

  // Keyboard: Space starts / pauses / resumes, N skips ahead, Escape leaves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Escape') {
        // Marked handled so the explorer doesn't also treat it as "deselect"
        e.preventDefault();
        store.exitExploration();
        return;
      }
      // On a focused button, Space and N belong to the button
      if (t && /^(BUTTON|A)$/.test(t.tagName)) return;
      const s = store.getState();
      if (e.key === ' ') {
        e.preventDefault();
        if (s.status === 'idle') store.start();
        else if (s.status === 'walking') store.pause();
        else if (s.status === 'paused') store.resume();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        store.nextCheckpoint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  // Bring keyboard focus to the result when the mission ends
  useEffect(() => {
    if (status === 'completed') completeRef.current?.focus({ preventScroll: true });
  }, [status]);

  if (!landmark) return null;
  const total = landmark.checkpoints.length;
  const checkpoint = card !== null ? landmark.checkpoints[card] : null;

  const statusText =
    status === 'idle'
      ? 'Ready at the start point'
      : status === 'walking'
        ? hurry
          ? `Fast-forwarding to checkpoint ${reached + 1}`
          : `Walking to checkpoint ${reached + 1}`
        : status === 'paused'
          ? card !== null
            ? 'Checkpoint reached'
            : 'Paused'
          : 'Mission complete';

  return (
    <>
      <section className="bt-hud" aria-label={`Exploration mission: ${landmark.name}`}>
        <p className="bt-hud__badge" title="Routes are simulated, not surveyed traverses. The astronaut is drawn far larger than life so you can follow it.">
          Simulated route · not to scale
        </p>
        <h2 className="bt-hud__title">{landmark.name}</h2>
        <p className="bt-hud__status" aria-live="polite">
          {statusText}
        </p>
        <div className="bt-hud__progress">
          <div className="bt-hud__bar" aria-hidden="true">
            <div ref={progressRef} className="bt-hud__fill" />
          </div>
          <span className="bt-hud__count">
            {reached} / {total} checkpoints
          </span>
        </div>
        <ol className="bt-hud__steps" aria-label="Checkpoints">
          {landmark.checkpoints.map((c, i) => (
            <li key={c.name} className={i < reached ? 'is-done' : i === reached && status !== 'completed' ? 'is-next' : ''}>
              <span className="bt-hud__step-dot" aria-hidden="true">
                {i < reached ? <Icon name="check" /> : i + 1}
              </span>
              <span>{c.name}</span>
              <span className="bt-visually-hidden">{i < reached ? ' (reached)' : ''}</span>
            </li>
          ))}
        </ol>
        {imagery === 'loading' && <p className="bt-hud__note">Loading NASA Viking imagery of the site…</p>}
        {imagery === 'fallback' && <p className="bt-hud__note">Detailed imagery unavailable. Showing the global texture.</p>}
      </section>

      {checkpoint && card !== null && (
        <div className="bt-card bt-card--checkpoint" role="status">
          <p className="bt-card__kicker">Checkpoint reached</p>
          <p className="bt-card__meta">
            Checkpoint {card + 1} of {total}
          </p>
          <h3 className="bt-card__title">{checkpoint.name}</h3>
          <p className="bt-card__body">{checkpoint.fact}</p>
          <button type="button" className="bt-btn bt-btn--primary" onClick={() => store.resume()}>
            <Icon name="resume" /> Continue to checkpoint {card + 2}
          </button>
        </div>
      )}

      {status === 'completed' && summary && (
        <div ref={completeRef} className="bt-card bt-card--complete" role="status" tabIndex={-1}>
          <p className="bt-card__kicker bt-card__kicker--success">Mission complete — exploration successful</p>
          <h3 className="bt-card__title">{landmark.name}</h3>
          <p className="bt-card__body">{landmark.checkpoints[total - 1].fact}</p>
          <dl className="bt-card__summary">
            <div>
              <dt>Checkpoints</dt>
              <dd>
                {total} / {total}
              </dd>
            </div>
            <div>
              <dt>Route length</dt>
              <dd>{summary.routeKm.toFixed(0)} km</dd>
            </div>
            <div>
              <dt>Walking time</dt>
              <dd>{formatDuration(summary.walkingSeconds)}</dd>
            </div>
          </dl>
          <ul className="bt-card__visited">
            {summary.checkpoints.map((name) => (
              <li key={name}>
                <Icon name="check" /> {name}
              </li>
            ))}
          </ul>
          <p className="bt-card__fine">Simulated route across real NASA imagery; not a surveyed traverse.</p>
          <div className="bt-card__actions">
            <button type="button" className="bt-btn bt-btn--primary" onClick={() => store.restart()}>
              <Icon name="restart" /> Explore again
            </button>
            <button type="button" className="bt-btn" onClick={() => store.exitExploration()}>
              <Icon name="globe" /> Back to globe
            </button>
          </div>
        </div>
      )}

      <div className="bt-mission-controls" role="toolbar" aria-label="Exploration controls">
        <button type="button" className="bt-ctl bt-ctl--primary" onClick={() => store.start()} disabled={status !== 'idle'}>
          <Icon name="play" />
          <span>Start</span>
        </button>
        <button type="button" className="bt-ctl" onClick={() => store.pause()} disabled={status !== 'walking'}>
          <Icon name="pause" />
          <span>Pause</span>
        </button>
        <button type="button" className="bt-ctl" onClick={() => store.resume()} disabled={status !== 'paused'}>
          <Icon name="resume" />
          <span>Resume</span>
        </button>
        <button type="button" className="bt-ctl" onClick={() => store.nextCheckpoint()} disabled={status === 'completed'}>
          <Icon name="next" />
          <span>Next checkpoint</span>
        </button>
        <span className="bt-mission-controls__rule" aria-hidden="true" />
        <button type="button" className="bt-ctl" onClick={() => store.restart()}>
          <Icon name="restart" />
          <span>Restart</span>
        </button>
        <button type="button" className={`bt-ctl${follow ? ' is-on' : ''}`} onClick={() => store.toggleFollow()} aria-pressed={follow}>
          <Icon name="camera" />
          <span>Camera follow {follow ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" className="bt-ctl" onClick={() => store.exitExploration()}>
          <Icon name="exit" />
          <span>Exit</span>
        </button>
      </div>
    </>
  );
}
