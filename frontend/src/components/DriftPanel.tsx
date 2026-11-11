import { useMemo, useState } from "react";
import type { Assessment, MerchantProfile, Timeseries } from "../api";
import { change, featureValue, inrCompact, number, zScore } from "../format";
import { LineChart } from "./LineChart";
import type { ChartSeries } from "./LineChart";
import { Badge, Section } from "./common";

const PREFERRED = ["night_share", "daytime_avg_ticket", "txn_count", "repeated_amount_share", "high_value_share"];

function asNum(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

export function DriftPanel({
  assessment,
  timeseries,
  profile,
}: {
  assessment: Assessment;
  timeseries: Timeseries;
  profile: MerchantProfile;
}) {
  const options = useMemo(() => {
    const byId = new Map(timeseries.features.map((f) => [f.feature, f]));
    const first = PREFERRED.filter((f) => byId.has(f)).map((f) => byId.get(f)!);
    const rest = timeseries.features.filter((f) => !PREFERRED.includes(f.feature));
    return [...first, ...rest];
  }, [timeseries]);
  const [feature, setFeature] = useState<string>(options[0]?.feature ?? "night_share");
  const meta = options.find((o) => o.feature === feature) ?? options[0];

  const days = timeseries.days;
  const dates = days.map((d) => d.date);
  const value = days.map((d) => asNum(d[feature]));
  const residual = days.map((d) => asNum(d[`${feature}_residual`]));
  const peer = days.map((d) => asNum(d[`${feature}_peer_median`]));
  const residualDiffers = residual.some((r, i) => r !== null && value[i] !== null && Math.abs(r - (value[i] as number)) > 1e-9);

  const series: ChartSeries[] = [
    { key: "merchant", label: `${assessment.merchant_name} (daily)`, color: "var(--accent)", area: true, values: value },
    {
      key: "peer",
      label: `Peer median (n=${timeseries.peer_cohort_size})`,
      color: "var(--chart-peer)",
      dashed: true,
      values: peer,
    },
  ];
  if (residualDiffers) {
    series.push({
      key: "residual",
      label: "Residual (after approved declaration)",
      color: "var(--text-2)",
      values: residual,
    });
  }

  const recentIndex = timeseries.recent_start ? dates.indexOf(timeseries.recent_start) : -1;
  const approved = profile.declarations.filter((d) => d.status === "APPROVED");
  const markerDate = approved.length > 0 ? approved.map((d) => d.effective_from).sort()[0] : null;
  const markerIndex = markerDate ? dates.findIndex((d) => d >= markerDate) : -1;

  const unit = meta?.unit ?? "count";
  const formatY =
    unit === "share"
      ? (v: number) => `${(v * 100).toFixed(v * 100 < 10 && v !== 0 ? 1 : 0)}%`
      : unit === "INR"
        ? inrCompact
        : (v: number) => number(v, 1);

  const b = assessment.behaviour;
  const showResidual = b.accounted_transactions > 0;

  return (
    <Section
      title="Behaviour drift vs own baseline"
      subtitle={
        b.status === "OK"
          ? `Baseline ${b.baseline_days} days → recent ${b.recent_days} days. Robust statistics (median / MAD) against this merchant's own history.`
          : "Insufficient history for drift comparison. Lack of history is not treated as a risk factor."
      }
      actions={
        <label className="inline-field">
          <span>Feature</span>
          <select value={feature} onChange={(e) => setFeature(e.target.value)}>
            {options.map((o) => (
              <option key={o.feature} value={o.feature}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {days.length === 0 ? (
        <p className="muted">No daily data available.</p>
      ) : (
        <LineChart
          dates={dates}
          series={series}
          recentIndex={recentIndex >= 0 ? recentIndex : null}
          markerIndex={markerIndex >= 0 ? markerIndex : null}
          markerLabel={markerDate ? `Declaration effective ${markerDate}` : undefined}
          formatY={formatY}
          ariaLabel={`${meta?.label ?? feature} per day for ${assessment.merchant_name}, with peer median`}
        />
      )}

      <h4 className="sub-head">Behaviour features</h4>
      {showResidual && (
        <p className="note">
          {b.accounted_transactions} transaction(s) accounted for by approved declaration(s){" "}
          {Object.entries(b.accounted_by_declaration)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")}
          . Residual columns exclude them.
        </p>
      )}
      <div className="table-scroll">
        <table className="table table-num">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Baseline</th>
              <th scope="col">Recent</th>
              <th scope="col">Change</th>
              <th scope="col">Robust z</th>
              {showResidual && (
                <>
                  <th scope="col">Residual recent</th>
                  <th scope="col">Residual change</th>
                  <th scope="col">Residual z</th>
                </>
              )}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {b.features.map((f) => {
              const anomalous = showResidual ? f.is_anomalous_residual : f.is_anomalous;
              return (
                <tr key={f.feature} className={anomalous ? "row-flag" : undefined}>
                  <th scope="row">{f.label}</th>
                  <td>{featureValue(f.baseline_reference, f.unit)}</td>
                  <td>{featureValue(f.recent_value, f.unit)}</td>
                  <td>{change(f.change, f.kind)}</td>
                  <td>{zScore(f.z)}</td>
                  {showResidual && (
                    <>
                      <td>{featureValue(f.recent_residual_value, f.unit)}</td>
                      <td>{change(f.change_residual, f.kind)}</td>
                      <td>{zScore(f.z_residual)}</td>
                    </>
                  )}
                  <td className="cell-text">
                    {f.z === null ? (
                      <Badge>Not assessable</Badge>
                    ) : anomalous ? (
                      <Badge tone="warn">Drift</Badge>
                    ) : showResidual && f.is_anomalous ? (
                      <Badge tone="good">Explained by declaration</Badge>
                    ) : (
                      <Badge tone="good">Within baseline</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Share features: change in percentage points (pp). Count and ₹ features: relative change (%).</p>
    </Section>
  );
}
