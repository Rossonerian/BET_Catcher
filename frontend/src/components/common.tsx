import type { ReactNode } from "react";
import type { PeerPosition, Resolution, Severity, Tier } from "../api";
import { humanize } from "../format";
import { TierLadder } from "./TierLadder";

export function TierBadge({ tier, label }: { tier: Tier; label?: string }) {
  return <TierLadder tier={tier} label={label} />;
}

const RESOLUTION_LABEL: Record<Resolution, string> = {
  UNRESOLVED: "Unresolved",
  PARTIALLY_EXPLAINED: "Partially explained",
  EXPLAINED: "Explained",
};

export function ResolutionBadge({ resolution }: { resolution: Resolution }) {
  return <span className={`badge res-${resolution.toLowerCase().replace(/_/g, "-")}`}>{RESOLUTION_LABEL[resolution]}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`sev sev-${severity}`}>{humanize(severity)} severity</span>;
}

const POSITION_LABEL: Record<PeerPosition, string> = {
  IN_LINE: "In line with peers",
  EXCEEDS_PEERS: "Exceeds peers",
  BELOW_PEERS: "Below peers",
};

export function PositionBadge({ position }: { position: PeerPosition }) {
  return <span className={`badge pos-${position.toLowerCase().replace(/_/g, "-")}`}>{POSITION_LABEL[position]}</span>;
}

/** Quiet status: a small dot in the tone colour and plain text. */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

/** Meta line of quiet text items separated by middots; empty items are skipped. */
export function MetaLine({ items }: { items: (ReactNode | null | false | undefined)[] }) {
  const shown = items.filter((i) => i !== null && i !== undefined && i !== false);
  return (
    <p className="meta-line">
      {shown.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="meta-sep" aria-hidden="true"> · </span>}
          {item}
        </span>
      ))}
    </p>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <strong>Request failed.</strong> <span>{error}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      Loading {what}…
    </div>
  );
}

export function Section({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="panel-sub">{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Horizontal 0..1 meter; deliberately rendered separately from the review-priority score. */
export function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const pctVal = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tone = pctVal >= 80 ? "good" : pctVal >= 50 ? "mid" : "low";
  return (
    <div className="meter" title={hint}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">{pctVal}%</span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctVal}
      >
        <div className={`meter-fill meter-${tone}`} style={{ width: `${pctVal}%` }} />
      </div>
      <div className="meter-hint">{hint}</div>
    </div>
  );
}

export function List({ items, empty = "None" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <ul className="plain-list">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
