import { useState } from "react";
import type { Lead, NetworkEdge, NetworkGraph, NetworkNode } from "../api";
import { KIND_COLOR, KIND_LABEL, TIER_LABEL, humanize, inr, pct } from "../format";
import { Badge, Section } from "./common";

const W = 960;
const ROW = 62;
const X_FOCUS = 170;
const X_BEN = 480;
const X_OTHER = 760;

type MerchantNode = Extract<NetworkNode, { type: "merchant" }>;
type BenNode = Extract<NetworkNode, { type: "beneficiary" }>;

function edgeKey(e: NetworkEdge) {
  return `${e.source}->${e.target}`;
}

function NetworkGraphSvg({ graph, onSelect, selected }: { graph: NetworkGraph; onSelect: (e: NetworkEdge) => void; selected: string | null }) {
  const focusId = graph.focus;
  const merchants = graph.nodes.filter((n): n is MerchantNode => n.type === "merchant");
  const bens = graph.nodes.filter((n): n is BenNode => n.type === "beneficiary");
  const leadIds = new Set(graph.leads.map((l) => l.beneficiary_id));
  const focusShare = new Map(graph.edges.filter((e) => e.source === focusId).map((e) => [e.target, e.share_recent]));

  const benOrder = [...bens].sort((a, b) => {
    const la = leadIds.has(a.id) ? 0 : 1;
    const lb = leadIds.has(b.id) ? 0 : 1;
    if (la !== lb) return la - lb;
    return (focusShare.get(b.id) ?? 0) - (focusShare.get(a.id) ?? 0);
  });
  const benIndex = new Map(benOrder.map((b, i) => [b.id, i]));

  const others = merchants.filter((m) => m.id !== focusId);
  const otherRank = (m: MerchantNode) => {
    const idx = graph.edges.filter((e) => e.source === m.id).map((e) => benIndex.get(e.target) ?? 99);
    return Math.min(...idx, 99);
  };
  const otherOrder = [...others].sort((a, b) => otherRank(a) - otherRank(b) || a.label.localeCompare(b.label));

  const rows = Math.max(benOrder.length, otherOrder.length, 1);
  const H = rows * ROW + 40;
  const colY = (i: number, count: number) => 30 + (H - 40 - count * ROW) / 2 + i * ROW + ROW / 2;

  const pos = new Map<string, { x: number; y: number }>();
  const focus = merchants.find((m) => m.id === focusId);
  if (focus) pos.set(focus.id, { x: X_FOCUS, y: H / 2 });
  benOrder.forEach((b, i) => pos.set(b.id, { x: X_BEN, y: colY(i, benOrder.length) }));
  otherOrder.forEach((m, i) => pos.set(m.id, { x: X_OTHER, y: colY(i, otherOrder.length) }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="net-svg" role="group" aria-label="Merchant–beneficiary network around the focus merchant">
      <text x={X_FOCUS} y={16} textAnchor="middle" className="flow-col">
        Focus merchant
      </text>
      <text x={X_BEN} y={16} textAnchor="middle" className="flow-col">
        Settlement beneficiaries
      </text>
      <text x={X_OTHER + 50} y={16} textAnchor="middle" className="flow-col">
        Other merchants (same payee)
      </text>
      {graph.edges.map((e) => {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) return null;
        const k = edgeKey(e);
        const lead = leadIds.has(e.target);
        const mx = (a.x + b.x) / 2;
        const d = `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
        const label = `${e.source} → ${e.target}: ${humanize(e.relationship)}; source of record: ${e.source_of_record}; recent ${inr(e.amount_recent)} (${pct(e.share_recent)} of payer's settlements); first seen ${e.first_seen}${e.new_in_recent ? "; new in recent window" : ""}`;
        return (
          <g
            key={k}
            className={`net-edge${selected === k ? " selected" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={label}
            onClick={() => onSelect(e)}
            onFocus={() => onSelect(e)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onSelect(e);
              }
            }}
          >
            <title>{label}</title>
            <path d={d} className="net-edge-hit" />
            <path
              d={d}
              fill="none"
              style={{ stroke: lead ? "var(--accent)" : "var(--chart-peer)" }}
              strokeWidth={1.5 + Math.min(e.share_recent, 0.5) * 16}
              strokeOpacity={lead ? 0.75 : 0.55}
              strokeDasharray={e.new_in_recent ? undefined : "5 4"}
            />
          </g>
        );
      })}
      {benOrder.map((b) => {
        const p = pos.get(b.id)!;
        const risky = b.kind === "individual" || b.kind === "unknown";
        return (
          <g key={b.id}>
            <title>{`${b.label} — ${KIND_LABEL[b.kind]}`}</title>
            <rect
              x={p.x - 9}
              y={p.y - 9}
              width={18}
              height={18}
              rx={3}
              style={{ fill: KIND_COLOR[b.kind], stroke: "var(--text)" }}
              strokeWidth={risky ? 2 : 0}
              strokeDasharray={b.kind === "unknown" ? "3 2" : undefined}
            />
            <text x={p.x} y={p.y - 14} textAnchor="middle" className="net-label halo">
              {b.label}
            </text>
            {leadIds.has(b.id) && (
              <text x={p.x} y={p.y + 22} textAnchor="middle" className="net-sublabel halo">
                lead · {KIND_LABEL[b.kind]}
              </text>
            )}
          </g>
        );
      })}
      {merchants.map((m) => {
        const p = pos.get(m.id);
        if (!p) return null;
        const isFocus = m.id === focusId;
        return (
          <g key={m.id}>
            <title>{`${m.label} — ${TIER_LABEL[m.tier]}${m.anomalous_features.length ? `; anomalous: ${m.anomalous_features.join(", ")}` : ""}`}</title>
            <circle
              cx={p.x}
              cy={p.y}
              r={isFocus ? 16 : 10}
              style={{ fill: isFocus ? "var(--text)" : "var(--card)", stroke: "var(--text)" }}
              strokeWidth={isFocus ? 2 : 1.5}
            />
            <text
              x={isFocus ? p.x : p.x + 16}
              y={isFocus ? p.y + 34 : p.y + 4}
              textAnchor={isFocus ? "middle" : "start"}
              className={`net-label halo${isFocus ? " net-focus" : ""}`}
            >
              {m.label}
            </text>
            {isFocus && (
              <text x={p.x} y={p.y + 50} textAnchor="middle" className="net-sublabel halo">
                {TIER_LABEL[m.tier]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LeadCard({ lead, benign }: { lead: Lead; benign?: boolean }) {
  return (
    <div className={`lead-card${benign ? " benign" : ""}`}>
      <div className="lead-head">
        <strong>{lead.label}</strong>
        <span className="mono small muted">{lead.beneficiary_id}</span>
        <span className={`kind kind-${lead.kind}`}>{KIND_LABEL[lead.kind]}</span>
        {lead.corroborating && <Badge tone="warn">Corroborating pattern</Badge>}
      </div>
      <dl className="kv-inline">
        <dt>Relationship</dt>
        <dd>{lead.relationship}</dd>
        <dt>Source of record</dt>
        <dd>{lead.source_of_record}</dd>
        <dt>Focus merchant's recent share</dt>
        <dd>{pct(lead.focus_share_recent)}</dd>
      </dl>
      <p className="lead-interp">{lead.interpretation}</p>
      <table className="table table-compact">
        <thead>
          <tr>
            <th scope="col">Linked merchant</th>
            <th scope="col">First seen</th>
            <th scope="col" className="num">
              Recent share
            </th>
            <th scope="col">Similar pattern</th>
          </tr>
        </thead>
        <tbody>
          {lead.linked_merchants.map((m) => (
            <tr key={m.id}>
              <th scope="row">
                {m.name} <span className="muted small">({humanize(m.category)})</span>
              </th>
              <td>{m.first_seen}</td>
              <td className="num">{pct(m.share_recent)}</td>
              <td>
                {m.similar_pattern ? (
                  <span title={m.anomalous_features.join(", ")}>Yes — {m.anomalous_features.join(", ")}</span>
                ) : (
                  <span className="muted">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NetworkPanel({ graph }: { graph: NetworkGraph }) {
  const [sel, setSel] = useState<NetworkEdge | null>(null);
  const combos = Array.from(new Set(graph.edges.map((e) => `${humanize(e.relationship)} · source of record: ${e.source_of_record}`)));
  const nodeLabel = new Map(graph.nodes.map((n) => [n.id, n.label]));

  return (
    <Section
      title="Network — leads, not findings"
      subtitle={graph.note}
    >
      <div className="net-legend">
        <span className="legend-item">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" strokeWidth="1.5" style={{ fill: "var(--card)", stroke: "var(--text)" }} />
          </svg>
          Merchant
        </span>
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
          <span className="legend-item" key={k}>
            <span className="legend-swatch" style={{ background: KIND_COLOR[k] }} aria-hidden="true" />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="legend-item">
          <span className="legend-line lead-line" aria-hidden="true" /> Edge to a lead beneficiary
        </span>
        <span className="legend-item">
          <span className="legend-line dashed-line" aria-hidden="true" /> Established before recent window (solid = new)
        </span>
      </div>
      {graph.edges.length === 0 ? (
        <p className="muted">No settlement links for this merchant.</p>
      ) : (
        <NetworkGraphSvg graph={graph} onSelect={setSel} selected={sel ? edgeKey(sel) : null} />
      )}
      <div className="edge-detail" aria-live="polite">
        {sel ? (
          <>
            <strong>
              {nodeLabel.get(sel.source) ?? sel.source} → {nodeLabel.get(sel.target) ?? sel.target}
            </strong>
            <span>Relationship: {humanize(sel.relationship)}</span>
            <span>Source of record: {sel.source_of_record}</span>
            <span>
              Recent {inr(sel.amount_recent)} ({pct(sel.share_recent)}) · total {inr(sel.amount_total)}
            </span>
            <span>First seen {sel.first_seen}</span>
            {sel.new_in_recent && <Badge tone="warn">New in recent window</Badge>}
          </>
        ) : (
          <span className="muted">
            Select or tab to an edge for details. All edges: {combos.join("; ") || "—"}.
          </span>
        )}
      </div>

      <h4 className="sub-head">Leads ({graph.leads.length})</h4>
      {graph.leads.length === 0 ? (
        <p className="muted">No leads for this merchant.</p>
      ) : (
        graph.leads.map((l) => <LeadCard key={l.beneficiary_id} lead={l} />)
      )}
      <h4 className="sub-head">Benign shared links ({graph.benign_links.length})</h4>
      {graph.benign_links.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        graph.benign_links.map((l) => <LeadCard key={l.beneficiary_id} lead={l} benign />)
      )}
    </Section>
  );
}
