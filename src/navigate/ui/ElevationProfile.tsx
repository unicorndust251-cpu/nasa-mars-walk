import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ElevationSummary } from '../core/routePlanner.ts';

type Sample = ElevationSummary['profile'][number];

interface ElevationProfileProps {
  elevation: ElevationSummary;
  /** Reports the hovered sample, so the map can show where it is */
  onHover(sample: Sample | null): void;
}

const H = 112;
const PAD = { top: 10, right: 10, bottom: 22, left: 46 };

/** Clean tick values covering [min, max]. */
function ticks(min: number, max: number, count = 3): number[] {
  const span = Math.max(1, max - min);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

const fmtM = (m: number) => `${Math.round(m).toLocaleString('en-US')} m`;
const fmtKm = (km: number) => `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`;

/**
 * Elevation along the route: a single series (no legend; the heading names it), 2px line with a
 * light wash, hairline axes, and a crosshair that snaps to the nearest sample on hover, touch or
 * arrow keys.
 */
export default function ElevationProfile({ elevation, onHover }: ElevationProfileProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const profile = elevation.profile;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const totalKm = profile[profile.length - 1]?.km || 1;
    const lo = elevation.minM;
    const hi = elevation.maxM;
    const pad = Math.max(5, (hi - lo) * 0.12);
    const yMin = lo - pad;
    const yMax = hi + pad;
    const plotW = width - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (km: number) => PAD.left + (km / totalKm) * plotW;
    const y = (m: number) => PAD.top + (1 - (m - yMin) / (yMax - yMin)) * plotH;
    const line = profile.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.m).toFixed(1)}`).join('');
    const area = `${line}L${x(totalKm).toFixed(1)},${PAD.top + plotH}L${PAD.left},${PAD.top + plotH}Z`;
    return { totalKm, x, y, line, area, plotW, plotH, yTicks: ticks(yMin, yMax), xTicks: [0, totalKm / 2, totalKm] };
  }, [profile, elevation.minM, elevation.maxM, width]);

  const pick = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const km = ((clientX - rect.left - PAD.left) / geo.plotW) * geo.totalKm;
    let best = 0;
    for (let i = 1; i < profile.length; i++) if (Math.abs(profile[i].km - km) < Math.abs(profile[best].km - km)) best = i;
    setHover(best);
    onHover(profile[best]);
  };
  const clear = () => {
    setHover(null);
    onHover(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = Math.max(1, Math.round(profile.length / 40));
    const next = Math.max(0, Math.min(profile.length - 1, (hover ?? 0) + (e.key === 'ArrowRight' ? step : -step)));
    setHover(next);
    onHover(profile[next]);
  };

  const h = hover !== null ? profile[hover] : null;

  return (
    <div
      ref={wrapRef}
      className="bt-nav-profile"
      tabIndex={0}
      role="img"
      aria-label={`Elevation profile: from ${fmtM(elevation.startM)} to ${fmtM(elevation.endM)}, lowest ${fmtM(elevation.minM)}, highest ${fmtM(elevation.maxM)}. Use the arrow keys to read values.`}
      onPointerMove={(e: PointerEvent) => pick(e.clientX)}
      onPointerDown={(e: PointerEvent) => pick(e.clientX)}
      onPointerLeave={clear}
      onBlur={clear}
      onKeyDown={onKeyDown}
    >
      <svg width={width} height={H} aria-hidden="true">
        {geo.yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} className="bt-nav-profile__grid" />
            <text x={PAD.left - 6} y={geo.y(t)} className="bt-nav-profile__tick" textAnchor="end" dominantBaseline="middle">
              {t.toLocaleString('en-US')}
            </text>
          </g>
        ))}
        {geo.xTicks.map((t, i) => (
          <text key={i} x={geo.x(t)} y={H - 6} className="bt-nav-profile__tick" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
            {fmtKm(t)}
          </text>
        ))}
        <path d={geo.area} className="bt-nav-profile__area" />
        <path d={geo.line} className="bt-nav-profile__line" />
        {h && (
          <g>
            <line x1={geo.x(h.km)} x2={geo.x(h.km)} y1={PAD.top} y2={PAD.top + geo.plotH} className="bt-nav-profile__cross" />
            <circle cx={geo.x(h.km)} cy={geo.y(h.m)} r={4.5} className="bt-nav-profile__dot" />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="bt-nav-profile__tip"
          style={{ left: Math.min(width - 120, Math.max(0, geo.x(h.km) - 60)) }}
          aria-live="polite"
        >
          <span>{fmtKm(h.km)}</span>
          <strong>{fmtM(h.m)}</strong>
        </div>
      )}
    </div>
  );
}
