import type { RouteResult, RouteStop } from '../core/routePlanner.ts';
import { DETOUR_BUDGETS } from '../core/routePlanner.ts';
import { SLOPE_CLASSES } from '../core/costModel.ts';
import { formatKm, formatLatLon } from '../core/marsGeo.ts';
import ElevationProfile from './ElevationProfile.tsx';

const MODE_LABEL = { shortest: 'Shortest route', terrain: 'Terrain-aware route', science: 'Scientific discovery' } as const;

/** Sequential ramp, one hue (terracotta), brighter = steeper on the dark panel */
const SLOPE_COLORS = ['#6E4F44', '#9A644F', '#C9805F', '#F0B48F'];

const CONFIDENCE_NOTE = {
  High: 'Elevation data (USGS CTX DEM, 20 m) covers the whole route.',
  Medium: 'Some of the route crosses ground without elevation data.',
  Low: 'No terrain data: distance only.',
} as const;

interface RouteDetailsPanelProps {
  route: RouteResult;
  startName: string;
  destinationName: string;
  onLocate(stop: RouteStop): void;
  onProfileHover(point: { lat: number; lon: number } | null): void;
}

export default function RouteDetailsPanel({ route, startName, destinationName, onLocate, onProfileHover }: RouteDetailsPanelProps) {
  const isPreview = route.kind === 'preview';
  const intermediate = route.stops.filter((s) => s.kind === 'waypoint' || s.kind === 'science');
  const scienceCount = route.stops.filter((s) => s.kind === 'science').length;
  const total = route.terrain ? Object.values(route.terrain.classKm).reduce((s, v) => s + v, 0) : 0;

  return (
    <section className="bt-nav-details" aria-labelledby="bt-nav-overview">
      <h3 id="bt-nav-overview" className="bt-nav-h">
        Route overview
      </h3>
      {isPreview && (
        <p className="bt-nav-callout" role="note">
          <strong>Direct-distance preview.</strong> A traversable route can’t be calculated here: there’s no terrain data along this path. The dashed line is the
          great-circle course, not a safe route.
        </p>
      )}
      <dl className="bt-nav-facts">
        <div>
          <dt>Starting point</dt>
          <dd>{startName}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{destinationName}</dd>
        </div>
        <div>
          <dt>Navigation mode</dt>
          <dd>
            {MODE_LABEL[route.mode]}
            {route.mode === 'science' && !isPreview ? ` · ${DETOUR_BUDGETS[route.detour].label.toLowerCase()}` : ''}
          </dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd className="bt-nav-num">
            {formatKm(route.distanceKm)}
            <span className="bt-nav-sub bt-nav-line">{formatKm(route.directKm)} in a straight line</span>
          </dd>
        </div>
        <div>
          <dt>Elevation gain / loss</dt>
          <dd className="bt-nav-num">
            {route.elevation ? (
              <>
                +{route.elevation.gainM.toLocaleString('en-US')} m / −{route.elevation.lossM.toLocaleString('en-US')} m
              </>
            ) : (
              <span className="bt-nav-sub">Not available (no elevation data)</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Terrain difficulty</dt>
          <dd>
            <span className={`bt-nav-badge bt-nav-badge--${route.difficulty.replace(' ', '-').toLowerCase()}`}>{route.difficulty}</span>
            {route.terrain && <span className="bt-nav-sub bt-nav-num"> · steepest {route.terrain.maxSlopeDeg.toFixed(0)}°</span>}
          </dd>
        </div>
        <div>
          <dt>Scientific stops</dt>
          <dd className="bt-nav-num">{scienceCount}</dd>
        </div>
        <div>
          <dt>Data confidence</dt>
          <dd>
            <span className={`bt-nav-badge bt-nav-badge--conf-${route.confidence.toLowerCase()}`}>{route.confidence}</span>
            <span className="bt-nav-sub"> · {CONFIDENCE_NOTE[route.confidence]}</span>
          </dd>
        </div>
      </dl>

      {route.comparison && (
        <p className="bt-nav-why">
          <strong>Why this route?</strong> {route.comparison.explanation}
        </p>
      )}

      {route.science && (
        <p className="bt-nav-why">
          <strong>Science stops:</strong>{' '}
          {route.science.added.length
            ? `${route.science.added.map((s) => s.name).join(', ')}, for ${formatKm(route.science.extraKm)} extra (allowance ${formatKm(route.science.budgetKm)}).`
            : `No documented site fits within the ${formatKm(route.science.budgetKm)} detour allowance. Try a larger detour.`}
        </p>
      )}

      {route.elevation && route.elevation.profile.length > 1 && (
        <div className="bt-nav-chart">
          <h4 className="bt-nav-h4">Elevation profile</h4>
          <p className="bt-nav-chart__sub">Metres relative to the Mars areoid · hover or use arrow keys</p>
          <ElevationProfile elevation={route.elevation} onHover={(s) => onProfileHover(s ? { lat: s.lat, lon: s.lon } : null)} />
        </div>
      )}

      {route.terrain && total > 0 && (
        <div className="bt-nav-chart">
          <h4 className="bt-nav-h4">Slope along the route</h4>
          <div className="bt-nav-slopebar" role="img" aria-label={SLOPE_CLASSES.map((c) => `${c.label}: ${formatKm(route.terrain!.classKm[c.key])}`).join(', ')}>
            {SLOPE_CLASSES.map((c, i) => {
              const km = route.terrain!.classKm[c.key];
              if (km <= 0) return null;
              return (
                <span
                  key={c.key}
                  className="bt-nav-slopebar__seg"
                  style={{ flexGrow: km, background: SLOPE_COLORS[i] }}
                  title={`${c.label} (≤ ${c.maxDeg}°): ${formatKm(km)}`}
                />
              );
            })}
          </div>
          <ul className="bt-nav-legend">
            {SLOPE_CLASSES.map((c, i) => (
              <li key={c.key}>
                <span className="bt-nav-legend__swatch" style={{ background: SLOPE_COLORS[i] }} aria-hidden="true" />
                <span>
                  {c.label} <span className="bt-nav-sub">≤{c.maxDeg}°</span>
                </span>
                <span className="bt-nav-num">{formatKm(route.terrain!.classKm[c.key])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="bt-nav-stops" open={intermediate.length > 0 && intermediate.length <= 4}>
        <summary>
          Stops <span className="bt-nav-num bt-nav-sub">({route.stops.length})</span>
        </summary>
        <ol>
          {route.stops.map((s, i) => (
            <li key={`${s.kind}-${i}`}>
              <button type="button" className={`bt-nav-stop bt-nav-stop--${s.kind}`} onClick={() => onLocate(s)}>
                <span className="bt-nav-stop__dot" aria-hidden="true" />
                <span className="bt-nav-stop__name">{s.name}</span>
                <span className="bt-nav-stop__meta bt-nav-num">
                  {s.kind === 'science' ? 'science stop · ' : ''}
                  {formatKm(s.atKm)}
                </span>
                <span className="bt-visually-hidden">, {formatLatLon(s)}. Zoom to this stop.</span>
              </button>
            </li>
          ))}
        </ol>
      </details>

      <details className="bt-nav-limits">
        <summary>Limitations & data</summary>
        <ul>
          {route.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {route.dataSource && <li>Source: {route.dataSource}.</li>}
          <li>Coordinates: planetocentric latitude, east-positive longitude (shown 0–360° E).</li>
          <li>No travel time is given: that would need a rover mobility model, not Earth walking or driving speeds.</li>
        </ul>
      </details>
    </section>
  );
}
