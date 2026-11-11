import type { AuditEvent } from "../api";
import { dateTime, humanize } from "../format";
import { Section } from "./common";

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length ? v.map(renderValue).join(", ") : "none";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditTimeline({ audit }: { audit: AuditEvent[] }) {
  const events = [...audit].sort((a, b) => b.id - a.id);
  return (
    <Section title={`Audit trail (${audit.length})`} subtitle="Append-only record of every event for this merchant, newest first.">
      {events.length === 0 ? (
        <p className="muted">No audit events.</p>
      ) : (
        <ol className="timeline">
          {events.map((e) => (
            <li key={e.id} className={`tl-item tl-${e.event_type.toLowerCase()}`}>
              <div className="tl-head">
                <strong>{humanize(e.event_type)}</strong>
                <span className="muted small">
                  #{e.id} · {dateTime(e.ts)} · {e.actor}
                </span>
              </div>
              <dl className="kv-inline small">
                {Object.entries(e.detail).map(([k, v]) => (
                  <div key={k} className="kv-pair">
                    <dt>{humanize(k)}</dt>
                    <dd>{renderValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
