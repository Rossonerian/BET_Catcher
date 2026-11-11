import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { applyTheme, getInitialTheme } from "../src/theme";

import assessmentFixture from "../../docs/contracts/fixtures/assessment_sweetcrust_after.json";
import caseFixture from "../../docs/contracts/fixtures/case_sweetcrust.json";
import declTemplateFixture from "../../docs/contracts/fixtures/declaration_template.json";
import profileFixture from "../../docs/contracts/fixtures/merchant_profile.json";
import merchantsFixture from "../../docs/contracts/fixtures/merchants.json";
import networkFixture from "../../docs/contracts/fixtures/network_sweetcrust.json";
import timeseriesFixture from "../../docs/contracts/fixtures/timeseries_sweetcrust.json";

// Node 22+ ships its own experimental localStorage global that shadows jsdom's and reads as undefined.
// Swap in an in-memory Storage only when the one we got is unusable, so the test sees real storage semantics.
if (typeof window.localStorage?.clear !== "function") {
  const items = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (k) => (items.has(k) ? (items.get(k) as string) : null),
    key: (i) => Array.from(items.keys())[i] ?? null,
    removeItem: (k) => {
      items.delete(k);
    },
    setItem: (k, v) => {
      items.set(k, String(v));
    },
  };
  Object.defineProperty(window, "localStorage", { value: memory, configurable: true });
}

/** Fake the system colour scheme: window.matchMedia is absent in jsdom unless a test provides it. */
function setSystemDark(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function resetTheme() {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
}

describe("theme toggle in the topbar", () => {
  beforeEach(() => {
    resetTheme();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        let data: unknown = {};
        if (url.endsWith("/merchants") || url.includes("/api/merchants?")) data = merchantsFixture;
        else if (url.includes("/assessment")) data = assessmentFixture;
        else if (url.includes("/timeseries")) data = timeseriesFixture;
        else if (url.includes("/case")) data = caseFixture;
        else if (url.includes("/declaration-template")) data = declTemplateFixture;
        else if (url.includes("/network")) data = networkFixture;
        else if (url.includes("/merchants/")) data = profileFixture;
        return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(data), json: async () => data } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetTheme();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("flips data-theme and persists the choice each time it is clicked", async () => {
    render(<App />);
    await screen.findByRole("complementary", { name: /Merchant review queue/i });

    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("verity-theme")).toBe("dark");

    const back = screen.getByRole("button", { name: "Switch to light theme" });
    expect(back).toHaveAttribute("title", "Switch to light theme");
    fireEvent.click(back);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("verity-theme")).toBe("light");
  });

  it("starts in the stored theme and keeps the existing topbar content", async () => {
    window.localStorage.setItem("verity-theme", "dark");
    render(<App />);
    await screen.findByRole("complementary", { name: /Merchant review queue/i });

    expect(document.documentElement.dataset.theme).toBe("dark");
    const topbar = document.querySelector(".topbar");
    if (!(topbar instanceof HTMLElement)) throw new Error("topbar not rendered");
    expect(within(topbar).getByText("Synthetic demo data")).toBeInTheDocument();
    expect(within(topbar).getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});

describe("getInitialTheme", () => {
  beforeEach(resetTheme);
  afterEach(() => {
    resetTheme();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("honours a stored light or dark value over the system preference", () => {
    setSystemDark(true);
    window.localStorage.setItem("verity-theme", "light");
    expect(getInitialTheme()).toBe("light");

    setSystemDark(false);
    window.localStorage.setItem("verity-theme", "dark");
    expect(getInitialTheme()).toBe("dark");
  });

  it("falls back to matchMedia when nothing valid is stored", () => {
    setSystemDark(true);
    expect(getInitialTheme()).toBe("dark");

    setSystemDark(false);
    expect(getInitialTheme()).toBe("light");

    setSystemDark(true);
    window.localStorage.setItem("verity-theme", "blue");
    expect(getInitialTheme()).toBe("dark");
  });

  it("uses light when matchMedia is unavailable (jsdom)", () => {
    expect(getInitialTheme()).toBe("light");
  });

  it("applyTheme sets data-theme and persists only when asked to", () => {
    applyTheme("dark", false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("verity-theme")).toBeNull();

    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("verity-theme")).toBe("light");
  });
});
