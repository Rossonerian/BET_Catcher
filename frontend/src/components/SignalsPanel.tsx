import type { Assessment, Hypothesis, HypothesisStatus, Resolution, Signal } from "../api";
import { featureValue, humanize, zScore } from "../format";
import { Badge, List, PositionBadge, ResolutionBadge, Section, SeverityBadge } from "./common";

const GROUPS: { key: Resolution; hint: string }[] = [
  { key: "UNRESOLVED", hint: "No legitimate explanation accepted yet — needs analyst attention." },
  { key: "PARTIALLY_EXPLAINED", hint: "Part of the change is accounted for; the remainder is unresolved." },
  { key: "EXPLAINED", hint: "Accounted for by peer context or an approved declaration; contributes no score." },
];

const STATUS_TONE: Record<HypothesisStatus, string> = {
  SUPPORTED: "strong",
  PARTIALLY_SUPPORTED: "mid",
  PENDING_REVIEW: "info",
  PLAUSIBLE_UNTESTED: "info",
  NOT_SUPPORTED: "neutral",
};

function SignalCard({ s, unit, hypTitle }: { s: Signal; unit: string; hypTitle: (id: string) => string }) {
  const st = s.statistic;
  const fmt = (v: number | null | undefined) => featureValue(v ?? null, unit);
  return (
    <article className={`signal-card res-border-${s.resolution.toLowerCase().replace(/_/g, "-")}`}>
      <header className="signal-head">
        <h5>{s.title}</h5>
        <div className="badges">
          <SeverityBadge severity={s.severity} />
          <Badge>{humanize(s.theme)}</Badge>
          {s.peer_position && <PositionBadge position={s.peer_position} />}
        </div>
      </header>
      <p>{s.description}</p>
      {(st.baseline !== null || st.observed !== null) && (
        <p className="small stat-line">
          baseline {fmt(st.baseline)} → observed {fmt(st.observed)}
          {st.z !== null && <> · z {zScore(st.z)}</>}
          {st.observed_residual !== undefined && st.observed_residual !== null && st.observed_residual !== st.observed && (
            <>
              {" "}
              · residual {fmt(st.observed_residual)} (z {zScore(st.z_residual ?? null)})
            </>
          )}
        </p>
      )}
      <div className="evidence">
        {s.evidence.map((e, i) => (
          <div key={i} className="evidence-item">
            <span className="ev-type">{humanize(e.type)}</span>
            <span>{e.detail}</span>
            <span className="ev-refs">
              {e.ref.split(",").map((r) => (
                <code key={r}>{r.trim()}</code>
              ))}
            </span>
          </div>
        ))}
      </div>
      {s.explained_by.length > 0 && (
        <p className="small explained-by">
          Explained by:{" "}
          {s.explained_by.map((id) => (
            <span key={id} className="chip">
              {id}
              {hypTitle(id) && <span className="muted"> — {hypTitle(id)}</span>}
            </span>
          ))}
        </p>
      )}
      <p className="mono small muted">{s.id}</p>
    </article>
  );
}

function HypothesisCard({ h }: { h: Hypothesis }) {
  return (
    <article className={`hyp-card hyp-${h.kind.toLowerCase()}`}>
      <header className="signal-head">
        <h5>
          <span className="hyp-kind">{h.kind === "CONCERN" ? "Concern" : "Legitimate explanation"}</span> {h.title}
        </h5>
        <Badge tone={STATUS_TONE[h.status]}>{humanize(h.status)}</Badge>
      </header>
      {h.note && <p className="hyp-note">{h.note}</p>}
      <div className="hyp-cols">
        <div>
          <h6>Supporting</h6>
          <List items={h.supporting} />
        </div>
        <div>
          <h6>Contradicting</h6>
          <List items={h.contradicting} />
        </div>
        <div>
          <h6>Evidence gaps</h6>
          <List items={h.gaps} />
        </div>
      </div>
      {h.explains.length > 0 && (
        <p className="small muted">
          {h.kind === "CONCERN" ? "Would account for" : "Explains"}: {h.explains.join(", ")}
        </p>
      )}
      <p className="mono small muted">{h.id}</p>
    </article>
  );
}

export function SignalsPanel({ assessment }: { assessment: Assessment }) {
  const hyps = new Map(assessment.hypotheses.map((h) => [h.id, h.title]));
  const hypTitle = (id: string) => hyps.get(id) ?? "";
  // Behaviour signals use their feature's unit; flow and network statistics are settlement shares.
  const units = new Map(assessment.behaviour.features.map((f) => [f.feature, f.unit as string]));
  const unitFor = (s: Signal) => (s.feature && units.has(s.feature) ? units.get(s.feature)! : "share");
  return (
    <>
      <Section
        title="Signals and explanations"
        subtitle="Each signal lists its statistic and the records behind it. Signals are review prompts, not findings."
      >
        {assessment.signals.length === 0 && <p className="muted">No signals for this merchant.</p>}
        {GROUPS.map((g) => {
          const items = assessment.signals.filter((s) => s.resolution === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="signal-group">
              <h4 className="sub-head">
                <ResolutionBadge resolution={g.key} /> {items.length} signal{items.length === 1 ? "" : "s"}
                <span className="muted small"> — {g.hint}</span>
              </h4>
              <div className="signal-grid">
                {items.map((s) => (
                  <SignalCard key={s.id} s={s} unit={unitFor(s)} hypTitle={hypTitle} />
                ))}
              </div>
            </div>
          );
        })}
      </Section>
      <Section
        title="Competing hypotheses"
        subtitle="Legitimate explanations are tested alongside the concern. Each lists supporting and contradicting evidence and what is still missing."
      >
        {assessment.hypotheses.length === 0 ? (
          <p className="muted">No hypotheses generated (no signals to explain).</p>
        ) : (
          <div className="hyp-list">
            {assessment.hypotheses.map((h) => (
              <HypothesisCard key={h.id} h={h} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
