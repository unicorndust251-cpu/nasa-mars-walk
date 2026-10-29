// Type surface of the (JavaScript) 3D globe scene used from TypeScript.
declare module '*/ExplorerCanvas.jsx' {
  import type { ComponentType, RefObject } from 'react';
  export interface ExplorerLabels {
    hover: RefObject<HTMLDivElement>;
    selected: RefObject<HTMLDivElement>;
    checkpoints: RefObject<HTMLDivElement>;
    progress: RefObject<HTMLDivElement>;
    navStart: RefObject<HTMLDivElement>;
    navTarget: RefObject<HTMLDivElement>;
    navRoute: RefObject<HTMLDivElement>;
  }
  const ExplorerCanvas: ComponentType<{
    /** An ExplorerStore (typed loosely: ambient modules cannot import relative paths) */
    store: unknown;
    /** A NavStore */
    nav: unknown;
    labels: ExplorerLabels;
    reducedMotion?: boolean;
    onReady?: () => void;
    onError?: (error: unknown) => void;
  }>;
  export default ExplorerCanvas;
}

declare module '*/AstronautCanvas.jsx' {
  import type { ComponentType } from 'react';
  import type { Map as LeafletMap } from 'leaflet';
  const AstronautCanvas: ComponentType<{
    map: LeafletMap;
    getState: () => unknown;
    onContextLost?: () => void;
    onError?: () => void;
  }>;
  export default AstronautCanvas;
}
