import { TerrainGrid } from './core/terrain.ts';
import { AbortedError, planRoute, RoutePlanningError, type PlanRequest, type RouteResult } from './core/routePlanner.ts';
import { LOCATIONS } from './core/locations.ts';

/**
 * Route planning off the main thread. Loads the Jezero terrain once, then plans one request at a
 * time (the pathfinder reuses its buffers, so requests must never overlap). A newer request
 * cancels the one in progress at its next pause; only the latest is ever answered.
 */

export type WorkerRequest = { type: 'plan'; id: number; request: PlanRequest };
export type WorkerResponse =
  | { type: 'terrain'; status: 'loading' | 'ready' | 'unavailable'; detail?: string }
  | { type: 'result'; id: number; result: RouteResult; ms: number }
  | { type: 'error'; id: number; message: string };

const post = (msg: WorkerResponse) => (self as unknown as { postMessage(m: WorkerResponse): void }).postMessage(msg);

const candidates = LOCATIONS.filter((l) => l.scale !== 'global' && l.scienceValue > 0).map((l) => ({
  id: l.id,
  name: l.name,
  lat: l.lat,
  lon: l.lon,
  value: l.scienceValue,
}));

let terrain: TerrainGrid | null = null;
const terrainReady: Promise<void> = (async () => {
  post({ type: 'terrain', status: 'loading' });
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/jezero-terrain.bin`);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    terrain = TerrainGrid.decode(buf);
    post({ type: 'terrain', status: 'ready' });
  } catch (err) {
    terrain = null;
    post({ type: 'terrain', status: 'unavailable', detail: err instanceof Error ? err.message : String(err) });
  }
})();

let latest: WorkerRequest | null = null;
let current: { aborted: boolean } | null = null;
let running = false;

async function drain() {
  if (running) return;
  running = true;
  await terrainReady;
  while (latest) {
    const job = latest;
    latest = null;
    const signal = { aborted: false };
    current = signal;
    const t0 = performance.now();
    try {
      const result = await planRoute(job.request, { terrain, candidates, signal });
      if (!signal.aborted) post({ type: 'result', id: job.id, result, ms: performance.now() - t0 });
    } catch (err) {
      if (err instanceof AbortedError) continue;
      post({
        type: 'error',
        id: job.id,
        message: err instanceof RoutePlanningError ? err.message : 'The route could not be calculated.',
      });
      if (!(err instanceof RoutePlanningError)) console.error(err);
    }
  }
  current = null;
  running = false;
}

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  if (e.data?.type !== 'plan') return;
  latest = e.data;
  if (current) current.aborted = true;
  void drain();
});
