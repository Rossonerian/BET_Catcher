import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Assessment } from "../src/api";
import { SignalsPanel } from "../src/components/SignalsPanel";
import assessmentFixture from "../../docs/contracts/fixtures/assessment_sweetcrust_after.json";

describe("SignalsPanel", () => {
  const assessment = assessmentFixture as unknown as Assessment;

  it("renders signal resolutions from the Sweet Crust assessment fixture", () => {
    render(<SignalsPanel assessment={assessment} />);

    // Section title
    expect(screen.getByRole("heading", { name: /Signals and explanations/i })).toBeInTheDocument();

    // Resolution badges
    expect(screen.getByText("Unresolved")).toBeInTheDocument();
    expect(screen.getByText("Partially explained")).toBeInTheDocument();
    expect(screen.getByText("Explained")).toBeInTheDocument();

    // Group counts
    expect(screen.getByText(/8 signals/i)).toBeInTheDocument();
    expect(screen.getByText(/1 signal/i)).toBeInTheDocument();
    expect(screen.getByText(/3 signals/i)).toBeInTheDocument();

    // Specific signal cards
    expect(
      screen.getByRole("heading", { name: "Revenue share from high-value payments changed versus own baseline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "New settlement beneficiary: R. Varma (individual a/c)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Receipts diverted away from the business account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Daily transactions changed versus own baseline" }),
    ).toBeInTheDocument();
  });

  it("renders competing hypotheses section", () => {
    render(<SignalsPanel assessment={assessment} />);

    expect(screen.getByRole("heading", { name: /Competing hypotheses/i })).toBeInTheDocument();
    expect(screen.getByText("Corporate catering or bulk orders")).toBeInTheDocument();
    expect(screen.getByText("Seasonal or festival demand shared with peers")).toBeInTheDocument();
    expect(screen.getByText("Account used for activity inconsistent with the declared business")).toBeInTheDocument();
  });
});
