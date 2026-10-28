import { useEffect, useRef, useState } from 'react';
import type { PlanRequest, RouteResult } from './core/routePlanner.ts';
import type { WorkerRequest, WorkerResponse } from './routeWorker.ts';

export type TerrainStatus = 'loading' | 'ready' | 'unavailable';

export interface PlannerState {
  status: 'idle' | 'computing' | 'ready' | 'error';
  /** The latest route; kept on screen while a recalculation runs, so the map never goes blank */
  result: RouteResult | null;
  /** True while `result` answers an older request than the current one */
  stale: boolean;
  error: string | null;
  ms: number | null;
}

interface Answer {
  key: string;
  result: RouteResult | null;
  error: string | null;
  ms: number | null;
}

/**
 * Plans routes in a Web Worker. Every change to the request triggers a recalculation (debounced
 * slightly so typing or dragging doesn't flood the worker); outdated computations are cancelled
 * in the worker and their answers ignored here.
 *
 * Each answer remembers which request it belongs to, so the very first render after a change
 * already knows the shown route is out of date: the panel never pairs new inputs with old numbers.
 */
export function useRoutePlanner(request: PlanRequest | null) {
  const workerRef = useRef<Worker | null>(null);
  const latest = useRef<{ id: number; key: string }>({ id: 0, key: '' });
  const [terrain, setTerrain] = useState<TerrainStatus>('loading');
  const [answer, setAnswer] = useState<Answer>({ key: '', result: null, error: null, ms: null });
  const [crashed, setCrashed] = useState<string | null>(null);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./routeWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      setTerrain('unavailable');
      setCrashed('Route planning isn’t available in this browser.');
      return undefined;
    }
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'terrain') setTerrain(msg.status);
      else if (msg.id !== latest.current.id) return; // an answer to a superseded request
      else if (msg.type === 'result') setAnswer({ key: latest.current.key, result: msg.result, error: null, ms: msg.ms });
      else if (msg.type === 'error') setAnswer({ key: latest.current.key, result: null, error: msg.message, ms: null });
    };
    worker.onerror = () => {
      setTerrain('unavailable');
      setCrashed('The route planner stopped unexpectedly. Reopen navigation to try again.');
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const key = request ? JSON.stringify(request) : '';
  useEffect(() => {
    const id = latest.current.id + 1;
    latest.current = { id, key };
    if (!request) return undefined;
    const timer = window.setTimeout(() => {
      const msg: WorkerRequest = { type: 'plan', id, request };
      workerRef.current?.postMessage(msg);
    }, 120);
    return () => window.clearTimeout(timer);
    // The serialized key captures every field of the request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = answer.key === key && key !== '';
  const state: PlannerState = crashed
    ? { status: 'error', result: null, stale: false, error: crashed, ms: null }
    : !request
      ? { status: 'idle', result: null, stale: false, error: null, ms: null }
      : current
        ? { status: answer.error ? 'error' : 'ready', result: answer.result, stale: false, error: answer.error, ms: answer.ms }
        : { status: 'computing', result: answer.result, stale: answer.result !== null, error: null, ms: null };

  return { ...state, terrain };
}
