import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { LANDMARKS, searchLandmarks } from './landmarks';
import { Icon } from './icons';

interface LandmarkSearchProps {
  selectedId: string | null;
  onSelect(id: string): void;
}

/**
 * Combobox: type to filter the 26 landmarks by name (or category), arrow keys to move,
 * Enter to fly there. Focusing the empty field lists every landmark, so it also works as
 * the keyboard and screen-reader way to reach markers on the globe. "/" focuses it.
 */
export default function LandmarkSearch({ selectedId, onSelect }: LandmarkSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const results = useMemo(() => searchLandmarks(query), [query]);

  useEffect(() => setActive(0), [query]);

  // Keep the active option in view while arrowing through the list
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      const hit = results[active];
      if (hit) {
        e.preventDefault();
        choose(hit.id);
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (query) setQuery('');
      else {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
  };

  const showList = open && results.length > 0;

  return (
    <div className={`bt-search${showList ? ' is-open' : ''}`}>
      <label className="bt-search__field">
        <Icon name="search" />
        <span className="bt-visually-hidden">Search landmarks</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
          placeholder={`Search ${LANDMARKS.length} landmarks`}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="bt-search__clear"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        )}
      </label>

      {open && results.length === 0 && (
        <p className="bt-search__empty" role="status">
          No landmark matches “{query}”
        </p>
      )}

      <ul ref={listRef} id={listId} role="listbox" aria-label="Landmarks" className="bt-search__list" hidden={!showList}>
        {results.map((l, i) => (
          <li
            key={l.id}
            id={`${listId}-${l.id}`}
            role="option"
            data-index={i}
            aria-selected={i === active}
            className={`bt-search__option${i === active ? ' is-active' : ''}${l.id === selectedId ? ' is-current' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(l.id)}
          >
            <span className="bt-search__dot" aria-hidden="true" />
            <span className="bt-search__name">{l.name}</span>
            <span className="bt-search__category">{l.category}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
