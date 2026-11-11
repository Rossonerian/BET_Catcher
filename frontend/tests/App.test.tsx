import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

import assessmentFixture from "../../docs/contracts/fixtures/assessment_sweetcrust_after.json";
import caseFixture from "../../docs/contracts/fixtures/case_sweetcrust.json";
import declTemplateFixture from "../../docs/contracts/fixtures/declaration_template.json";
import profileFixture from "../../docs/contracts/fixtures/merchant_profile.json";
import merchantsFixture from "../../docs/contracts/fixtures/merchants.json";
import networkFixture from "../../docs/contracts/fixtures/network_sweetcrust.json";
import timeseriesFixture from "../../docs/contracts/fixtures/timeseries_sweetcrust.json";

describe("App smoke test", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        let data: unknown = {};
        if (url.endsWith("/merchants") || url.includes("/api/merchants?")) {
          data = merchantsFixture;
        } else if (url.includes("/assessment")) {
          data = assessmentFixture;
        } else if (url.includes("/timeseries")) {
          data = timeseriesFixture;
        } else if (url.includes("/case")) {
          data = caseFixture;
        } else if (url.includes("/declaration-template")) {
          data = declTemplateFixture;
        } else if (url.includes("/network")) {
          data = networkFixture;
        } else if (url.includes("/merchants/")) {
          data = profileFixture;
        }

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify(data),
          json: async () => data,
        } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders <App/> with mock fetch and asserts the merchant queue lists Sweet Crust", async () => {
    render(<App />);

    // Topbar brand
    expect(screen.getByText("VERITY")).toBeInTheDocument();

    // Wait for the merchant queue to populate
    const queue = await screen.findByRole("complementary", { name: /Merchant review queue/i });
    expect(queue).toBeInTheDocument();

    // Verify Sweet Crust Bakery is listed in the queue
    const sweetCrustQueueItem = await within(queue).findByText("Sweet Crust Bakery");
    expect(sweetCrustQueueItem).toBeInTheDocument();

    // Verify additional merchants in the queue
    expect(within(queue).getByText("Golden Oven Bakes")).toBeInTheDocument();
    expect(within(queue).getByText("Midnight Snacks Co.")).toBeInTheDocument();

    // Verify merchant header renders selected merchant
    expect(await screen.findByRole("heading", { name: "Sweet Crust Bakery", level: 1 })).toBeInTheDocument();
  });
});
