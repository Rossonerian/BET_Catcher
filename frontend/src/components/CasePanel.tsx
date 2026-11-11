import { useState } from "react";
import type { FormEvent } from "react";
import { CASE_STATUSES, api } from "../api";
import type { CaseBundle, CaseStatus } from "../api";
import { dateTime, humanize } from "../format";
import { Badge, ErrorBox, Section } from "./common";

export function CasePanel({
  merchantId,
  bundle,
  actor,
  onChanged,
}: {
  merchantId: string;
  bundle: CaseBundle;
  actor: string;
  onChanged: () => void;
}) {
  const c = bundle.case;
  const [status, setStatus] = useState<CaseStatus>("UNDER_REVIEW");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!c) return;
    if (await run(() => api.caseAction(c.id, { action: "CHANGE_STATUS", actor, note: reason.trim(), status }))) setReason("");
  };
  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!c) return;
    if (await run(() => api.caseAction(c.id, { action: "ADD_NOTE", actor, note: note.trim() }))) setNote("");
  };

  if (!c) {
    return (
      <Section title="Case" subtitle="No case is open for this merchant.">
        {error && <ErrorBox error={error} />}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => api.openCase(merchantId, actor))}>
          {busy ? "Opening…" : "Open case"}
        </button>
      </Section>
    );
  }

  return (
    <Section
      title="Case decision"
      subtitle="Record a proportionate decision. Every status change needs a reason and is written to the audit trail."
    >
      <div className="case-head">
        <span className="mono">{c.id}</span>
        <Badge tone="info">{humanize(c.status)}</Badge>
        <span className="muted small">
          opened {dateTime(c.opened_at)} · updated {dateTime(c.updated_at)}
        </span>
      </div>
      <form className="form" onSubmit={changeStatus}>
        <div className="form-row">
          <label>
            <span>New status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as CaseStatus)}>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            <span>Reason (required, ≥ 3 characters)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Catering verified; overnight payments unresolved"
            />
          </label>
          <button type="submit" className="btn btn-primary align-end" disabled={busy || reason.trim().length < 3}>
            Change status
          </button>
        </div>
      </form>
      <form className="form" onSubmit={addNote}>
        <div className="form-row">
          <label className="grow">
            <span>Analyst note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the case" />
          </label>
          <button type="submit" className="btn align-end" disabled={busy || note.trim().length < 3}>
            Add note
          </button>
        </div>
      </form>
      {error && <ErrorBox error={error} />}
      <h6>Notes ({c.notes.length})</h6>
      {c.notes.length === 0 ? (
        <p className="muted small">No notes yet.</p>
      ) : (
        <ul className="notes">
          {c.notes.map((n, i) => (
            <li key={i}>
              <span className="muted small">
                {dateTime(n.ts)} · {n.actor}
              </span>
              <div>{n.note}</div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
