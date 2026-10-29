import { useSyncExternalStore } from 'react';
import { landmarkById } from './landmarks';

/**
 * Explorer state, shared by the interface (React) and the 3D scene (render loop).
 *
 * `state` holds what the interface shows and changes only on events (select, start,
 * checkpoint reached...), so React re-renders rarely. `runtime` holds values that change
 * every frame (how far the astronaut has walked); the scene mutates it directly and the
 * interface never re-renders from it.
 */

export type ExplorerMode = 'globe' | 'explore';
export type MissionStatus = 'idle' | 'walking' | 'paused' | 'completed';
export type SiteImagery = 'loading' | 'ready' | 'fallback';

export interface MissionSummary {
  landmarkId: string;
  checkpoints: string[];
  routeKm: number;
  walkingSeconds: number;
}

export interface ExplorerState {
  selectedId: string | null;
  mode: ExplorerMode;
  /** Landmark of the current exploration mission */
  missionId: string | null;
  status: MissionStatus;
  /** Number of checkpoints reached so far */
  reached: number;
  /** Checkpoint whose "Checkpoint reached" card is open; walking is paused while it shows */
  card: number | null;
  /** Fast-forwarding to the next checkpoint */
  hurry: boolean;
  follow: boolean;
  imagery: SiteImagery;
  summary: MissionSummary | null;
  /** Camera requests for the scene: it flies whenever the token changes */
  view: { kind: 'overview' | 'landmark'; token: number };
}

export interface ExplorerRuntime {
  /** Distance walked along the route (km) */
  distanceKm: number;
  walkingMs: number;
  routeKm: number;
  /** Space covered by interface panels, so the camera can keep the selection in the clear (px) */
  insets: { right: number; bottom: number };
  /** Space covered by the Mars Navigator panel, and by the header above it (px) */
  navInsets: { left: number; bottom: number; top: number };
  /** Zoom steps requested by the interface, consumed by the scene */
  zoomSteps: number;
}

export interface ExplorerStore {
  getState(): ExplorerState;
  subscribe(listener: () => void): () => void;
  runtime: ExplorerRuntime;

  select(id: string): void;
  /** Deselect and show the whole planet again */
  resetView(): void;
  /** Close the landmark panel without moving the camera (the navigator is about to fly) */
  deselect(): void;
  zoomBy(steps: number): void;

  startExploration(): void;
  start(): void;
  pause(): void;
  resume(): void;
  nextCheckpoint(): void;
  restart(): void;
  toggleFollow(): void;
  exitExploration(): void;

  /** Called by the scene */
  arrive(index: number): void;
  setImagery(imagery: SiteImagery): void;
}

export function createExplorerStore(initial: { selectedId?: string | null; explore?: boolean } = {}): ExplorerStore {
  const selected = landmarkById(initial.selectedId)?.id ?? null;
  let state: ExplorerState = {
    selectedId: selected,
    mode: selected && initial.explore ? 'explore' : 'globe',
    missionId: selected && initial.explore ? selected : null,
    status: 'idle',
    reached: 0,
    card: null,
    hurry: false,
    follow: true,
    imagery: 'loading',
    summary: null,
    view: { kind: selected ? 'landmark' : 'overview', token: 1 },
  };
  const runtime: ExplorerRuntime = { distanceKm: 0, walkingMs: 0, routeKm: 0, insets: { right: 0, bottom: 0 }, navInsets: { left: 0, bottom: 0, top: 0 }, zoomSteps: 0 };
  const listeners = new Set<() => void>();

  const set = (patch: Partial<ExplorerState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const flyTo = (kind: 'overview' | 'landmark') => ({ view: { kind, token: state.view.token + 1 } });

  const resetMission = () => {
    runtime.distanceKm = 0;
    runtime.walkingMs = 0;
  };

  const store: ExplorerStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    runtime,

    select(id) {
      if (state.mode === 'explore' || !landmarkById(id)) return;
      set({ selectedId: id, ...flyTo('landmark') });
    },
    resetView() {
      if (state.mode === 'explore') return;
      set({ selectedId: null, ...flyTo('overview') });
    },
    deselect() {
      if (state.mode === 'globe' && state.selectedId) set({ selectedId: null });
    },
    zoomBy(steps) {
      runtime.zoomSteps += steps;
    },

    startExploration() {
      if (!state.selectedId || state.mode === 'explore') return;
      resetMission();
      set({
        mode: 'explore',
        missionId: state.selectedId,
        status: 'idle',
        reached: 0,
        card: null,
        hurry: false,
        follow: true,
        imagery: 'loading',
        summary: null,
      });
    },
    start() {
      if (state.mode !== 'explore' || state.status !== 'idle') return;
      set({ status: 'walking' });
    },
    pause() {
      if (state.status !== 'walking') return;
      set({ status: 'paused', hurry: false });
    },
    resume() {
      if (state.status !== 'paused') return;
      set({ status: 'walking', card: null });
    },
    nextCheckpoint() {
      if (state.mode !== 'explore' || state.status === 'completed') return;
      set({ status: 'walking', card: null, hurry: true });
    },
    restart() {
      if (state.mode !== 'explore') return;
      resetMission();
      set({ status: 'walking', reached: 0, card: null, hurry: false, summary: null });
    },
    toggleFollow() {
      set({ follow: !state.follow });
    },
    exitExploration() {
      if (state.mode !== 'explore') return;
      set({ mode: 'globe', status: 'idle', card: null, hurry: false, summary: null, missionId: null, ...flyTo('landmark') });
    },

    arrive(index) {
      const landmark = landmarkById(state.missionId);
      if (!landmark || state.status !== 'walking') return;
      const last = index >= landmark.checkpoints.length - 1;
      if (last) {
        set({
          status: 'completed',
          reached: landmark.checkpoints.length,
          card: null,
          hurry: false,
          summary: {
            landmarkId: landmark.id,
            checkpoints: landmark.checkpoints.map((c) => c.name),
            routeKm: runtime.routeKm,
            walkingSeconds: runtime.walkingMs / 1000,
          },
        });
      } else {
        set({ status: 'paused', reached: index + 1, card: index, hurry: false });
      }
    },
    setImagery(imagery) {
      if (state.imagery !== imagery) set({ imagery });
    },
  };
  return store;
}

export function useExplorer<T>(store: ExplorerStore, pick: (s: ExplorerState) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(store.getState()));
}
