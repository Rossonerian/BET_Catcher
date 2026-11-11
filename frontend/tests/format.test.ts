import { describe, expect, it } from "vitest";
import { change, humanize, inr, inrCompact, pct } from "../src/format";

describe("format utilities", () => {
  it("inr formatting handles null, undefined, and numbers", () => {
    expect(inr(null)).toBe("—");
    expect(inr(undefined)).toBe("—");
    expect(inr(9999)).toMatch(/9,999/);
  });

  it("inrCompact scales appropriately across Cr, L, and k", () => {
    expect(inrCompact(21000000)).toBe("₹2.10 Cr");
    expect(inrCompact(320000)).toBe("₹3.2 L");
    expect(inrCompact(4500)).toBe("₹4.5 k");
  });

  it("pct and change follow contract", () => {
    expect(pct(0.155)).toBe("15.5%");
    expect(change(0.12, "share")).toBe("+12.0 pp");
    expect(change(-0.05, "ratio")).toBe("-5.0%");
    expect(change(0, "share")).toBe("0.0 pp");
  });

  it("humanize handles underscores, capitalization, and empty string", () => {
    expect(humanize("ESCALATE_INVESTIGATION")).toBe("Escalate investigation");
    expect(humanize("ANALYST_REVIEW")).toBe("Analyst review");
    expect(humanize("")).toBe("—");
  });
});
