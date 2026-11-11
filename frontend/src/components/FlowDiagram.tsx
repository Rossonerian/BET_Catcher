import type { BeneficiaryKind, SankeyLink, SankeyNode } from "../api";
import { inrCompact } from "../format";

const W = 960;
const BASE_H = 300;
const NODE_W = 14;
const GAP = 8;
const SLOT_MIN = 34; // minimum vertical slot per node so two-line labels never overlap
const PAD_TOP = 34;
const PAD_BOTTOM = 12;
const X_SRC = 255;
const X_MER = 465;
const X_BEN = 650;

interface Props {
  nodes: SankeyNode[];
  links: SankeyLink[];
  colorFor: (id: string, kind?: BeneficiaryKind) => string;
  accounted: Set<string>;
}

const SOURCE_COLOR: Record<string, string> = {
  "SRC-RETAIL": "#2e7d4f",
  "SRC-DECLARED": "#3567b5",
  "SRC-HIGHVALUE": "#a46a00",
  "SRC-OFFHOURS": "#b42318",
};

function band(x0: number, y0a: number, y0b: number, x1: number, y1a: number, y1b: number) {
  const mx = (x0 + x1) / 2;
  return `M${x0},${y0a} C${mx},${y0a} ${mx},${y1a} ${x1},${y1a} L${x1},${y1b} C${mx},${y1b} ${mx},${y0b} ${x0},${y0b} Z`;
}

/** Hand-drawn three-column flow: payment sources → merchant → settlement beneficiaries. */
export function FlowDiagram({ nodes, links, colorFor, accounted }: Props) {
  const merchant = nodes.find((n) => n.type === "merchant");
  if (!merchant) return <p className="muted">No flow data.</p>;
  const sources = nodes.filter((n) => n.type === "source");
  const bens = nodes.filter((n) => n.type === "beneficiary");
  const valueOf = (s: string, t: string) => links.find((l) => l.source === s && l.target === t)?.value ?? 0;
  const inVals = sources.map((s) => valueOf(s.id, merchant.id));
  const outVals = bens.map((b) => valueOf(merchant.id, b.id));
  const inTotal = inVals.reduce((a, b) => a + b, 0);
  const outTotal = outVals.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(sources.length, bens.length, 1);
  const k = (BASE_H - GAP * (maxCount - 1)) / Math.max(inTotal, outTotal, 1);
  const slot = (v: number) => Math.max(v * k, SLOT_MIN);
  const colHeight = (vals: number[]) => vals.reduce((a, v) => a + slot(v), 0) + GAP * Math.max(vals.length - 1, 0);
  const innerH = Math.max(colHeight(inVals), colHeight(outVals), Math.max(inTotal, outTotal) * k);
  const H = innerH + PAD_TOP + PAD_BOTTOM;
  const midY = PAD_TOP + innerH / 2;

  // Stack nodes in a column, centred vertically; the bar is drawn at the top of its slot centre.
  const stack = (vals: number[]) => {
    let y = midY - colHeight(vals) / 2;
    return vals.map((v) => {
      const sl = slot(v);
      const h = Math.max(v * k, 2);
      const r = { y: y + (sl - h) / 2, h };
      y += sl + GAP;
      return r;
    });
  };
  const srcPos = stack(inVals);
  const benPos = stack(outVals);
  const merH = Math.max(inTotal, outTotal) * k;
  const merY = midY - merH / 2;

  let inCursor = merY + (merH - inTotal * k) / 2;
  let outCursor = merY + (merH - outTotal * k) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="flow-svg" role="img" aria-label="Payment sources to merchant to settlement beneficiaries, recent window">
      {sources.map((s, i) => {
        const h = inVals[i] * k;
        const y0 = srcPos[i].y;
        const y1 = inCursor;
        inCursor += h;
        const c = SOURCE_COLOR[s.id] ?? "#6b7280";
        return (
          <g key={s.id}>
            <path d={band(X_SRC + NODE_W, y0, y0 + h, X_MER, y1, y1 + h)} fill={c} opacity={0.28}>
              <title>{`${s.label} → ${merchant.label}: ${inrCompact(inVals[i])}`}</title>
            </path>
            <rect x={X_SRC} y={y0} width={NODE_W} height={srcPos[i].h} fill={c} />
            <text x={X_SRC - 8} y={y0 + srcPos[i].h / 2 - 3} textAnchor="end" className="flow-label">
              {s.label}
            </text>
            <text x={X_SRC - 8} y={y0 + srcPos[i].h / 2 + 12} textAnchor="end" className="flow-value">
              {inrCompact(inVals[i])}
            </text>
          </g>
        );
      })}
      {bens.map((b, i) => {
        const h = outVals[i] * k;
        const y0 = outCursor;
        const y1 = benPos[i].y;
        outCursor += h;
        const c = colorFor(b.id, b.kind);
        const isNew = !!b.new;
        return (
          <g key={b.id}>
            <path d={band(X_MER + NODE_W, y0, y0 + h, X_BEN, y1, y1 + h)} fill={c} opacity={isNew ? 0.45 : 0.25}>
              <title>{`${merchant.label} → ${b.label}: ${inrCompact(outVals[i])}`}</title>
            </path>
            <rect
              x={X_BEN}
              y={y1}
              width={NODE_W}
              height={benPos[i].h}
              fill={c}
              stroke={isNew ? "#111827" : "none"}
              strokeWidth={isNew ? 1.5 : 0}
            />
            <text x={X_BEN + NODE_W + 8} y={y1 + benPos[i].h / 2 - 3} className="flow-label">
              {b.label}
              {isNew ? "  · NEW" : ""}
            </text>
            <text x={X_BEN + NODE_W + 8} y={y1 + benPos[i].h / 2 + 12} className="flow-value">
              {inrCompact(outVals[i])}
              {accounted.has(b.id) ? " · accounted by declaration" : ""}
            </text>
          </g>
        );
      })}
      <rect x={X_MER} y={merY} width={NODE_W} height={merH} fill="#1f2937" />
      <text x={X_SRC - 8} y={16} textAnchor="end" className="flow-col">
        Payment sources
      </text>
      <text x={X_MER + NODE_W / 2} y={16} textAnchor="middle" className="flow-col">
        {merchant.label}
      </text>
      <text x={X_BEN + NODE_W + 8} y={16} className="flow-col">
        Settlement beneficiaries
      </text>
    </svg>
  );
}
