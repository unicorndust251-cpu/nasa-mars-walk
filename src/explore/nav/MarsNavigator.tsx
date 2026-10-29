import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ExplorerStore } from '../explorerStore';
import { useNav, type NavStore } from './navStore';
import { FEATURED_PLACES, LARGE_FEATURE_KM, gazetteerUrl, loadAllPlaces, type MarsPlace } from './places';
import { formatKm } from './distance';
import { formatLat, formatLon } from '../geo';
import PlaceField, { type PlacesStatus } from './PlaceField';
import { Icon } from '../icons';
import './nav.css';

const NARROW = '(max-width: 760px)';

interface MarsNavigatorProps {
  nav: NavStore;
  store: ExplorerStore;
}

/** Full list of searchable places, loaded the first time a field is used. */
function usePlaces() {
  const [places, setPlaces] = useState<MarsPlace[]>(FEATURED_PLACES);
  const [status, setStatus] = useState<PlacesStatus>('idle');
  const want = useCallback(() => {
    if (status === 'loading' || status === 'ready') return;
    setStatus('loading');
    loadAllPlaces()
      .then((all) => {
        setPlaces(all);
        setStatus('ready');
      })
      .catch((err) => {
        console.warn('[Beyond Terra] Mars place names unavailable.', err);
        setStatus('failed');
      });
  }, [status]);
  return { places, status, want };
}

function PlaceSummary({ title, place }: { title: string; place: MarsPlace | null }) {
  if (!place) {
    return (
      <div className="bt-nav-info">
        <p className="bt-nav-info__title">{title}</p>
        <p className="bt-nav-info__empty">Not set</p>
      </div>
    );
  }
  const url = gazetteerUrl(place);
  return (
    <div className="bt-nav-info">
      <p className="bt-nav-info__title">{title}</p>
      <p className="bt-nav-info__name">{place.name}</p>
      <dl className="bt-nav-info__coords">
        <div>
          <dt>Lat</dt>
          <dd>{formatLat(place.lat)}</dd>
        </div>
        <div>
          <dt>Lon</dt>
          <dd>{formatLon(place.lon)}</dd>
        </div>
      </dl>
      {place.kind !== 'coordinates' && (
        <p className="bt-nav-info__note">
          {place.diameterKm >= LARGE_FEATURE_KM
            ? `Official feature centre of a ~${Math.round(place.diameterKm).toLocaleString('en-US')} km ${place.type.toLowerCase()}: a reference point, not an exact astronaut position.`
            : 'Official feature centre (IAU / USGS Gazetteer).'}
          {url && (
            <>
              {' '}
              <a href={url} target="_blank" rel="noreferrer">
                Gazetteer record
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * MARS NAVIGATOR: choose a start and a destination by name or coordinates, see both on the
 * globe, the great-circle distance between them and a dotted route preview.
 */
export default function MarsNavigator({ nav, store }: MarsNavigatorProps) {
  const ref = useRef<HTMLElement>(null);
  const start = useNav(nav, (s) => s.start);
  const destination = useNav(nav, (s) => s.destination);
  const route = useNav(nav, (s) => s.route);
  const { places, status, want } = usePlaces();

  // Tell the scene how much room the panel takes, so the route stays in the clear
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const header = el.closest('.bt-explorer')?.querySelector('.bt-explorer__top');
    const measure = () => {
      const r = el.getBoundingClientRect();
      const top = header ? header.getBoundingClientRect().bottom : 0;
      store.runtime.navInsets = window.matchMedia(NARROW).matches ? { left: 0, bottom: r.height, top } : { left: r.right + 16, bottom: 0, top };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      store.runtime.navInsets = { left: 0, bottom: 0, top: 0 };
    };
  }, [store]);

  const routeStatus = !route
    ? start || destination
      ? `Waiting for ${start ? 'a destination' : 'a starting location'}`
      : 'Enter a start and a destination'
    : route.identical
      ? 'Start and destination are the same point'
      : route.nearlyAntipodal
        ? 'Opposite sides of Mars: many equally short routes exist; one is shown'
        : 'Geographic route preview shown on the globe';

  return (
    <aside ref={ref} className="bt-nav" aria-labelledby="bt-nav-title">
      <header className="bt-nav__head">
        <span className="bt-nav__logo" aria-hidden="true">
          <Icon name="route" />
        </span>
        <h2 id="bt-nav-title" className="bt-nav__title">
          Mars Navigator
        </h2>
        <button type="button" className="bt-nav__close" onClick={() => nav.setOpen(false)} aria-label="Hide the Mars Navigator" title="Hide">
          <Icon name="close" />
        </button>
      </header>

      <p className="bt-nav__intro">You enter both points. Beyond Terra has no live positioning on Mars.</p>

      <PlaceField
        role="start"
        label="Start location"
        placeholder="Enter your Mars starting location or coordinates"
        findLabel="Find Starting Location"
        value={start}
        places={places}
        placesStatus={status}
        onWantPlaces={want}
        onSelect={(p) => nav.setStart(p)}
      />
      <PlaceField
        role="destination"
        label="Destination"
        placeholder="Enter your Mars destination or coordinates"
        findLabel="Find Destination"
        value={destination}
        places={places}
        placesStatus={status}
        onWantPlaces={want}
        onSelect={(p) => nav.setDestination(p)}
      />

      <div className="bt-nav__grid">
        <PlaceSummary title="Start" place={start} />
        <PlaceSummary title="Destination" place={destination} />
      </div>

      <section className="bt-nav-route" aria-label="Route">
        <p className="bt-nav-info__title">Route</p>
        <p className="bt-nav-route__distance" aria-live="polite">
          <span>Distance:</span> <strong>{route ? formatKm(route.distanceKm) : '— KM'}</strong>
        </p>
        <p className="bt-nav-route__kind">Great-circle surface distance · Mars mean radius 3,389.5 km</p>
        <p className="bt-nav-route__status">{routeStatus}</p>
        {route && !route.identical && (
          <div className="bt-nav-route__warning">
            <strong>Simulated geographic route</strong>
            <span>Terrain safety not yet verified. This line ignores cliffs, slopes, rocks and other hazards, and is not a walking route.</span>
          </div>
        )}
      </section>

      <div className="bt-nav__actions">
        <button type="button" className="bt-nav-btn bt-nav-btn--primary" disabled={!start || !destination} onClick={() => nav.calculate()}>
          <Icon name="route" /> Calculate Distance
        </button>
        <button type="button" className="bt-nav-btn" disabled={!start} onClick={() => nav.focus('start')}>
          <Icon name="pin" /> Focus Start
        </button>
        <button type="button" className="bt-nav-btn" disabled={!destination} onClick={() => nav.focus('destination')}>
          <Icon name="target" /> Focus Destination
        </button>
        <button type="button" className="bt-nav-btn" disabled={!route} onClick={() => nav.focus('route')}>
          <Icon name="globe" /> Show Full Route
        </button>
        <button type="button" className="bt-nav-btn bt-nav-btn--ghost" disabled={!start && !destination} onClick={() => nav.reset()}>
          <Icon name="restart" /> Reset Route
        </button>
      </div>
    </aside>
  );
}
