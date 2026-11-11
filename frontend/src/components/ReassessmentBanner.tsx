import type { Assessment, AuditEvent, Tier } from "../api";
import { TIER_LABEL } from "../format";

function num(v: unknown): string {
  return typeof v === "number" ? String(Math.round(v)) : "?";
}
function tier(v: unknown): string {
  return typeof v === "string" && v in TIER_LABEL ? TIER_LABEL[v as Tier] : String(v ?? "?");
}

/** Before → after summary from the latest ASSESSMENT_UPDATED audit event. */
export function ReassessmentBanner({
  event,
  assessment,
  onDismiss,
}: {
  event: AuditEvent;
  assessment: Assessment | null;
  onDismiss: () => void;
}) {
  const d = event.detail;
  const explained = Array.isArray(d.newly_explained) ? (d.newly_explained as string[]) : [];
  const partial = Array.isArray(d.newly_partially_explained) ? (d.newly_partially_explained as string[]) : [];
  const titles = new Map((assessment?.signals ?? []).map((s) => [s.id, s.title]));
  const stillOpen = (assessment?.signals ?? []).filter((s) => s.resolution !== "EXPLAINED");
  return (
    <div className="banner" role="status" aria-live="polite">
      <div className="banner-main">
        <strong>Re-assessment</strong>
        <span className="banner-delta">
          Score {num(d.from_score)} → {num(d.to_score)}, {tier(d.from_tier)} → {tier(d.to_tier)}
        </span>
        {typeof d.reason === "string" && <span className="muted">({d.reason})</span>}
        <button type="button" className="btn btn-small btn-ghost banner-close" onClick={onDismiss} aria-label="Dismiss re-assessment banner">
          Dismiss
        </button>
      </div>
      <div className="banner-detail">
        <span>
          <strong>Newly explained:</strong>{" "}
          {explained.length ? explained.map((id) => titles.get(id) ?? id).join("; ") : "none"}
        </span>
        {partial.length > 0 && (
          <span>
            <strong>Newly partially explained:</strong> {partial.map((id) => titles.get(id) ?? id).join("; ")}
          </span>
        )}
        {assessment && (
          <span>
            <strong>Still unresolved or partial:</strong> {stillOpen.length} signal(s)
            {stillOpen.length > 0 && ` — ${stillOpen.slice(0, 4).map((s) => s.title).join("; ")}${stillOpen.length > 4 ? "; …" : ""}`}
          </span>
        )}
      </div>
    </div>
  );
}
