import type { Assessment, BenShare, BeneficiaryKind } from "../api";
import { KIND_COLOR, KIND_LABEL, inr, inrCompact, pct } from "../format";
import { FlowDiagram } from "./FlowDiagram";
import { Badge, Section } from "./common";

/** Stable colour per beneficiary: kind colour, lightened for the 2nd/3rd beneficiary of the same kind. */
function makeColorFor(ids: { id: string; kind?: BeneficiaryKind }[]) {
  const seen = new Map<string, number>();
  const map = new Map<string, string>();
  const shades = [1, 0.7, 0.5, 0.35];
  for (const { id, kind } of ids) {
    if (map.has(id)) continue;
    const k = kind ?? "unknown";
    const idx = seen.get(k) ?? 0;
    seen.set(k, idx + 1);
    map.set(id, mix(KIND_COLOR[k], shades[Math.min(idx, shades.length - 1)]));
  }
  return (id: string, kind?: BeneficiaryKind) => map.get(id) ?? KIND_COLOR[kind ?? "unknown"];
}

function mix(hex: string, strength: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * strength + 255 * (1 - strength)));
  return `rgb(${ch.join(",")})`;
}

function StackedBar({
  label,
  total,
  shares,
  colorFor,
  newIds,
}: {
  label: string;
  total: number;
  shares: BenShare[];
  colorFor: (id: string, kind?: BeneficiaryKind) => string;
  newIds: Set<string>;
}) {
  return (
    <div className="sbar-row">
      <div className="sbar-label">
        <strong>{label}</strong>
        <span className="muted small">{inrCompact(total)} settled</span>
      </div>
      <div className="sbar" role="img" aria-label={`${label} settlement shares`}>
        {shares.map((s) => (
          <div
            key={s.beneficiary_id}
            className={`sbar-seg${newIds.has(s.beneficiary_id) ? " sbar-new" : ""}`}
            style={{ width: `${s.share * 100}%`, background: colorFor(s.beneficiary_id, s.kind) }}
            title={`${s.label}: ${inr(s.amount)} (${pct(s.share)})`}
          >
            {s.share >= 0.07 && <span>{pct(s.share, 0)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlowPanel({ assessment }: { assessment: Assessment }) {
  const f = assessment.flow;
  const all = [...f.baseline.shares, ...f.recent.shares];
  const colorFor = makeColorFor(all.map((s) => ({ id: s.beneficiary_id, kind: s.kind })));
  const newIds = new Set(f.new_beneficiaries.map((n) => n.beneficiary_id));
  const accounted = new Set(f.accounted_beneficiaries);
  const legend = Array.from(new Map(all.map((s) => [s.beneficiary_id, s])).values());
  const np = f.non_primary_share;

  return (
    <Section title="Fund flow: where settlements go" subtitle="Settlement destinations, baseline window vs recent window.">
      <div className="flow-kpis">
        <div className="kpi">
          <div className="kpi-label">Non-primary settlement share</div>
          <div className="kpi-value">
            {pct(np.baseline)} → {pct(np.recent)}
          </div>
          <div className={`kpi-delta ${np.change_pp > 0.05 ? "delta-up" : ""}`}>
            {np.change_pp >= 0 ? "+" : ""}
            {(np.change_pp * 100).toFixed(1)} pp
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">New beneficiaries in recent window</div>
          <div className="kpi-value">{f.new_beneficiaries.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Primary beneficiary</div>
          <div className="kpi-value kpi-small mono">{f.primary_beneficiary}</div>
        </div>
      </div>

      <StackedBar label="Baseline" total={f.baseline.total} shares={f.baseline.shares} colorFor={colorFor} newIds={newIds} />
      <StackedBar label="Recent" total={f.recent.total} shares={f.recent.shares} colorFor={colorFor} newIds={newIds} />
      <div className="sbar-legend">
        {legend.map((s) => (
          <span key={s.beneficiary_id} className="legend-item">
            <span className="legend-swatch" style={{ background: colorFor(s.beneficiary_id, s.kind) }} aria-hidden="true" />
            {s.label}
            {newIds.has(s.beneficiary_id) && <Badge tone="warn">New</Badge>}
          </span>
        ))}
      </div>

      {f.new_beneficiaries.length > 0 && (
        <>
          <h4 className="sub-head">New beneficiaries</h4>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Beneficiary</th>
                <th scope="col">Kind</th>
                <th scope="col">First seen</th>
                <th scope="col" className="num">
                  Recent amount
                </th>
                <th scope="col" className="num">
                  Recent share
                </th>
                <th scope="col">Context</th>
              </tr>
            </thead>
            <tbody>
              {f.new_beneficiaries.map((n) => (
                <tr key={n.beneficiary_id} className={accounted.has(n.beneficiary_id) ? undefined : "row-flag"}>
                  <th scope="row">
                    {n.label} <span className="muted mono small">{n.beneficiary_id}</span>
                  </th>
                  <td>
                    <span className={`kind kind-${n.kind}`}>{KIND_LABEL[n.kind]}</span>
                  </td>
                  <td>{n.first_seen}</td>
                  <td className="num">{inr(n.amount)}</td>
                  <td className="num">{pct(n.share)}</td>
                  <td>
                    {accounted.has(n.beneficiary_id) ? (
                      <Badge tone="good">Covered by approved declaration</Badge>
                    ) : (
                      <Badge tone="warn">Unverified</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h4 className="sub-head">Source → merchant → beneficiary (recent window)</h4>
      <FlowDiagram nodes={f.sankey.nodes} links={f.sankey.links} colorFor={colorFor} accounted={accounted} />
    </Section>
  );
}
