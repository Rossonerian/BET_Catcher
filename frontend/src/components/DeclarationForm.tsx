import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CHANGE_TYPES, EVIDENCE_KINDS, api } from "../api";
import type { ChangeType, DeclarationIn, EvidenceKind } from "../api";
import { humanize } from "../format";
import { X } from "lucide-react";
import { ErrorBox, Section } from "./common";

interface EvidenceRow {
  kind: EvidenceKind;
  reference: string;
  amount: string;
  counterparty: string;
}

interface FormState {
  change_type: ChangeType;
  description: string;
  effective_from: string;
  counterparties: string;
  ticket_min: string;
  ticket_max: string;
  hours_open: string;
  hours_close: string;
  new_close: string;
  beneficiary_ids: string;
  evidence: EvidenceRow[];
}

const EMPTY: FormState = {
  change_type: "CATERING",
  description: "",
  effective_from: "",
  counterparties: "",
  ticket_min: "",
  ticket_max: "",
  hours_open: "",
  hours_close: "",
  new_close: "",
  beneficiary_ids: "",
  evidence: [],
};

const optNum = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));
const list = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function toPayload(f: FormState): DeclarationIn {
  return {
    change_type: f.change_type,
    description: f.description.trim(),
    effective_from: f.effective_from,
    submitted_by: "merchant",
    params: {
      counterparties: list(f.counterparties),
      ticket_min: optNum(f.ticket_min),
      ticket_max: optNum(f.ticket_max),
      hours_open: optNum(f.hours_open),
      hours_close: optNum(f.hours_close),
      new_close: optNum(f.new_close),
      beneficiary_ids: list(f.beneficiary_ids),
    },
    evidence: f.evidence
      .filter((e) => e.reference.trim() !== "")
      .map((e) => ({
        kind: e.kind,
        reference: e.reference.trim(),
        amount: optNum(e.amount),
        counterparty: e.counterparty.trim() || undefined,
      })),
  };
}

export function DeclarationForm({
  merchantId,
  onSubmitted,
}: {
  merchantId: string;
  onSubmitted: (declarationId: string) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setForm(EMPTY);
    setIsDemo(false);
    setError(null);
    setOk(null);
  }, [merchantId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setEv = (i: number, patch: Partial<EvidenceRow>) =>
    setForm((f) => ({ ...f, evidence: f.evidence.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  const loadDemo = async () => {
    setError(null);
    setOk(null);
    try {
      // Only DeclarationIn fields are copied into the form; the demo_only marker is dropped.
      const t = await api.declarationTemplate(merchantId);
      setForm({
        change_type: t.change_type,
        description: t.description,
        effective_from: t.effective_from,
        counterparties: (t.params.counterparties ?? []).join(", "),
        ticket_min: str(t.params.ticket_min),
        ticket_max: str(t.params.ticket_max),
        hours_open: str(t.params.hours_open),
        hours_close: str(t.params.hours_close),
        new_close: str(t.params.new_close),
        beneficiary_ids: (t.params.beneficiary_ids ?? []).join(", "),
        evidence: t.evidence.map((e) => ({
          kind: e.kind,
          reference: e.reference,
          amount: str(e.amount),
          counterparty: e.counterparty ?? "",
        })),
      });
      setIsDemo(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const d = await api.submitDeclaration(merchantId, toPayload(form));
      setOk(`Declaration ${d.id} submitted (status ${d.status}). It does not change the assessment until an analyst reviews it.`);
      setForm(EMPTY);
      setIsDemo(false);
      onSubmitted(d.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Merchant change declaration"
      subtitle="The merchant declares a material business change with evidence. Pending declarations never change the assessment."
      actions={
        <button type="button" className="btn btn-small btn-ghost" onClick={loadDemo}>
          Load demo example
        </button>
      }
    >
      {isDemo && (
        <p className="demo-flag" role="note">
          Demo data: prefilled from the seeded declaration template (synthetic). Review before submitting.
        </p>
      )}
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label>
            <span>Change type</span>
            <select value={form.change_type} onChange={(e) => set("change_type", e.target.value as ChangeType)}>
              {CHANGE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Effective from</span>
            <input type="date" required value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} />
          </label>
        </div>
        <label>
          <span>Description</span>
          <textarea
            required
            minLength={3}
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            <span>Counterparties (comma-separated)</span>
            <input value={form.counterparties} onChange={(e) => set("counterparties", e.target.value)} />
          </label>
          <label>
            <span>Beneficiary IDs (comma-separated)</span>
            <input value={form.beneficiary_ids} onChange={(e) => set("beneficiary_ids", e.target.value)} />
          </label>
        </div>
        <div className="form-row form-row-5">
          <label>
            <span>Ticket min (₹)</span>
            <input type="number" min={0} value={form.ticket_min} onChange={(e) => set("ticket_min", e.target.value)} />
          </label>
          <label>
            <span>Ticket max (₹)</span>
            <input type="number" min={0} value={form.ticket_max} onChange={(e) => set("ticket_max", e.target.value)} />
          </label>
          <label>
            <span>Hours open</span>
            <input type="number" min={0} max={23} value={form.hours_open} onChange={(e) => set("hours_open", e.target.value)} />
          </label>
          <label>
            <span>Hours close</span>
            <input type="number" min={0} max={24} value={form.hours_close} onChange={(e) => set("hours_close", e.target.value)} />
          </label>
          <label>
            <span>New close hour</span>
            <input type="number" min={0} max={24} value={form.new_close} onChange={(e) => set("new_close", e.target.value)} />
          </label>
        </div>

        <fieldset className="evidence-fs">
          <legend>Evidence ({form.evidence.length})</legend>
          {form.evidence.length > 0 && (
            <div className="evidence-rows">
              {form.evidence.map((e, i) => (
                <div key={i} className="evidence-row">
                  <select aria-label={`Evidence ${i + 1} kind`} value={e.kind} onChange={(x) => setEv(i, { kind: x.target.value as EvidenceKind })}>
                    {EVIDENCE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {humanize(k)}
                      </option>
                    ))}
                  </select>
                  <input aria-label={`Evidence ${i + 1} reference`} placeholder="Reference" value={e.reference} onChange={(x) => setEv(i, { reference: x.target.value })} />
                  <input aria-label={`Evidence ${i + 1} amount`} placeholder="Amount ₹" type="number" min={0} value={e.amount} onChange={(x) => setEv(i, { amount: x.target.value })} />
                  <input aria-label={`Evidence ${i + 1} counterparty`} placeholder="Counterparty" value={e.counterparty} onChange={(x) => setEv(i, { counterparty: x.target.value })} />
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    aria-label={`Remove evidence ${i + 1}`}
                    onClick={() => setForm((f) => ({ ...f, evidence: f.evidence.filter((_, j) => j !== i) }))}
                  >
                    <X className="icon" aria-hidden="true" size={16} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => setForm((f) => ({ ...f, evidence: [...f.evidence, { kind: "invoice", reference: "", amount: "", counterparty: "" }] }))}
          >
            + Add evidence
          </button>
        </fieldset>

        {error && <ErrorBox error={error} />}
        {ok && (
          <p className="ok-box" role="status">
            {ok}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit declaration"}
          </button>
        </div>
      </form>
    </Section>
  );
}
