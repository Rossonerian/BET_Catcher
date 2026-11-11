import type { Assessment, PeerFeature } from "../api";
import { change } from "../format";
import { PositionBadge, Section } from "./common";

function RangeBar({ f }: { f: PeerFeature }) {
  const lo = Math.min(f.peer_lower_bound, f.merchant_change, 0);
  const hi = Math.max(f.peer_upper_bound, f.merchant_change, 0);
  const span = hi - lo || 1;
  const pos = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <div className="rangebar" aria-hidden="true">
      <div
        className="rb-band"
        style={{ left: pos(f.peer_lower_bound), width: `${((f.peer_upper_bound - f.peer_lower_bound) / span) * 100}%` }}
      />
      <div className="rb-zero" style={{ left: pos(0) }} />
      <div className="rb-median" style={{ left: pos(f.peer_median_change) }} />
      <div className={`rb-dot pos-dot-${f.position.toLowerCase()}`} style={{ left: pos(f.merchant_change) }} />
    </div>
  );
}

export function PeerPanel({ assessment }: { assessment: Assessment }) {
  const { peer, behaviour } = assessment;
  const meta = new Map(behaviour.features.map((f) => [f.feature, f]));
  return (
    <Section
      title="Peer context"
      subtitle="Is the change specific to this merchant, or shared by comparable merchants?"
    >
      <div className="cohort-box">
        <div>
          <span className="cohort-size">{peer.cohort.size}</span>
          <span className="cohort-size-label">peers in cohort</span>
        </div>
        <div>
          <div className="small muted">Cohort definition</div>
          <div>{peer.cohort.definition}</div>
          <div className="small muted mono">{peer.cohort.member_ids.join(", ")}</div>
        </div>
      </div>
      {peer.status !== "OK" ? (
        <div className="caveat" role="note">
          <strong>Peer comparison unavailable ({peer.status.replace(/_/g, " ").toLowerCase()}).</strong> {peer.caveat}
        </div>
      ) : (
        <p className="note">{peer.caveat}</p>
      )}
      {peer.features.length > 0 && (
        <div className="table-scroll">
          <table className="table table-num">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Merchant change</th>
                <th scope="col">Peer median change</th>
                <th scope="col">Peer upper bound</th>
                <th scope="col" className="col-range">
                  Peer range <span className="muted small">(band = peer bounds, | = median, ● = merchant)</span>
                </th>
                <th scope="col">Position</th>
              </tr>
            </thead>
            <tbody>
              {peer.features.map((f) => {
                const m = meta.get(f.feature);
                const kind = m?.kind ?? "ratio";
                return (
                  <tr key={f.feature} className={f.position === "EXCEEDS_PEERS" ? "row-flag" : undefined}>
                    <th scope="row">{m?.label ?? f.feature}</th>
                    <td>{change(f.merchant_change, kind)}</td>
                    <td>{change(f.peer_median_change, kind)}</td>
                    <td>{change(f.peer_upper_bound, kind)}</td>
                    <td className="col-range">
                      <RangeBar f={f} />
                    </td>
                    <td>
                      <PositionBadge position={f.position} />
                      <div className="muted small">n={f.n}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
