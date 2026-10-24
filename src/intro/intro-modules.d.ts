// Type surface of the (JavaScript) intro modules used from TypeScript.
declare module '*/intro/BeyondTerraIntro.jsx' {
  import type { ComponentType } from 'react';
  export interface IntroHandoff {
    reason: 'descent' | 'skip' | 'timeout' | 'typeOnly' | 'reduced';
    mode: 'full' | 'reduced' | 'typeOnly';
  }
  const BeyondTerraIntro: ComponentType<{
    onHandoff?: (info: IntroHandoff) => void;
    onExitStart?: () => void;
    onDone?: () => void;
  }>;
  export default BeyondTerraIntro;
}

declare module '*/intro/introEnv.js' {
  export function shouldPlayIntro(): boolean;
  export function markIntroPlayed(): void;
  export function clearIntroPlayed(): void;
  export function prefersReducedMotion(): boolean;
  export function webglAvailable(): boolean;
}

declare module '*/intro/introConfig.js' {
  export const JEZERO: { lat: number; lon: number };
  export function handoffMapZoom(viewportHeight: number): number;
}
