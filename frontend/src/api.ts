// Typed client for the VERITY API (docs/contracts/API.md, fixtures are ground truth).

export type Tier =
  | "PASSIVE_MONITORING"
  | "ENHANCED_MONITORING"
  | "REQUEST_CLARIFICATION"
  | "ANALYST_REVIEW"
  | "ESCALATE_INVESTIGATION";
export type Resolution = "EXPLAINED" | "PARTIALLY_EXPLAINED" | "UNRESOLVED";
export type Severity = "low" | "medium" | "high";
export type Theme = "VOLUME" | "TICKET_SIZE" | "TIMING" | "PAYMENT_PATTERN" | "REFUNDS" | "FUND_FLOW" | "NETWORK";
export type HypothesisStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "PENDING_REVIEW"
  | "PLAUSIBLE_UNTESTED"
  | "NOT_SUPPORTED";
export type Lifecycle = "ONBOARDING" | "EARLY" | "ESTABLISHED";
export type CaseStatus =
  | "OPEN"
  | "AWAITING_MERCHANT"
  | "UNDER_REVIEW"
  | "ENHANCED_MONITORING"
  | "ESCALATED"
  | "CLOSED_NO_ACTION";
export type ChangeType = "CATERING" | "BULK_ORDERS" | "EXTENDED_HOURS" | "NEW_SUPPLIER" | "NEW_OUTLET" | "ONLINE_DELIVERY";
export type BeneficiaryKind = "merchant_primary" | "supplier" | "professional_services" | "individual" | "unknown";
export type PeerPosition = "IN_LINE" | "EXCEEDS_PEERS" | "BELOW_PEERS";
export type EvidenceKind = "invoice" | "contract" | "purchase_order" | "photo" | "other";

export const CASE_STATUSES: CaseStatus[] = [
  "OPEN",
  "AWAITING_MERCHANT",
  "UNDER_REVIEW",
  "ENHANCED_MONITORING",
  "ESCALATED",
  "CLOSED_NO_ACTION",
];
export const CHANGE_TYPES: ChangeType[] = [
  "CATERING",
  "BULK_ORDERS",
  "EXTENDED_HOURS",
  "NEW_SUPPLIER",
  "NEW_OUTLET",
  "ONLINE_DELIVERY",
];
export const EVIDENCE_KINDS: EvidenceKind[] = ["invoice", "contract", "purchase_order", "photo", "other"];

export interface MerchantSummary {
  id: string;
  name: string;
  category: string;
  region: string;
  lifecycle_stage: Lifecycle;
  risk_score: number;
  tier: Tier;
  tier_label: string;
  model_confidence: number;
  data_completeness: number;
  unresolved_signal_count: number;
  case_status: CaseStatus | null;
}

export type Range = [number | null, number | null];

export interface DeclaredProfile {
  category: string;
  description: string;
  channel: string;
  hours: Range;
  ticket_range: Range;
}
export interface ExpectedProfile {
  hours: Range;
  ticket_range: Range;
  updated_by: string[];
}

export interface MerchantProfile {
  id: string;
  name: string;
  category: string;
  region: string;
  size_band: string;
  channel: string;
  description: string;
  declared_open: number | null;
  declared_close: number | null;
  declared_ticket_min: number | null;
  declared_ticket_max: number | null;
  primary_beneficiary: string;
  onboarded_on: string;
  declared: DeclaredProfile;
  expected: ExpectedProfile;
  declarations: Declaration[];
}

export interface Window {
  start: string;
  end: string;
  days: number;
}

export interface ScoreBreakdownItem {
  theme: Theme;
  points: number;
  raw_points: number;
  signal_id: string;
  resolution: Resolution;
}

export interface IdentityCheck {
  id: string;
  check: string;
  declared: string | null;
  observed: string | null;
  consistent: boolean | null;
  note: string;
}

export interface BehaviourFeature {
  feature: string;
  label: string;
  unit: "count" | "INR" | "share";
  kind: "ratio" | "share";
  direction: "up" | "down" | "both";
  theme: Theme;
  baseline_reference: number | null;
  baseline_scale: number | null;
  baseline_windows: number;
  recent_value: number | null;
  recent_residual_value: number | null;
  change: number | null;
  change_residual: number | null;
  z: number | null;
  z_residual: number | null;
  is_anomalous: boolean;
  is_anomalous_residual: boolean;
}

export interface PeerFeature {
  feature: string;
  merchant_change: number;
  peer_median_change: number;
  peer_upper_bound: number;
  peer_lower_bound: number;
  percentile: number;
  n: number;
  position: PeerPosition;
}

