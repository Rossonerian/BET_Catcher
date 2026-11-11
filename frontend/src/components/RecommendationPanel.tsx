import type { Assessment } from "../api";
import { humanize } from "../format";
import { List, ResolutionBadge, Section, TierBadge } from "./common";

export function RecommendationPanel({ assessment }: { assessment: Assessment }) {
  const rec = assessment.recommendation;
  const breakdown = assessment.risk.score_breakdown;
  const maxRaw = Math.max(...breakdown.map((b) => b.raw_points), 1);
  return (
    <Section title="Recommendation" subtitle="Graduated, proportionate response. Recommendations only — a human decides.">
      <div className="rec-grid">
        <div>
          <div className="rec-tier">
            <TierBadge tier={rec.tier} />
            {rec.requires_human_approval ? (
              <span className="badge tone-warn">Requires human approval</span>
            ) : (
              <span className="badge tone-neutral">No approval step needed</span>
            )}
          </div>
          <h6>Suggested actions</h6>
          <List items={rec.actions} />
          <h6>Rationale</h6>
          <List items={rec.rationale} />
          <div className="not-permitted">
            <h6>Not permitted</h6>
            <List items={rec.not_permitted} />
          </div>
        </div>
        <div>
          <h6>Score breakdown by theme</h6>
          {breakdown.length === 0 ? (
            <p className="muted small">No scored signals.</p>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col">Theme</th>
                  <th scope="col">Points</th>
                  <th scope="col">Signal</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.signal_id}>
                    <th scope="row">{humanize(b.theme)}</th>
                    <td>
                      <div className="pts">
                        <div className="pts-track">
                          <div className="pts-raw" style={{ width: `${(b.raw_points / maxRaw) * 100}%` }} />
                          <div className="pts-fill" style={{ width: `${(b.points / maxRaw) * 100}%` }} />
                        </div>
                        <span className="pts-num">
                          {b.points}
                          {b.points !== b.raw_points && <span className="muted"> / {b.raw_points} raw</span>}
                        </span>
                      </div>
                    </td>
                    <td>
                      <ResolutionBadge resolution={b.resolution} />
                      <div className="mono small muted">{b.signal_id}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Explained signals keep their raw points for transparency but contribute 0 to the score.</p>
        </div>
      </div>
    </Section>
  );
}
