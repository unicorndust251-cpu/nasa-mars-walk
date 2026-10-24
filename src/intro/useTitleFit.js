import { useLayoutEffect, useState } from 'react';
import { INTRO, heroDiameterPx } from './introConfig.js';

const TRACKING = 0.12; // em

/** Width of the title at 100px, measured with the real font metrics (tracking excluded from the last glyph). */
function measureAt100px() {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `800 100px "Exo 2", "Segoe UI", system-ui, sans-serif`;
    const text = INTRO.title.text;
    return ctx.measureText(text).width + TRACKING * 100 * (text.length - 1);
  } catch {
    return 100 * 0.78 * INTRO.title.text.length; // rough Exo 2 average
  }
}

/**
 * Font size (px) that makes BEYOND TERRA span slightly wider than the planet's
 * disc at the hero moment, while never exceeding the viewport width.
 */
export function computeTitleSize(width, height) {
  const target = Math.min(
    heroDiameterPx(width, height) * INTRO.title.overhang,
    width * INTRO.title.maxViewportWidth
  );
  return (100 * target) / measureAt100px();
}

export function useTitleFit(fontReady) {
  const [size, setSize] = useState(() =>
    typeof window === 'undefined' ? 96 : computeTitleSize(window.innerWidth, window.innerHeight)
  );

  useLayoutEffect(() => {
    const update = () => setSize(computeTitleSize(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [fontReady]);

  return size;
}
