import type { Tier } from "../api";
import { TIER_LABEL } from "../format";

/** Order of the recommendation tiers, lowest to highest. */
const STEPS: Tier[] = ["PASSIVE_MONITORING", "ENHANCED_MONITORING", "REQUEST_CLARIFICATION", "ANALYST_REVIEW", "ESCALATE_INVESTIGATION"];
/** Tiers that get the toned negative colour on their filled segments. */
const ALERT: Tier[] = ["ANALYST_REVIEW", "ESCALATE_INVESTIGATION"];

/** Five-step ladder showing how far a merchant sits up the recommendation tiers, followed by the label. */
export function TierLadder({ tier, label }: { tier: Tier; label?: string }) {
  const step = STEPS.indexOf(tier) + 1;
  const text = label ?? TIER_LABEL[tier];
  const alert = ALERT.includes(tier);
  return (
    <span className="tier" aria-label={`Tier: ${text}, step ${step} of ${STEPS.length}`} role="img">
      <span className="tier-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={`tier-seg${i < step ? (alert ? " on alert" : " on") : ""}`} />
        ))}
      </span>
      <span className="tier-label">{text}</span>
    </span>
  );
}