export interface BenShare {
  beneficiary_id: string;
  label: string;
  kind: BeneficiaryKind;
  amount: number;
  share: number;
}

export interface SankeyNode {
  id: string;
  label: string;
  type: "source" | "merchant" | "beneficiary";
  kind?: BeneficiaryKind;
  new?: boolean;
}
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface LinkedMerchant {
  id: string;
  name: string;
  category: string;
  similar_pattern: boolean;
  anomalous_features: string[];
  first_seen: string;
  share_recent: number;
}

export interface Lead {
  beneficiary_id: string;
  label: string;
  kind: BeneficiaryKind;
  relationship: string;
  source_of_record: string;
  focus_share_recent: number;
  interpretation: string;
  corroborating?: boolean;
  linked_merchants: LinkedMerchant[];
}

export interface Signal {
  id: string;
  engine: "behaviour" | "flow" | "network";
  theme: Theme;
  feature: string | null;
  title: string;
  description: string;
  severity: Severity;
  direction: "up" | "down";
  statistic: {
    baseline: number | null;
    observed: number | null;
    z: number | null;
    observed_residual?: number | null;
    z_residual?: number | null;
  };
  evidence: { type: string; ref: string; detail: string }[];
  peer_position?: PeerPosition | null;
  resolution: Resolution;
  explained_by: string[];
}

export interface Hypothesis {
  id: string;
  kind: "LEGITIMATE" | "CONCERN";
  title: string;
  status: HypothesisStatus;
  explains: string[];
  supporting: string[];
  contradicting: string[];
  gaps: string[];
  note?: string;
}

export interface Assessment {
  merchant_id: string;
  merchant_name: string;
  as_of: string;
  data_version: number;
  disclaimer: string;
  windows: { baseline: Window | null; recent: Window | null };
  risk: {
    score: number;
    tier: Tier;
    tier_label: string;
    model_confidence: number;
    data_completeness: number;
    completeness_notes: string[];
    score_breakdown: ScoreBreakdownItem[];
    caps_applied: string[];
    lifecycle_stage: Lifecycle;
    history_days: number;
  };
  recommendation: {
    tier: Tier;
    actions: string[];
    requires_human_approval: boolean;
    not_permitted: string[];
    rationale: string[];
  };
  identity: {
    declared: DeclaredProfile;
    expected: ExpectedProfile;
    scored: false;
    checks: IdentityCheck[];
  };
  behaviour: {
    status: "OK" | "INSUFFICIENT_HISTORY";
    baseline_days: number;
    recent_days: number;
    accounted_transactions: number;
    accounted_by_declaration: Record<string, number>;
    features: BehaviourFeature[];
  };
  peer: {
    status: "OK" | "INSUFFICIENT_COHORT" | "INSUFFICIENT_HISTORY";
    caveat: string;
    cohort: { definition: string; size: number; member_ids: string[] };
    features: PeerFeature[];
  };
  flow: {
    primary_beneficiary: string;
    baseline: { total: number; shares: BenShare[] };
    recent: { total: number; shares: BenShare[] };
    non_primary_share: { baseline: number; recent: number; change_pp: number };
    new_beneficiaries: (BenShare & { first_seen: string })[];
    accounted_beneficiaries: string[];
    sankey: { nodes: SankeyNode[]; links: SankeyLink[] };
  };
  network: { leads: Lead[]; benign_links: Lead[] };
  signals: Signal[];
  hypotheses: Hypothesis[];
}

export interface TimeseriesFeature {
  feature: string;
  label: string;
  unit: string;
  kind: string;
  direction: string;
}
export type TimeseriesDay = { date: string; window: "pre_onboarding" | "baseline" | "recent" } & Record<
  string,
  number | string | null
>;
export interface Timeseries {
  merchant_id: string;
  baseline_start: string | null;
  recent_start: string | null;
  peer_cohort_size: number;
  features: TimeseriesFeature[];
  days: TimeseriesDay[];
}

export type NetworkNode =
  | { id: string; type: "merchant"; label: string; category: string; anomalous_features: string[]; tier: Tier }
  | { id: string; type: "beneficiary"; label: string; kind: BeneficiaryKind };
