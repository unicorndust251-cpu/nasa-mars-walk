import { createContext, useContext } from 'react';
import type * as L from 'leaflet';

export type MapStatus = 'loading' | 'ready' | 'error';

export interface MarsMapApi {
  /** The Leaflet map. Future overlays (routes, markers, panels) attach here. */
  map: L.Map;
  status: MapStatus;
  zoomBy(delta: number): void;
  resetView(): void;
}

export const MarsMapContext = createContext<MarsMapApi | null>(null);

/** Access the Mars map from any overlay rendered inside <MarsMap>. */
export function useMarsMap(): MarsMapApi {
  const ctx = useContext(MarsMapContext);
  if (!ctx) throw new Error('useMarsMap must be used inside <MarsMap>');
  return ctx;
}
