import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NetworkGraph } from "../src/api";
import { NetworkPanel } from "../src/components/NetworkPanel";
import networkFixture from "../../docs/contracts/fixtures/network_sweetcrust.json";

describe("NetworkPanel", () => {
  const graph = networkFixture as unknown as NetworkGraph;

  it("labels the shared-beneficiary link as a lead", () => {
    render(<NetworkPanel graph={graph} />);

    // Panel title and subtitle
    expect(screen.getByRole("heading", { name: /Network — leads, not findings/i })).toBeInTheDocument();

    // Leads section heading
    expect(screen.getByRole("heading", { name: "Leads (2)" })).toBeInTheDocument();

    // Shared beneficiary lead card
    const benX1Card = screen.getByText("BEN-X1").closest<HTMLElement>(".lead-card")!;
    expect(benX1Card).toBeInTheDocument();
    expect(within(benX1Card).getByText("R. Varma (individual a/c)")).toBeInTheDocument();

    // Labelled with relationship: shared settlement beneficiary
    expect(within(benX1Card).getByText("shared settlement beneficiary")).toBeInTheDocument();

    // Corroborating pattern badge and lead interpretation
    expect(within(benX1Card).getByText("Corroborating pattern")).toBeInTheDocument();
    expect(
      within(benX1Card).getByText(
        /This is an investigation lead; a shared beneficiary can have legitimate explanations\./i,
      ),
    ).toBeInTheDocument();

    // Benign shared links section
    expect(screen.getByRole("heading", { name: "Benign shared links (2)" })).toBeInTheDocument();
    expect(screen.getAllByText("LedgerWise Accounting LLP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deccan Flour Mills").length).toBeGreaterThan(0);
  });
});
