"use client";

// ===========================================================
// dashboardCharts.tsx - dependency-free SVG charts for the admin
// dashboard (no chart library is installed in this project).
// All of them draw REAL numbers handed in by the page; with no
// data they say so instead of drawing a pleasant fake trend.
// ===========================================================

import { useRef, useState } from "react";
import { SafeImage } from "./components";

/* ---------------- smooth area chart ---------------- */

export function AreaChart({
  data,
  formatValue,
  color = "#BF2A1E",
}: {
  data: Array<{ label: string; value: number }>;
  formatValue: (v: number) => string;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 230;
  const pad = { l: 46, r: 12, t: 14, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = (() => {
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  })();

  const x = (i: number) => pad.l + (data.length <= 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (v: number) => pad.t + innerH - (v / niceMax) * innerH;

  // Catmull-Rom -> cubic bezier for a smooth line.
  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  let line = "";
  pts.forEach((p, i) => {
    if (i === 0) {
      line = `M${p[0]},${p[1]}`;
      return;
    }
    const p0 = pts[i - 2] ?? pts[i - 1];
    const p1 = pts[i - 1];
    const p2 = p;
    const p3 = pts[i + 1] ?? p;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  });
  const baseY = pad.t + innerH;
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z` : "";

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const gid = `area-${color.replace("#", "")}`;
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(niceMax * t)} y2={y(niceMax * t)} stroke="#EBDCCB" strokeDasharray="3 4" />
            <text x={pad.l - 8} y={y(niceMax * t) + 3} textAnchor="end" fontSize="10" fill="#8a7566">
              {niceMax * t >= 1000 ? `${Math.round((niceMax * t) / 1000)}k` : Math.round(niceMax * t)}
            </text>
          </g>
        ))}

        {area && <path d={area} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />}

        {data.map((d, i) => (
          <g key={i}>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8a7566">
                {d.label}
              </text>
            )}
            <rect
              x={x(i) - innerW / data.length / 2}
              y={pad.t}
              width={Math.max(8, innerW / data.length)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${d.label}: ${formatValue(d.value)}`}
            />
          </g>
        ))}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={baseY} stroke={color} strokeOpacity="0.35" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill="#fff" stroke={color} strokeWidth="2.5" />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-coffee-900 px-2.5 py-1.5 text-xs text-white shadow-lift"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100 - 2}%` }}
        >
          <span className="block text-[10px] text-gold-300">{data[hover].label}</span>
          <span className="font-semibold">{formatValue(data[hover].value)}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- donut ---------------- */

export function Donut({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string | number;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Order status breakdown">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#F3E6D6" strokeWidth="16" />
          {total > 0 &&
            segments.map((s) => {
              const len = (s.value / total) * C;
              const el = (
                <circle
                  key={s.label}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="16"
                  strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-2xl font-bold text-coffee-900">{centerValue}</p>
            <p className="text-[11px] uppercase tracking-wide text-coffee-700/70">{centerLabel}</p>
          </div>
        </div>
      </div>

      <ul className="w-full space-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-coffee-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-semibold text-coffee-900">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- top sellers carousel ---------------- */

export function TopSellers({
  items,
  formatMoney,
}: {
  items: Array<{ name: string; imageUrl?: string | null; units: number; revenue: number }>;
  formatMoney: (v: number) => string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: number) =>
    scroller.current?.scrollBy({ left: dir * 220, behavior: "smooth" });

  if (items.length === 0) return <p className="py-8 text-center text-sm text-coffee-700/75">No sales yet.</p>;

  return (
    <div className="relative">
      <div className="mb-2 flex justify-end gap-1.5">
        <button onClick={() => scrollBy(-1)} aria-label="Scroll left" className="grid h-8 w-8 place-items-center rounded-full border border-brand-100 text-coffee-700 transition hover:bg-gold-50">←</button>
        <button onClick={() => scrollBy(1)} aria-label="Scroll right" className="grid h-8 w-8 place-items-center rounded-full border border-brand-100 text-coffee-700 transition hover:bg-gold-50">→</button>
      </div>
      <div ref={scroller} className="flex snap-x gap-3 overflow-x-auto pb-2">
        {items.map((p, i) => (
          <article key={p.name} className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-brand-100 bg-ivory transition hover:-translate-y-0.5 hover:shadow-cardHover sm:w-44">
            <div className="relative">
              <SafeImage src={p.imageUrl} alt={p.name} className="aspect-square w-full" />
              <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-coffee-900 text-[11px] font-bold text-gold-200">{i + 1}</span>
            </div>
            <div className="p-3">
              <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-coffee-900">{p.name}</p>
              <p className="mt-1 text-xs text-coffee-700/70">{p.units} pcs sold</p>
              <p className="text-xs font-semibold text-brand-700">{formatMoney(p.revenue)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------------- progress rows ---------------- */

export function ProgressRow({
  label,
  value,
  total,
  color = "#BF2A1E",
}: {
  label: string;
  value: number;
  total: number;
  color?: string;
}) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-coffee-900">{label}</span>
        <span className="font-semibold text-coffee-900">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-50">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
