import { useCallback, useEffect, useRef, useState } from 'react';
import type * as L from 'leaflet';
import type { MapStatus } from './MarsMapContext';

const FAILURES_BEFORE_ERROR = 4;
const NO_TILES_TIMEOUT_MS = 15000;

/**
 * Watches the global base layer. The map is 'ready' once any base tile arrives, and
 * 'error' if Mars Trek keeps failing (or never answers) before any imagery has loaded.
 * Nothing is ever drawn in place of missing tiles: the map stays on its dark background.
 */
export function useTileHealth(base: L.TileLayer | null, layers: L.TileLayer[]) {
  const [status, setStatus] = useState<MapStatus>('loading');
  const loads = useRef(0);
  const errors = useRef(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!base) return undefined;
    loads.current = 0;
    errors.current = 0;
    setStatus('loading');

    const onLoad = () => {
      loads.current += 1;
      setStatus('ready');
    };
    const onError = () => {
      errors.current += 1;
      if (loads.current === 0 && errors.current >= FAILURES_BEFORE_ERROR) setStatus('error');
    };
    const onOffline = () => loads.current === 0 && setStatus('error');

    base.on('tileload', onLoad);
    base.on('tileerror', onError);
    window.addEventListener('offline', onOffline);
    const timer = window.setTimeout(() => {
      if (loads.current === 0) setStatus('error');
    }, NO_TILES_TIMEOUT_MS);

    return () => {
      base.off('tileload', onLoad);
      base.off('tileerror', onError);
      window.removeEventListener('offline', onOffline);
      window.clearTimeout(timer);
    };
  }, [base, attempt]);

  const retry = useCallback(() => {
    layers.forEach((layer) => layer.redraw());
    setAttempt((a) => a + 1);
  }, [layers]);

  // Come back online → try again automatically
  useEffect(() => {
    const onOnline = () => status === 'error' && retry();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [retry, status]);

  return { status, retry };
}
