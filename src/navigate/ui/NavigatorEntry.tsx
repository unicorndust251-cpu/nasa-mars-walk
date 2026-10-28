/** The way into route planning from the map. Shares the globe button's look. */
export default function NavigatorEntry({ onOpen }: { onOpen(): void }) {
  return (
    <button type="button" className="bt-globe-entry" onClick={onOpen}>
      <svg viewBox="0 0 20 20" aria-hidden="true" className="bt-icon">
        <path d="M5 15.5c0-3 2-3.5 5-3.5s5-.5 5-3.5" />
        <circle cx="5" cy="15.5" r="1.8" />
        <circle cx="15" cy="5" r="1.8" className="bt-fill" />
      </svg>
      <span>Navigate Mars</span>
    </button>
  );
}
