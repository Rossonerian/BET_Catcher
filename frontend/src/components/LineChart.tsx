import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

export interface ChartSeries {
  key: string;
  label: string;
  /** A CSS colour or var(--token). Applied via style, not presentation attributes. */
  color: string;
  dashed?: boolean;
  /** Fills the area under the line with a fade from the series colour to transparent. */
  area?: boolean;
  values: (number | null)[];
}

interface Props {
  dates: string[];
  series: ChartSeries[];
  /** Index from which the "recent" window starts (shaded). */
  recentIndex: number | null;
  /** Index where an approved declaration takes effect (marker line). */
  markerIndex?: number | null;
  markerLabel?: string;
  formatY: (v: number) => string;
  ariaLabel: string;
}

const W = 960;
const H = 300;
const M = { top: 16, right: 16, bottom: 34, left: 64 };

/** Closed path under a line: each run of non-null values drops to the baseline. */
function areaPath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number, base: number): string {
  let d = "";
  let start = -1;
  const close = (end: number) => {
    d += `L${x(end).toFixed(1)},${base}L${x(start).toFixed(1)},${base}Z`;
    start = -1;
  };
  values.forEach((v, i) => {
    if (v === null) {
      if (start >= 0) close(i - 1);
      return;
    }
    d += `${start < 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    if (start < 0) start = i;
  });
  if (start >= 0) close(values.length - 1);
  return d;
}

/** Round step (1, 2, 2.5, 5 × 10^k) so that about four ticks cover v. */
function niceStep(v: number): number {
  if (v <= 0) return 0.25;
  const raw = v / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function LineChart({ dates, series, recentIndex, markerIndex, markerLabel, formatY, ariaLabel }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = `area-${useId().replace(/:/g, "")}`;
  const n = dates.length;
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const { yMax, yTicks } = useMemo(() => {
    let mx = 0;
    for (const s of series) for (const v of s.values) if (v !== null && v > mx) mx = v;
    const step = niceStep(mx * 1.02);
    const top = Math.max(step, Math.ceil((mx * 1.02) / step) * step);
    const ticks: number[] = [];
    for (let t = 0; t <= top + step / 2; t += step) ticks.push(Number(t.toPrecision(10)));
    return { yMax: top, yTicks: ticks };
  }, [series]);

  const x = (i: number) => M.left + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => M.top + ih - (v / yMax) * ih;

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return { ...s, d };
  });

  const areaSeries = series.find((s) => s.area);
  const areaD = areaSeries ? areaPath(areaSeries.values, x, y, M.top + ih) : "";

  const xTickEvery = Math.max(1, Math.ceil(n / 8));

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.left) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const cur = hover ?? (e.key === "ArrowRight" ? -1 : n);
      setHover(Math.max(0, Math.min(n - 1, cur + (e.key === "ArrowRight" ? 1 : -1))));
    }
  };

  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key} className="legend-item">
            <svg width="26" height="10" aria-hidden="true">
              <line
                x1="0"
                y1="5"
                x2="26"
                y2="5"
                style={{ stroke: s.color }}
                strokeWidth="2.5"
                strokeDasharray={s.dashed ? "5 4" : undefined}
              />
            </svg>
            {s.label}
          </span>
        ))}
        {recentIndex !== null && (
          <span className="legend-item">
            <span className="legend-swatch recent-swatch" aria-hidden="true" /> Recent window
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {areaD && (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.12 }} />
              <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
        )}
        {recentIndex !== null && recentIndex < n && (
          <rect
            x={x(recentIndex)}
            y={M.top}
            width={x(n - 1) - x(recentIndex)}
            height={ih}
            className="recent-shade"
          />
        )}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="axis-text">
              {formatY(t)}
            </text>
          </g>
        ))}
        {dates.map((d, i) =>
          i % xTickEvery === 0 ? (
            <text key={d} x={x(i)} y={H - 10} textAnchor="middle" className="axis-text">
              {d.slice(5)}
            </text>
          ) : null,
        )}
        {markerIndex !== null && markerIndex !== undefined && markerIndex < n && (
          <g>
            <line x1={x(markerIndex)} x2={x(markerIndex)} y1={M.top} y2={M.top + ih} className="marker-line" />
            {markerLabel && (
              <text x={x(markerIndex) + 4} y={M.top + 12} className="axis-text marker-text">
                {markerLabel}
              </text>
            )}
          </g>
        )}
        {areaD && <path d={areaD} fill={`url(#${gradId})`} stroke="none" />}
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            fill="none"
            style={{ stroke: p.color }}
            strokeWidth={p.dashed ? 2 : 2.25}
            strokeDasharray={p.dashed ? "6 5" : undefined}
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} className="hover-line" />
            {series.map((s) =>
              s.values[hover] !== null ? (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] as number)} r="4" style={{ fill: s.color }} />
              ) : null,
            )}
          </g>
        )}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {hover !== null ? (
          <>
            <strong>{dates[hover]}</strong>
            {series.map((s) => (
              <span key={s.key}>
                {s.label}: {s.values[hover] === null ? "—" : formatY(s.values[hover] as number)}
              </span>
            ))}
          </>
        ) : (
          <span className="muted">Hover or focus the chart and use ← → to read daily values.</span>
        )}
      </div>
    </div>
  );
}
