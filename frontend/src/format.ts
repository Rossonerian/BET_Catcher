import type { BeneficiaryKind, Range, Tier } from "./api";

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function inr(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : inr0.format(v);
}

/** Compact INR, e.g. ₹31.5 L / ₹2.1 Cr, for chart axes and flow labels. */
export function inrCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)} k`;
  return inr0.format(v);
}

export function number(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(v);
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
}

function signed(v: number, digits: number, suffix: string): string {
  const r = Number(v.toFixed(digits));
  if (r === 0) return `${(0).toFixed(digits)}${suffix}`;
  return `${r > 0 ? "+" : ""}${r.toFixed(digits)}${suffix}`;
}

/** Change formatting per contract: share kind → percentage points, ratio kind → relative %. */
export function change(v: number | null | undefined, kind: string): string {
  if (v === null || v === undefined) return "—";
  return kind === "share" ? signed(v * 100, 1, " pp") : signed(v * 100, 1, "%");
}

/** Feature value formatting by unit. */
export function featureValue(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return "—";
  if (unit === "share") return pct(v, 1);
  if (unit === "INR") return inr(v);
  return num.format(v);
}

export function zScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const r = Number(v.toFixed(1));
  return (r === 0 ? 0 : r).toFixed(1);
}

export function hour(h: number | null): string {
  return h === null ? "?" : `${String(h).padStart(2, "0")}:00`;
}

export function hoursRange(r: Range): string {
  return r[0] === null && r[1] === null ? "not declared" : `${hour(r[0])}–${hour(r[1])}`;
}

export function ticketRange(r: Range): string {
  return r[0] === null && r[1] === null ? "not declared" : `${inr(r[0])}–${inr(r[1])}`;
}

export function dateTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function humanize(s: string): string {
  if (!s) return "—";
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const TIER_ORDER: Tier[] = [
  "PASSIVE_MONITORING",
  "ENHANCED_MONITORING",
  "REQUEST_CLARIFICATION",
  "ANALYST_REVIEW",
  "ESCALATE_INVESTIGATION",
];

export const TIER_LABEL: Record<Tier, string> = {
  PASSIVE_MONITORING: "Passive monitoring",
  ENHANCED_MONITORING: "Enhanced monitoring",
  REQUEST_CLARIFICATION: "Request clarification",
  ANALYST_REVIEW: "Analyst review",
  ESCALATE_INVESTIGATION: "Escalate to investigation",
};

/** CSS class suffix for tier colouring (see styles.css .tier-*). */
export function tierClass(t: Tier): string {
  return `tier-${t.toLowerCase().replace(/_/g, "-")}`;
}

/** Tier colours for SVG fills (kept in sync with styles.css variables). */
export const TIER_COLOR: Record<Tier, string> = {
  PASSIVE_MONITORING: "#2e7d4f",
  ENHANCED_MONITORING: "#3567b5",
  REQUEST_CLARIFICATION: "#a46a00",
  ANALYST_REVIEW: "#c2410c",
  ESCALATE_INVESTIGATION: "#b42318",
};

export const KIND_LABEL: Record<BeneficiaryKind, string> = {
  merchant_primary: "Merchant primary a/c",
  supplier: "Supplier",
  professional_services: "Professional services",
  individual: "Individual a/c",
  unknown: "Unknown owner",
};

export const KIND_COLOR: Record<BeneficiaryKind, string> = {
  merchant_primary: "#2e7d4f",
  supplier: "#3567b5",
  professional_services: "#6b5ca5",
  individual: "#b42318",
  unknown: "#7a6a00",
};
