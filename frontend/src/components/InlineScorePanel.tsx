import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { InlineScore } from "../api";
import { humanize, inr } from "../format";
import { Badge, ErrorBox, Section } from "./common";

const DEFAULTS = { amount: "9999", timestamp: "2026-11-10T01:15:00", customer: "C-WALKIN-DEMO" };

export function InlineScorePanel({ merchantId }: { merchantId: string }) {
  const [amount, setAmount] = useState(DEFAULTS.amount);
  const [timestamp, setTimestamp] = useState(DEFAULTS.timestamp);
  const [customer, setCustomer] = useState(DEFAULTS.customer);
  const [result, setResult] = useState<InlineScore | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [merchantId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.scoreTransaction({ merchant_id: merchantId, amount: Number(amount), timestamp, customer_id: customer.trim() }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Inline transaction indicators"
      subtitle="Score a single payment against this merchant's cached baseline. Indicators flag for review; they never decline a payment."
    >
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label>
            <span>Amount (₹)</span>
            <input type="number" min={1} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            <span>Timestamp (local, ISO)</span>
            <input required value={timestamp} onChange={(e) => setTimestamp(e.target.value)} pattern="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?.*" />
          </label>
          <label>
            <span>Customer ID</span>
            <input required value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary align-end" disabled={busy}>
            {busy ? "Scoring…" : "Score transaction"}
          </button>
        </div>
      </form>
      {error && <ErrorBox error={error} />}
      {result && (
        <div className="inline-result">
          <div className="ir-top">
            <Badge tone={result.action === "ALLOW_AND_LOG" ? "good" : "warn"}>{humanize(result.action)}</Badge>
            <span>
              Indicator score <strong>{result.indicator_score.toFixed(2)}</strong>
            </span>
            <span>
              Amount percentile vs baseline <strong>{result.amount_percentile.toFixed(1)}</strong>
            </span>
            <span className="muted small">Scorer: {result.scorer}</span>
          </div>
          <p className="small">
            {inr(Number(amount))} at {timestamp} · {result.decision_note}
          </p>
          {result.indicators.length === 0 ? (
            <p className="muted">No indicators raised.</p>
          ) : (
            <ul className="indicator-list">
              {result.indicators.map((i) => (
                <li key={i.id}>
                  <code>{i.id}</code> {i.detail}
                </li>
              ))}
            </ul>
          )}
          <div className="latency">
            <span className="latency-num">{result.latency_us.toFixed(1)} µs</span>
            <span className="latency-note">{result.latency_note}</span>
          </div>
        </div>
      )}
    </Section>
  );
}
