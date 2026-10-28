import type { RoutePoint } from '../core/routePlanner.ts';

/** A stop chosen by the visitor, and how it was chosen. */
export interface NavStop extends RoutePoint {
  source: 'search' | 'coords' | 'map' | 'discover';
}
