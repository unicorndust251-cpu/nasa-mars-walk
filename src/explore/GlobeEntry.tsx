import { LANDMARKS } from './landmarks';
import { Icon } from './icons';
import './globe-entry.css';

/** The way from the map into the 3D globe explorer. Sits in the map's overlay slot. */
export default function GlobeEntry({ onOpen }: { onOpen(): void }) {
  return (
    <button type="button" className="bt-globe-entry" onClick={onOpen}>
      <Icon name="globe" />
      <span>3D globe</span>
      <span className="bt-globe-entry__count">{LANDMARKS.length} landmarks</span>
    </button>
  );
}
