import { useMemo } from 'react';
import { discoverAlongRoute, discoveryCorridorKm, type Discovery } from '../core/discover.ts';
import { LOCATIONS, type MarsLocation } from '../core/locations.ts';
import { formatKm } from '../core/marsGeo.ts';
import type { RouteResult } from '../core/routePlanner.ts';
import type { NavStop } from './types.ts';

interface DiscoverAlongRouteProps {
  route: RouteResult;
  added: NavStop[];
  computing: boolean;
  onAdd(d: Discovery): void;
  onRemove(stop: NavStop): void;
  onRestore(): void;
  onShow(location: MarsLocation): void;
}

/** Documented places near the planned route, each one click away from being part of it. */
export default function DiscoverAlongRoute({ route, added, computing, onAdd, onRemove, onRestore, onShow }: DiscoverAlongRouteProps) {
  const found = useMemo(() => discoverAlongRoute(route, LOCATIONS), [route]);
  const corridor = discoveryCorridorKm(route);

  return (
    <section className="bt-nav-discover" aria-labelledby="bt-nav-discover-h">
      <h3 id="bt-nav-discover-h" className="bt-nav-h">
        Discover along the way
      </h3>
      <p className="bt-nav-chart__sub">
        Documented places within {formatKm(corridor)} of your route. Extra distance is an estimate until the route is recalculated.
      </p>

      {added.length > 0 && (
        <div className="bt-nav-added">
          <p className="bt-nav-h4">Added to your route</p>
          <ul>
            {added.map((s) => (
              <li key={`${s.id ?? s.name}-${s.lat}`}>
                <span>{s.name}</span>
                <button type="button" className="bt-nav-link" onClick={() => onRemove(s)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="bt-nav-btn bt-nav-btn--ghost" onClick={onRestore} disabled={computing}>
            Restore original route
          </button>
        </div>
      )}

      {found.length === 0 ? (
        <p className="bt-nav-empty">
          {route.kind === 'preview' ? 'No major landmark lies near this course.' : 'No documented site lies this close to the route.'}
        </p>
      ) : (
        <ul className="bt-nav-discoveries">
          {found.map((d) => (
            <li key={d.location.id} className="bt-nav-discovery">
              <button type="button" className="bt-nav-discovery__name" onClick={() => onShow(d.location)}>
                {d.location.name}
              </button>
              <p className="bt-nav-discovery__cat">{d.location.category}</p>
              <p className="bt-nav-discovery__desc">{d.location.description}</p>
              <dl className="bt-nav-discovery__nums">
                <div>
                  <dt>From route</dt>
                  <dd className="bt-nav-num">{formatKm(d.distanceFromRouteKm)}</dd>
                </div>
                <div>
                  <dt>Extra distance</dt>
                  <dd className="bt-nav-num">≈ {formatKm(d.estimatedExtraKm)}</dd>
                </div>
              </dl>
              <p className="bt-nav-discovery__src">Source: {d.location.source}</p>
              <button type="button" className="bt-nav-btn" onClick={() => onAdd(d)} disabled={computing}>
                Add to route
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
