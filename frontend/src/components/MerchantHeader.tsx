import type { Assessment, MerchantProfile } from "../api";
import { hoursRange, humanize, ticketRange } from "../format";
import { Meter, TierBadge } from "./common";

function rangesDiffer(a: [number | null, number | null], b: [number | null, number | null]) {
  return a[0] !== b[0] || a[1] !== b[1];
}

export function MerchantHeader({ profile, assessment }: { profile: MerchantProfile; assessment: Assessment }) {
  const { risk, identity, windows } = assessment;
  const declared = identity.declared;
  const expected = identity.expected;
  const expectedDiffers =
    expected.updated_by.length > 0 ||
    rangesDiffer(expected.hours, declared.hours) ||
    rangesDiffer(expected.ticket_range, declared.ticket_range);

  return (
    <div className="mheader">
      <div className="mh-profile">
        <div className="mh-title">
          <h1>{profile.name}</h1>
          <span className="muted mono small">{profile.id}</span>
        </div>
        <p className="mh-desc">{declared.description}</p>
        <dl className="kv-grid">
          <dt>Category</dt>
          <dd>
            {humanize(declared.category)} · {humanize(declared.channel)} · {profile.region} · {profile.size_band}
          </dd>
          <dt>Declared hours</dt>
          <dd>{hoursRange(declared.hours)}</dd>
          <dt>Declared ticket</dt>
          <dd>{ticketRange(declared.ticket_range)}</dd>
          {expectedDiffers && (
            <>
              <dt>Expected profile</dt>
              <dd>
                {hoursRange(expected.hours)}, {ticketRange(expected.ticket_range)}
                {expected.updated_by.length > 0 && (
                  <span className="muted"> · updated by {expected.updated_by.join(", ")}</span>
                )}
              </dd>
            </>
          )}
          <dt>Lifecycle</dt>
          <dd>
            {humanize(risk.lifecycle_stage)} · {risk.history_days} days of history · onboarded {profile.onboarded_on}
          </dd>
          <dt>Windows</dt>
          <dd>
            {windows.baseline ? `baseline ${windows.baseline.start} → ${windows.baseline.end}` : "no baseline yet"}
            {windows.recent && ` · recent ${windows.recent.start} → ${windows.recent.end}`}
          </dd>
        </dl>
      </div>

      <div className="mh-risk">
        <div className="score-box" aria-label="Review priority">
          <div className="score-label">Review priority</div>
          <div className="score-value">
            {Math.round(risk.score)}
            <span className="score-max">/100</span>
          </div>
          <TierBadge tier={risk.tier} label={risk.tier_label} />
          <div className="score-note">Prioritises human review — not a probability of wrongdoing</div>
        </div>
        <div className="meters">
          <Meter
            label="Model confidence"
            value={risk.model_confidence}
            hint="How much history supports the baseline. Separate from the score."
          />
          <Meter
            label="Data completeness"
            value={risk.data_completeness}
            hint="Share of expected records available. Missing data never raises the score."
          />
        </div>
      </div>

      <div className="mh-guard">
        <p className="disclaimer">{assessment.disclaimer}</p>
        {risk.caps_applied.length > 0 && (
          <div className="guard-block">
            <span className="guard-title">Caps applied</span>
            <ul>
              {risk.caps_applied.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {risk.completeness_notes.length > 0 && (
          <div className="guard-block">
            <span className="guard-title">Completeness notes</span>
            <ul>
              {risk.completeness_notes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="guard-block">
          <span className="guard-title">Not permitted</span>
          <ul>
            {assessment.recommendation.not_permitted.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
