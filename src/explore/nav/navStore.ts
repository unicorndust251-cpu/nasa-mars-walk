import { useSyncExternalStore } from 'react';
import type { MarsPlace } from './places';
import { buildGreatCircleRoute, type GeoRoute } from './routeGeometry';

/**
 * Navigator state, shared by the panel (React) and the globe scene, in the same pattern as
 * explorerStore. The astronaut supplies both endpoints: nothing here detects a position.
 *
 * `route` holds the great-circle waypoints for the current pair. It is a geographic preview
 * only; a future astronaut animation can read it from here (getState().route) but must not
 * treat it as a safe walking path.
 */

export type NavFocus = 'start' | 'destination' | 'route';

export interface NavState {
  open: boolean;
  start: MarsPlace | null;
  destination: MarsPlace | null;
  route: GeoRoute | null;
  /** Camera requests for the scene: it flies whenever the token changes */
  view: { kind: NavFocus; token: number };
}

export interface NavStore {
  getState(): NavState;
  subscribe(listener: () => void): () => void;
  setOpen(open: boolean): void;
  setStart(place: MarsPlace): void;
  setDestination(place: MarsPlace): void;
  /** Recalculates the route and frames it */
  calculate(): void;
  focus(kind: NavFocus): void;
  reset(): void;
}

export function createNavStore(initial: { open?: boolean } = {}): NavStore {
  let state: NavState = { open: initial.open ?? false, start: null, destination: null, route: null, view: { kind: 'route', token: 0 } };
  const listeners = new Set<() => void>();

  const set = (patch: Partial<NavState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const flyTo = (kind: NavFocus) => ({ view: { kind, token: state.view.token + 1 } });
  const routeFor = (a: MarsPlace | null, b: MarsPlace | null) => (a && b ? buildGreatCircleRoute(a, b) : null);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOpen(open) {
      if (open !== state.open) set({ open });
    },
    setStart(place) {
      const route = routeFor(place, state.destination);
      set({ start: place, route, ...flyTo(route ? 'route' : 'start') });
    },
    setDestination(place) {
      const route = routeFor(state.start, place);
      set({ destination: place, route, ...flyTo(route ? 'route' : 'destination') });
    },
    calculate() {
      const route = routeFor(state.start, state.destination);
      if (route) set({ route, ...flyTo('route') });
    },
    focus(kind) {
      if ((kind === 'start' && state.start) || (kind === 'destination' && state.destination) || (kind === 'route' && state.route)) set(flyTo(kind));
    },
    reset() {
      set({ start: null, destination: null, route: null });
    },
  };
}

export function useNav<T>(store: NavStore, pick: (s: NavState) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(store.getState()));
}
