import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { searchLocations } from '../core/locations.ts';
import { formatLatLon, parseCoordinates } from '../core/marsGeo.ts';
import type { NavStop } from './types.ts';

interface LocationFieldProps {
  label: string;
  role: 'start' | 'destination' | 'waypoint';
  value: NavStop | null;
  placeholder: string;
  picking: boolean;
  onChange(stop: NavStop | null): void;
  onPick(): void;
  autoFocus?: boolean;
}

type Option =
  | { kind: 'coords'; stop: NavStop; note?: string }
  | { kind: 'place'; stop: NavStop; category: string; region: string };

/**
 * One field, three ways in: search known places by name, type coordinates (Mars planetocentric,
 * east-positive), or pick a point on the map. Suggestions appear as you type.
 */
export default function LocationField({ label, role, value, placeholder, picking, onChange, onPick, autoFocus }: LocationFieldProps) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  /** Typed since focusing: until then the field keeps showing the chosen place */
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(0);
  /** Set when typed text matched nothing: the text stays and the field explains */
  const [unmatched, setUnmatched] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const { options, coordError } = useMemo(() => {
    const q = text.trim();
    if (!q) return { options: [] as Option[], coordError: null };
    const out: Option[] = [];
    let coordError: string | null = null;
    // Anything that starts like a number is treated as coordinates
    if (/^[-+]?\d/.test(q)) {
      const parsed = parseCoordinates(q);
      if (parsed.ok) out.push({ kind: 'coords', stop: { ...parsed.value, name: formatLatLon(parsed.value, 4), source: 'coords' }, note: parsed.note });
      else coordError = parsed.error;
    }
    for (const l of searchLocations(q, 7)) {
      out.push({ kind: 'place', stop: { lat: l.lat, lon: l.lon, name: l.name, id: l.id, source: 'search' }, category: l.category, region: l.region });
    }
    return { options: out, coordError };
  }, [text]);

  useEffect(() => setActive(0), [text]);

  // What the blur handler needs, always current (it runs after a short delay)
  const latest = useRef({ dirty, text, options, coordError, onChange });
  latest.current = { dirty, text, options, coordError, onChange };

  const explainNoMatch = (typed: string, err: string | null) =>
    err ? `Coordinates: ${err}` : `No known place matches “${typed}”. Pick a suggestion, type coordinates, or use ⌖ to pick on the map.`;

  const choose = (o: Option) => {
    onChange(o.stop);
    setText('');
    setDirty(false);
    setUnmatched(null);
    setEditing(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[active]) choose(options[active]);
      else if (text.trim()) setUnmatched(explainNoMatch(text.trim(), coordError));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setText('');
      setDirty(false);
      setUnmatched(null);
      setEditing(false);
      inputRef.current?.blur();
    }
  };

  const open = editing && dirty && text.trim().length > 0;
  const shown = dirty ? text : value?.name ?? '';

  return (
    <div className={`bt-nav-field bt-nav-field--${role}${picking ? ' is-picking' : ''}`}>
      <label className="bt-nav-field__label" htmlFor={`${listId}-input`}>
        <span className="bt-nav-field__dot" aria-hidden="true" />
        {label}
      </label>
      <div className="bt-nav-field__row">
        <input
          ref={inputRef}
          id={`${listId}-input`}
          className="bt-nav-field__input"
          type="text"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          aria-describedby={`${listId}-hint`}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          value={shown}
          onFocus={(e) => {
            setEditing(true);
            // Keep unmatched text so it can be corrected; otherwise start fresh over the chosen place
            if (!unmatched) {
              setDirty(false);
              setText('');
            }
            e.currentTarget.select();
          }}
          onBlur={() =>
            window.setTimeout(() => {
              setEditing(false);
              // Leaving the field (Tab, clicking elsewhere) takes the best match, like Enter would
              const l = latest.current;
              const typed = l.text.trim();
              if (!l.dirty || !typed) {
                setDirty(false);
                return;
              }
              const best = l.options[0];
              if (best) {
                l.onChange(best.stop);
                setText('');
                setDirty(false);
                setUnmatched(null);
              } else {
                setUnmatched(explainNoMatch(typed, l.coordError));
              }
            }, 150)
          }
          onChange={(e) => {
            setEditing(true);
            setDirty(true);
            setUnmatched(null);
            setText(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={`bt-nav-iconbtn${picking ? ' is-on' : ''}`}
          onClick={onPick}
          aria-pressed={picking}
          title={picking ? 'Click the map to choose this point' : 'Pick on the map'}
          aria-label={`${picking ? 'Cancel picking' : 'Pick'} ${label.toLowerCase()} on the map`}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="5.2" />
            <circle cx="10" cy="10" r="1.2" className="bt-fill" />
            <path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" />
          </svg>
        </button>
        {value && (
          <button type="button" className="bt-nav-iconbtn" onClick={() => onChange(null)} aria-label={`Clear ${label.toLowerCase()}`} title="Clear">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
            </svg>
          </button>
        )}
      </div>
      <p id={`${listId}-hint`} className={`bt-nav-field__hint${unmatched && !picking ? ' is-error' : ''}`} role={unmatched ? 'alert' : undefined}>
        {picking
          ? 'Click anywhere on the map'
          : unmatched
            ? unmatched
            : value
            ? formatLatLon(value, 4)
            : 'Name, or coordinates like 18.4447, 77.4508 (° N, ° E)'}
      </p>

      {open && (
        <ul id={listId} role="listbox" className="bt-nav-suggest" aria-label={`${label} suggestions`}>
          {options.map((o, i) => (
            <li
              key={o.kind === 'coords' ? 'coords' : o.stop.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`bt-nav-suggest__item${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
            >
              {o.kind === 'coords' ? (
                <>
                  <span className="bt-nav-suggest__name">Use these coordinates</span>
                  <span className="bt-nav-suggest__meta">
                    {o.stop.name}
                    {o.note ? ` · ${o.note}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="bt-nav-suggest__name">{o.stop.name}</span>
                  <span className="bt-nav-suggest__meta">
                    {o.category} · {o.region}
                  </span>
                </>
              )}
            </li>
          ))}
          {options.length === 0 && (
            <li className="bt-nav-suggest__empty" role="presentation">
              {coordError ?? 'No matching place. Try a name like “Séítah”, or coordinates.'}
            </li>
          )}
          {coordError && options.length > 0 && (
            <li className="bt-nav-suggest__empty" role="presentation">
              Coordinates: {coordError}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
