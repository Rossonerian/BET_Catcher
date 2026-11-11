import type { MerchantSummary } from "../api";
import { humanize, pct } from "../format";
import { ErrorBox, Loading, TierBadge } from "./common";

interface Props {
  merchants: MerchantSummary[] | null;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReset: () => void;
  resetting: boolean;
  onRetry: () => void;
}

export function MerchantQueue({ merchants, error, selectedId, onSelect, onReset, resetting, onRetry }: Props) {
  return (
    <aside className="queue" aria-label="Merchant review queue">
      <div className="queue-head">
        <div>
          <h2>Review queue</h2>
          <p className="muted small">Sorted by review priority</p>
        </div>
        <button type="button" className="btn btn-small btn-ghost" onClick={onReset} disabled={resetting}>
          {resetting ? "Resetting…" : "Reset demo"}
        </button>
      </div>
      {error && <ErrorBox error={error} onRetry={onRetry} />}
      {!merchants && !error && <Loading what="merchants" />}
      {merchants && (
        <ul className="queue-list">
          {merchants.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`queue-item${m.id === selectedId ? " selected" : ""}`}
                onClick={() => onSelect(m.id)}
                aria-current={m.id === selectedId ? "true" : undefined}
              >
                <div className="qi-top">
                  <span className="qi-name">{m.name}</span>
                  <span className="qi-score" title="Review priority score (0–100)">
                    {Math.round(m.risk_score)}
                  </span>
                </div>
                <div className="qi-tier">
                  <TierBadge tier={m.tier} label={m.tier_label} />
                </div>
                <div className="qi-meta">
                  <span title="Model confidence">conf {pct(m.model_confidence, 0)}</span>
                  <span title="Data completeness">data {pct(m.data_completeness, 0)}</span>
                  <span title="Unresolved or partially explained signals" className={m.unresolved_signal_count ? "qi-unres" : ""}>
                    {m.unresolved_signal_count} unresolved
                  </span>
                </div>
                <div className="qi-meta">
                  <span>{humanize(m.category)}</span>
                  {m.lifecycle_stage !== "ESTABLISHED" && <span className="qi-life">{humanize(m.lifecycle_stage)}</span>}
                  <span className="qi-case">{m.case_status ? `Case: ${humanize(m.case_status)}` : "No case"}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
