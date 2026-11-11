import { useState } from "react";
import { api } from "../api";
import type { Declaration } from "../api";
import { dateTime, humanize, inr } from "../format";
import { AlertTriangle } from "lucide-react";
import { Badge, ErrorBox, Section } from "./common";

const STATUS_TONE = { PENDING: "info", APPROVED: "good", REJECTED: "warn" } as const;

function ReviewBox({ decl, actor, onReviewed }: { decl: Declaration; actor: string; onReviewed: () => void }) {
  const [reviewer, setReviewer] = useState(actor);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "APPROVED" | "REJECTED">(null);
  const [error, setError] = useState<string | null>(null);

  const review = async (decision: "APPROVED" | "REJECTED") => {
    setBusy(decision);
    setError(null);
    try {
      await api.reviewDeclaration(decl.id, { decision, reviewer: reviewer.trim(), note: note.trim() });
      onReviewed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const valid = reviewer.trim().length > 0 && note.trim().length >= 3;

  return (
    <div className="review-box">
      <h6>Analyst review</h6>
      {decl.match_preview && (
        <div className="preview-box">
          <div className="preview-title">
            Match preview: {decl.match_preview.matched_count} transaction(s) matched ({inr(decl.match_preview.matched_amount)})
          </div>
          {decl.match_preview.warnings && decl.match_preview.warnings.length > 0 && (
            <div className="preview-warnings">
              {decl.match_preview.warnings.map((w, i) => (
                <div key={i} className="preview-warning">
                  <AlertTriangle className="icon" aria-hidden="true" size={16} strokeWidth={1.5} />
                  <span>
                    <strong>Whitewash Warning:</strong> {w}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="form-row">
        <label>
          <span>Reviewer</span>
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
        </label>
        <label className="grow">
          <span>Review note (required, ≥ 3 characters)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Invoices match four corporate clients" />
        </label>
      </div>
      {error && <ErrorBox error={error} />}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" disabled={!valid || busy !== null} onClick={() => review("APPROVED")}>
          {busy === "APPROVED" ? "Approving…" : "Approve"}
        </button>
        <button type="button" className="btn btn-danger" disabled={!valid || busy !== null} onClick={() => review("REJECTED")}>
          {busy === "REJECTED" ? "Rejecting…" : "Reject"}
        </button>
        <span className="muted small">Review re-runs the assessment; approved evidence only explains matching activity.</span>
      </div>
    </div>
  );
}

export function DeclarationsList({
  declarations,
  actor,
  onReviewed,
}: {
  declarations: Declaration[];
  actor: string;
  onReviewed: () => void;
}) {
  return (
    <Section title={`Declarations (${declarations.length})`}>
      {declarations.length === 0 && <p className="muted">No declarations on file.</p>}
      {declarations.map((d) => {
        const evidenceTotal = d.evidence.reduce((a, e) => a + (e.amount ?? 0), 0);
        return (
          <article key={d.id} className="decl-card">
            <header className="signal-head">
              <h5>
                <span className="mono">{d.id}</span> · {humanize(d.change_type)} from {d.effective_from}
              </h5>
              <Badge tone={STATUS_TONE[d.status]}>{humanize(d.status)}</Badge>
            </header>
            <p>{d.description}</p>
            <dl className="kv-inline">
              <dt>Submitted</dt>
              <dd>
                {dateTime(d.submitted_at)} by {d.submitted_by}
              </dd>
              {d.params.counterparties && d.params.counterparties.length > 0 && (
                <>
                  <dt>Counterparties</dt>
                  <dd>{d.params.counterparties.join(", ")}</dd>
                </>
              )}
              {(d.params.ticket_min != null || d.params.ticket_max != null) && (
                <>
                  <dt>Ticket range</dt>
                  <dd>
                    {inr(d.params.ticket_min)}–{inr(d.params.ticket_max)}
                  </dd>
                </>
              )}
              {d.params.beneficiary_ids && d.params.beneficiary_ids.length > 0 && (
                <>
                  <dt>Beneficiaries</dt>
                  <dd>{d.params.beneficiary_ids.join(", ")}</dd>
                </>
              )}
              <dt>Evidence</dt>
              <dd>
                {d.evidence.length} item(s){evidenceTotal > 0 && `, ${inr(evidenceTotal)} total`}
              </dd>
              {d.reviewed_at && (
                <>
                  <dt>Reviewed</dt>
                  <dd>
                    {dateTime(d.reviewed_at)} by {d.reviewer}: “{d.review_note}”
                  </dd>
                </>
              )}
            </dl>
            {d.status === "PENDING" && <ReviewBox decl={d} actor={actor} onReviewed={onReviewed} />}
          </article>
        );
      })}
    </Section>
  );
}