export interface NetworkEdge {
  source: string;
  target: string;
  relationship: string;
  source_of_record: string;
  amount_total: number;
  amount_recent: number;
  share_recent: number;
  first_seen: string;
  new_in_recent: boolean;
}
export interface NetworkGraph {
  focus: string | null;
  note: string;
  leads: Lead[];
  benign_links: Lead[];
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface DeclarationParams {
  counterparties?: string[];
  ticket_min?: number | null;
  ticket_max?: number | null;
  hours_open?: number | null;
  hours_close?: number | null;
  new_close?: number | null;
  beneficiary_ids?: string[];
}
export interface EvidenceItem {
  kind: EvidenceKind;
  reference: string;
  amount?: number | null;
  counterparty?: string | null;
}
export interface DeclarationIn {
  change_type: ChangeType;
  description: string;
  effective_from: string;
  submitted_by?: string;
  params: DeclarationParams;
  evidence: EvidenceItem[];
}
export type DeclarationTemplate = DeclarationIn & { demo_only: true };
export interface Declaration extends DeclarationIn {
  id: string;
  merchant_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  submitted_by: string;
  reviewed_at: string | null;
  reviewer: string | null;
  review_note: string | null;
}

export interface CaseNote {
  ts: string;
  actor: string;
  note: string;
}
export interface Case {
  id: string;
  merchant_id: string;
  status: CaseStatus;
  opened_at: string;
  updated_at: string;
  notes: CaseNote[];
}
export interface AuditEvent {
  id: number;
  merchant_id: string;
  case_id: string | null;
  ts: string;
  actor: string;
  event_type: string;
  detail: Record<string, unknown>;
}
export interface CaseBundle {
  case: Case | null;
  audit: AuditEvent[];
}

export interface InlineScore {
  merchant_id: string;
  scorer: string;
  indicator_score: number;
  amount_percentile: number;
  indicators: { id: string; detail: string }[];
  action: "ALLOW_AND_LOG" | "ALLOW_AND_FLAG_FOR_REVIEW";
  latency_us: number;
  latency_note: string;
  decision_note: string;
}
export interface InlineScoreIn {
  merchant_id: string;
  amount: number;
  timestamp: string;
  customer_id: string;
}

export interface ResetResult {
  status: string;
  data_version: number;
  transactions: number;
  settlements: number;
  records: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function detailToMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (d && typeof d === "object" && "msg" in d) {
          const loc = Array.isArray((d as { loc?: unknown[] }).loc) ? (d as { loc: unknown[] }).loc.join(".") : "";
          return loc ? `${loc}: ${(d as { msg: string }).msg}` : (d as { msg: string }).msg;
        }
        return JSON.stringify(d);
      })
      .join("; ");
  }
  return JSON.stringify(detail);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(0, `Network error: ${(e as Error).message}. Is the VERITY backend running?`);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : data;
    throw new ApiError(res.status, `HTTP ${res.status}: ${detailToMessage(detail ?? res.statusText)}`);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  merchants: () => request<MerchantSummary[]>("GET", "/merchants"),
  merchant: (id: string) => request<MerchantProfile>("GET", `/merchants/${enc(id)}`),
  assessment: (id: string) => request<Assessment>("GET", `/merchants/${enc(id)}/assessment`),
  timeseries: (id: string) => request<Timeseries>("GET", `/merchants/${enc(id)}/timeseries`),
  network: (focus: string) => request<NetworkGraph>("GET", `/network?focus=${enc(focus)}`),
  declarationTemplate: (id: string) =>
    request<DeclarationTemplate>("GET", `/merchants/${enc(id)}/declaration-template`),
  submitDeclaration: (id: string, body: DeclarationIn) =>
    request<Declaration>("POST", `/merchants/${enc(id)}/declarations`, body),
  reviewDeclaration: (declId: string, body: { decision: "APPROVED" | "REJECTED"; reviewer: string; note: string }) =>
    request<Declaration>("POST", `/declarations/${enc(declId)}/review`, body),
  caseBundle: (id: string) => request<CaseBundle>("GET", `/merchants/${enc(id)}/case`),
  openCase: (id: string, actor: string) =>
    request<CaseBundle>("POST", `/merchants/${enc(id)}/case?actor=${enc(actor)}`),
  caseAction: (
    caseId: string,
    body: { action: "ADD_NOTE" | "CHANGE_STATUS"; actor: string; note: string; status?: CaseStatus },
  ) => request<CaseBundle>("POST", `/cases/${enc(caseId)}/actions`, body),
  scoreTransaction: (body: InlineScoreIn) => request<InlineScore>("POST", "/score/transaction", body),
  reset: () => request<ResetResult>("POST", "/demo/reset"),
};
