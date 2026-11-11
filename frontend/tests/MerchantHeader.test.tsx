import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Assessment, MerchantProfile } from "../src/api";
import { MerchantHeader } from "../src/components/MerchantHeader";
import assessmentFixture from "../../docs/contracts/fixtures/assessment_sweetcrust_after.json";
import profileFixture from "../../docs/contracts/fixtures/merchant_profile.json";

describe("MerchantHeader", () => {
  const profile = profileFixture as unknown as MerchantProfile;
  const assessment = assessmentFixture as unknown as Assessment;

  it("shows the merchant name, review priority score, and recommendation tier", () => {
    render(<MerchantHeader profile={profile} assessment={assessment} />);

    expect(screen.getByRole("heading", { name: "Sweet Crust Bakery", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("M-SWEETCRUST")).toBeInTheDocument();

    // Risk score and tier badge
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("Analyst review")).toBeInTheDocument();

    // Declared information
    expect(screen.getByText("₹150–₹600")).toBeInTheDocument();
    expect(screen.getByText("07:00–21:00")).toBeInTheDocument();
  });
});
