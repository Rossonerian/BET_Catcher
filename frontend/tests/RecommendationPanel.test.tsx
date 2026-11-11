import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Assessment } from "../src/api";
import { RecommendationPanel } from "../src/components/RecommendationPanel";
import assessmentSweetcrustAfter from "../../docs/contracts/fixtures/assessment_sweetcrust_after.json";
import assessmentSweetcrustBefore from "../../docs/contracts/fixtures/assessment_sweetcrust_before.json";

describe("RecommendationPanel", () => {
  it("shows the recommendation tier for analyst review", () => {
    const assessment = assessmentSweetcrustAfter as unknown as Assessment;
    render(<RecommendationPanel assessment={assessment} />);

    expect(screen.getByText("Analyst review")).toBeInTheDocument();
    expect(screen.getByText("Requires human approval")).toBeInTheDocument();
    expect(screen.getByText("Assign to an analyst for evidence review")).toBeInTheDocument();
    expect(screen.getByText("Automatic account restriction, closure or permanent ban")).toBeInTheDocument();
  });

  it("shows the recommendation tier for escalate investigation", () => {
    const assessment = assessmentSweetcrustBefore as unknown as Assessment;
    render(<RecommendationPanel assessment={assessment} />);

    expect(screen.getByText("Escalate to investigation")).toBeInTheDocument();
  });
});
