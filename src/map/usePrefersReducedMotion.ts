import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia(QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(QUERY);
    } catch {
      return undefined;
    }
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}
