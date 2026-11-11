import type { Assessment } from "../api";
import { Section } from "./common";

function Consistency({ value }: { value: boolean | null }) {
  if (value === null) return <span className="check-na">Not assessable</span>;
  return value ? (
    <span className="check-ok" aria-label="Consistent">
      ✓ Consistent
    </span>
  ) : (
    <span className="check-bad" aria-label="Inconsistent">
      ✗ Inconsistent
    </span>
  );
}

export function IdentityPanel({ assessment }: { assessment: Assessment }) {
  const { checks } = assessment.identity;
  return (
    <Section
      title="Identity: declared vs observed"
      subtitle="These checks are context for the analyst; they are not added to the review-priority score."
    >
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Declared / norm</th>
            <th scope="col">Observed (recent window)</th>
            <th scope="col">Result</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} className={c.consistent === false ? "row-flag" : undefined}>
              <th scope="row">{c.check}</th>
              <td>{c.declared ?? "—"}</td>
              <td>{c.observed ?? "—"}</td>
              <td>
                <Consistency value={c.consistent} />
              </td>
              <td className="muted small">{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
