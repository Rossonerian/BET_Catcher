import assert from "node:assert/strict";

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function inr(v) {
  return v === null || v === undefined ? "—" : inr0.format(v);
}

function inrCompact(v) {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)} k`;
  return inr0.format(v);
}

function pct(v, digits = 1) {
  return v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
}

function signed(v, digits, suffix) {
  const r = Number(v.toFixed(digits));
  if (r === 0) return `${(0).toFixed(digits)}${suffix}`;
  return `${r > 0 ? "+" : ""}${r.toFixed(digits)}${suffix}`;
}

function change(v, kind) {
  if (v === null || v === undefined) return "—";
  return kind === "share" ? signed(v * 100, 1, " pp") : signed(v * 100, 1, "%");
}

function humanize(s) {
  if (!s) return "—";
  return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

// 1. inr formatting
assert.equal(inr(null), "—");
assert.equal(inr(undefined), "—");
assert.match(inr(9999), /9,999/);

// 2. inrCompact scales
assert.equal(inrCompact(21000000), "₹2.10 Cr");
assert.equal(inrCompact(320000), "₹3.2 L");
assert.equal(inrCompact(4500), "₹4.5 k");

// 3. pct and change contract
assert.equal(pct(0.155), "15.5%");
assert.equal(change(0.12, "share"), "+12.0 pp");
assert.equal(change(-0.05, "ratio"), "-5.0%");
assert.equal(change(0, "share"), "0.0 pp");

// 4. humanize
assert.equal(humanize("ESCALATE_INVESTIGATION"), "Escalate investigation");
assert.equal(humanize("ANALYST_REVIEW"), "Analyst review");
assert.equal(humanize(""), "—");

console.log("All frontend format smoke tests passed cleanly.");
