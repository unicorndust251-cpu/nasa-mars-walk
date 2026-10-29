import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { coordinatePlace, fold, type MarsPlace } from './places';
import { duplicateNames, interpretQuery, searchPlaces } from './search';
import { validateLatLon } from './coordinates';
import { formatLat, formatLon } from '../geo';
import { Icon } from '../icons';

export type PlacesStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface PlaceFieldProps {
  role: 'start' | 'destination';
  label: string;
  placeholder: string;
  findLabel: string;
  value: MarsPlace | null;
  places: MarsPlace[];
  placesStatus: PlacesStatus;
  /** Called on first use, to load the full list of official names */
  onWantPlaces(): void;
  onSelect(place: MarsPlace): void;
}

const KIND_LABEL = { landmark: 'Featured landmark', feature: 'IAU feature', coordinates: 'Coordinates' } as const;

/**
 * One navigator endpoint: a combobox that takes a Mars place name (with suggestions from
 * the featured landmarks and the Gazetteer) or a latitude/longitude pair, plus a two-box
 * latitude/longitude mode for typing coordinates separately.
 */
export default function PlaceField({ role, label, placeholder, findLabel, value, places, placesStatus, onWantPlaces, onSelect }: PlaceFieldProps) {
  const [mode, setMode] = useState<'search' | 'coords'>('search');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const fieldId = useId();

  // Show the chosen place in the box, the way a maps app does
  useEffect(() => {
    setQuery(value?.name ?? '');
    setError(null);
    if (value) {
      setLatText(value.lat.toFixed(2));
      setLonText(value.lon.toFixed(2));
    }
  }, [value]);

  const interpreted = useMemo(() => interpretQuery(query, places, 10), [query, places]);
  const options: MarsPlace[] =
    interpreted.kind === 'coordinates' ? [interpreted.place] : interpreted.kind === 'names' ? interpreted.results : [];
  const dupes = useMemo(() => duplicateNames(options), [options]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (place: MarsPlace) => {
    setOpen(false);
    setError(null);
    onSelect(place);
  };

  /** "Find": coordinates, else the exact name, else the best partial match. */
  const find = () => {
    if (mode === 'coords') {
      const v = validateLatLon(Number(latText.trim() || NaN), Number(lonText.trim() || NaN));
      if (v.ok) choose(coordinatePlace(v.value.lat, v.value.lon));
      else setError(v.error);
      return;
    }
    if (interpreted.kind === 'empty') return setError('Type a Mars place name or coordinates');
    if (interpreted.kind === 'invalid') return setError(interpreted.error);
    if (interpreted.kind === 'coordinates') return choose(interpreted.place);
    if (value && fold(query) === fold(value.name)) return choose(value);
    const exact = searchPlaces(query, places, 50).find((p) => fold(p.name) === fold(query.trim()));
    const best = exact ?? interpreted.results[0];
    if (best) choose(best);
    else setError(placesStatus === 'loading' ? 'Still loading Mars place names, try again in a moment' : `No Mars location matches “${query.trim()}”`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && options[active]) choose(options[active]);
      else find();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (open) setOpen(false);
      else inputRef.current?.blur();
    }
  };

  const showList = mode === 'search' && open && options.length > 0 && !(value && query === value.name);
  const noMatch = mode === 'search' && open && interpreted.kind === 'names' && options.length === 0 && placesStatus !== 'loading';

  return (
    <div className={`bt-nav-field bt-nav-field--${role}`}>
      <div className="bt-nav-field__head">
        <label className="bt-nav-field__label" htmlFor={fieldId}>
          <span className="bt-nav-field__swatch" aria-hidden="true" />
          {label}
        </label>
        <div className="bt-nav-field__modes" role="group" aria-label={`${label}: input type`}>
          <button type="button" aria-pressed={mode === 'search'} onClick={() => setMode('search')}>
            Name
          </button>
          <button type="button" aria-pressed={mode === 'coords'} onClick={() => setMode('coords')}>
            Lat / Lon
          </button>
        </div>
      </div>

      {mode === 'search' ? (
        <div className="bt-nav-field__box">
          <Icon name={role === 'start' ? 'pin' : 'target'} />
          <input
            ref={inputRef}
            id={fieldId}
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
            aria-invalid={!!error}
            placeholder={placeholder}
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setError(null);
            }}
            onFocus={() => {
              onWantPlaces();
              setOpen(true);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
          />
        </div>
      ) : (
        <div className="bt-nav-field__coords">
          <label>
            <span>Latitude</span>
            <input
              id={fieldId}
              inputMode="decimal"
              placeholder="18.40"
              value={latText}
              aria-invalid={!!error}
              onChange={(e) => {
                setLatText(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && find()}
            />
          </label>
          <label>
            <span>Longitude °E</span>
            <input
              inputMode="decimal"
              placeholder="77.50"
              value={lonText}
              aria-invalid={!!error}
              onChange={(e) => {
                setLonText(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && find()}
            />
          </label>
        </div>
      )}

      <ul ref={listRef} id={listId} role="listbox" aria-label={`${label} suggestions`} className="bt-nav-field__list" hidden={!showList}>
        {options.map((p, i) => (
          <li
            key={p.id}
            id={`${listId}-${i}`}
            role="option"
            data-index={i}
            aria-selected={i === active}
            className={`bt-nav-option bt-nav-option--${p.kind}${i === active ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(p)}
          >
            <span className="bt-nav-option__dot" aria-hidden="true" />
            <span className="bt-nav-option__name">{p.name}</span>
            <span className="bt-nav-option__meta">
              {p.kind === 'coordinates' ? 'Go to these coordinates' : `${KIND_LABEL[p.kind]} · ${p.type}`}
              {(dupes.has(fold(p.name)) || p.kind === 'feature') && ` · ${formatLat(p.lat, 1)} ${formatLon(p.lon, 1)}`}
            </span>
          </li>
        ))}
        {placesStatus === 'loading' && <li className="bt-nav-field__status">Loading official Mars place names…</li>}
      </ul>

      {noMatch && (
        <p className="bt-nav-field__status bt-nav-field__status--float" role="status">
          No Mars location matches “{query.trim()}”
        </p>
      )}
      {placesStatus === 'failed' && open && mode === 'search' && (
        <p className="bt-nav-field__status" role="status">
          Couldn’t load the official name list; featured landmarks and coordinates still work.
        </p>
      )}
      {error && (
        <p className="bt-nav-field__error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="bt-nav-btn bt-nav-btn--find" onMouseDown={(e) => e.preventDefault()} onClick={find}>
        <Icon name="search" /> {findLabel}
      </button>
    </div>
  );
}
