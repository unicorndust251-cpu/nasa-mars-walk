// Type surface of the (JavaScript) 3D globe scene used from TypeScript.
declare module '*/ExplorerCanvas.jsx' {
  import type { ComponentType, RefObject } from 'react';
  export interface ExplorerLabels {
    hover: RefObject<HTMLDivElement>;
    selected: RefObject<HTMLDivElement>;
    checkpoints: RefObject<HTMLDivElement>;
    progress: RefObject<HTMLDivElement>;
  }
  const ExplorerCanvas: ComponentType<{
    /** An ExplorerStore (typed loosely: ambient modules cannot import relative paths) */
    store: unknown;
    labels: ExplorerLabels;
    reducedMotion?: boolean;
    onReady?: () => void;
    onError?: (error: unknown) => void;
  }>;
  export default ExplorerCanvas;
}
