# VERITY API contract (v1, frozen for WS-3)

Canonical scope: [../PROJECT_SOURCE_OF_TRUTH.md](../PROJECT_SOURCE_OF_TRUTH.md). Real responses recorded from a seeded server are in [`fixtures/`](fixtures/) (re-record with `scripts/record_fixtures.sh`). **The fixtures are the ground truth for field names**; the types below summarise them.

- Base path `/api`, JSON only, no auth (demo).
- Errors: `{"detail": string | ValidationError[]}` with `404` (unknown id), `409` (state conflict), `422` (validation).
- Dates are ISO `YYYY-MM-DD`; timestamps ISO-8601 UTC. Money is INR (`number`).
- Shares are fractions `0..1`. For `kind: "share"` features, `change` is an absolute difference (show as **pp**); for `kind: "ratio"` features it is relative (show as **%**).

## Enumerations

```ts
type Tier = "PASSIVE_MONITORING" | "ENHANCED_MONITORING" | "REQUEST_CLARIFICATION" | "ANALYST_REVIEW" | "ESCALATE_INVESTIGATION";
type Resolution = "EXPLAINED" | "PARTIALLY_EXPLAINED" | "UNRESOLVED";
type Severity = "low" | "medium" | "high";
type Theme = "VOLUME" | "TICKET_SIZE" | "TIMING" | "PAYMENT_PATTERN" | "REFUNDS" | "FUND_FLOW" | "NETWORK";
type HypothesisStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "PENDING_REVIEW" | "PLAUSIBLE_UNTESTED" | "NOT_SUPPORTED";
type Lifecycle = "ONBOARDING" | "EARLY" | "ESTABLISHED";
type CaseStatus = "OPEN" | "AWAITING_MERCHANT" | "UNDER_REVIEW" | "ENHANCED_MONITORING" | "ESCALATED" | "CLOSED_NO_ACTION";
type ChangeType = "CATERING" | "BULK_ORDERS" | "EXTENDED_HOURS" | "NEW_SUPPLIER" | "NEW_OUTLET" | "ONLINE_DELIVERY";
type BeneficiaryKind = "merchant_primary" | "supplier" | "professional_services" | "individual" | "unknown";
```

## Endpoints

| Method | Path | Request | Response | Fixture |
|---|---|---|---|---|
| GET | `/health` | – | `{status, data_version, as_of, seed}` | `health.json` |
| GET | `/merchants` | – | `MerchantSummary[]` sorted by score desc | `merchants.json` |
| GET | `/merchants/{id}` | – | `MerchantProfile` | `merchant_profile.json` |
| GET | `/merchants/{id}/assessment` | – | `Assessment` | `assessment_*.json` |
| GET | `/merchants/{id}/timeseries` | – | `Timeseries` | `timeseries_sweetcrust.json` |
| GET | `/network?focus={id}` | – | `NetworkGraph` | `network_sweetcrust.json` |
| GET | `/merchants/{id}/declaration-template` | – | `DeclarationIn & {demo_only: true}` (404 if none) | `declaration_template.json` |
| POST | `/merchants/{id}/declarations` | `DeclarationIn` | `201 Declaration` (status `PENDING`) | `declaration_created.json` |
| POST | `/declarations/{id}/review` | `{decision: "APPROVED"\|"REJECTED", reviewer, note}` | `Declaration`; `409` if not pending | `declaration_reviewed.json` |
| GET | `/merchants/{id}/case` | – | `{case: Case \| null, audit: AuditEvent[]}` | `case_sweetcrust.json` |
| POST | `/merchants/{id}/case?actor=` | – | `201 {case, audit}`; `409` if open case exists | – |
| POST | `/cases/{id}/actions` | `{action: "ADD_NOTE"\|"CHANGE_STATUS", actor, note (≥3 chars), status?: CaseStatus}` | `{case, audit}` | `case_action.json` |
| POST | `/score/transaction` | `{merchant_id, amount, timestamp, customer_id}` | `InlineScore` | `score_transaction.json` |
| POST | `/demo/reset` | – | `{status, data_version, transactions, settlements, records}` | `demo_reset.json` |

Approving or rejecting a declaration re-runs the assessment and appends an `ASSESSMENT_UPDATED` audit event (`detail.from_score/to_score/from_tier/to_tier/newly_explained`). Pending declarations never change the assessment.

## Types

```ts
interface MerchantSummary {
  id: string; name: string; category: string; region: string; lifecycle_stage: Lifecycle;
  risk_score: number; tier: Tier; tier_label: string; model_confidence: number; data_completeness: number;
  unresolved_signal_count: number; case_status: CaseStatus | null;
}

interface MerchantProfile {
  id: string; name: string; category: string; region: string; size_band: string; channel: string; description: string;
  declared_open: number | null; declared_close: number | null; declared_ticket_min: number | null; declared_ticket_max: number | null;
  primary_beneficiary: string; onboarded_on: string;
  declared: { category: string; description: string; channel: string; hours: [number|null, number|null]; ticket_range: [number|null, number|null] };
  expected: { hours: [number|null, number|null]; ticket_range: [number|null, number|null]; updated_by: string[] };
  declarations: Declaration[];
}

interface Assessment {
  merchant_id: string; merchant_name: string; as_of: string; data_version: number; disclaimer: string;
  windows: { baseline: Window | null; recent: Window | null };          // Window = {start, end, days}
  risk: {
    score: number;                       // 0..100, prioritises review — never "probability of fraud"
    tier: Tier; tier_label: string;
    model_confidence: number;            // 0..1, separate from score
    data_completeness: number;           // 0..1, separate from score; missing data never raises score
    completeness_notes: string[];
    score_breakdown: { theme: Theme; points: number; raw_points: number; signal_id: string; resolution: Resolution }[];
    caps_applied: string[]; lifecycle_stage: Lifecycle; history_days: number;
  };
  recommendation: { tier: Tier; actions: string[]; requires_human_approval: boolean; not_permitted: string[]; rationale: string[] };
  identity: {
    declared: {...}; expected: {...}; scored: false;
    checks: { id: string; check: string; declared: string | null; observed: string | null; consistent: boolean | null; note: string }[];
  };
  behaviour: {
    status: "OK" | "INSUFFICIENT_HISTORY"; baseline_days: number; recent_days: number;
    accounted_transactions: number; accounted_by_declaration: Record<string, number>;
    features: {
      feature: string; label: string; unit: "count" | "INR" | "share"; kind: "ratio" | "share"; direction: "up" | "down" | "both"; theme: Theme;
      baseline_reference: number | null; baseline_scale: number | null; baseline_windows: number;
      recent_value: number | null; recent_residual_value: number | null;
      change: number | null; change_residual: number | null; z: number | null; z_residual: number | null;
      is_anomalous: boolean; is_anomalous_residual: boolean;
    }[];
  };
  peer: {
    status: "OK" | "INSUFFICIENT_COHORT" | "INSUFFICIENT_HISTORY"; caveat: string;
    cohort: { definition: string; size: number; member_ids: string[] };
    features: { feature: string; merchant_change: number; peer_median_change: number; peer_upper_bound: number; peer_lower_bound: number;
                percentile: number; n: number; position: "IN_LINE" | "EXCEEDS_PEERS" | "BELOW_PEERS" }[];
  };
  flow: {
    primary_beneficiary: string;
    baseline: { total: number; shares: BenShare[] }; recent: { total: number; shares: BenShare[] };   // BenShare = {beneficiary_id, label, kind, amount, share}
    non_primary_share: { baseline: number; recent: number; change_pp: number };
    new_beneficiaries: (BenShare & { first_seen: string })[];
    accounted_beneficiaries: string[];
    sankey: { nodes: { id: string; label: string; type: "source" | "merchant" | "beneficiary"; kind?: BeneficiaryKind; new?: boolean }[];
              links: { source: string; target: string; value: number }[] };
  };
  network: { leads: Lead[]; benign_links: Lead[] };
  signals: Signal[];
  hypotheses: { id: string; kind: "LEGITIMATE" | "CONCERN"; title: string; status: HypothesisStatus;
                explains: string[]; supporting: string[]; contradicting: string[]; gaps: string[]; note?: string }[];
}

interface Signal {
  id: string; engine: "behaviour" | "flow" | "network"; theme: Theme; feature: string | null;
  title: string; description: string; severity: Severity; direction: "up" | "down";
  statistic: { baseline: number | null; observed: number | null; z: number | null; observed_residual?: number | null; z_residual?: number | null };
  evidence: { type: string; ref: string; detail: string }[];
  peer_position?: "IN_LINE" | "EXCEEDS_PEERS" | "BELOW_PEERS" | null;
  resolution: Resolution; explained_by: string[];   // hypothesis ids (e.g. "H-SEASONAL") or declaration ids ("DECL-0001")
}

interface Lead {
  beneficiary_id: string; label: string; kind: BeneficiaryKind; relationship: string; source_of_record: string;
  focus_share_recent: number; interpretation: string; corroborating?: boolean;
  linked_merchants: { id: string; name: string; category: string; similar_pattern: boolean; anomalous_features: string[]; first_seen: string; share_recent: number }[];
}

interface Timeseries {
  merchant_id: string; baseline_start: string | null; recent_start: string | null; peer_cohort_size: number;
  features: { feature: string; label: string; unit: string; kind: string; direction: string }[];
  days: ({ date: string; window: "pre_onboarding" | "baseline" | "recent" } &
         Record<`${Feature}` | `${Feature}_residual` | `${Feature}_peer_median`, number | null>)[];
}
// Feature = txn_count | daytime_avg_ticket | night_share | high_value_share | repeated_amount_share | repeat_customer_share | refund_rate

interface NetworkGraph {
  focus: string | null; note: string; leads: Lead[]; benign_links: Lead[];
  nodes: ({ id: string; type: "merchant"; label: string; category: string; anomalous_features: string[]; tier: Tier }
        | { id: string; type: "beneficiary"; label: string; kind: BeneficiaryKind })[];
  edges: { source: string; target: string; relationship: "settlement_payout"; source_of_record: string;
           amount_total: number; amount_recent: number; share_recent: number; first_seen: string; new_in_recent: boolean }[];
}

interface DeclarationIn {
  change_type: ChangeType; description: string; effective_from: string; submitted_by?: string;
  params: { counterparties?: string[]; ticket_min?: number; ticket_max?: number; hours_open?: number; hours_close?: number;
            new_close?: number; beneficiary_ids?: string[] };
  evidence: { kind: "invoice" | "contract" | "purchase_order" | "photo" | "other"; reference: string; amount?: number; counterparty?: string }[];
}
interface Declaration extends DeclarationIn {
  id: string; merchant_id: string; status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string; submitted_by: string; reviewed_at: string | null; reviewer: string | null; review_note: string | null;
}

interface Case { id: string; merchant_id: string; status: CaseStatus; opened_at: string; updated_at: string; notes: { ts: string; actor: string; note: string }[] }
interface AuditEvent { id: number; merchant_id: string; case_id: string | null; ts: string; actor: string; event_type: string; detail: Record<string, unknown> }

interface InlineScore {
  merchant_id: string; scorer: string; indicator_score: number; amount_percentile: number;
  indicators: { id: "AMOUNT_VS_BASELINE" | "OUTSIDE_DECLARED_HOURS" | "REPEATED_EXACT_AMOUNT" | "NEW_CUSTOMER"; detail: string }[];
  action: "ALLOW_AND_LOG" | "ALLOW_AND_FLAG_FOR_REVIEW"; latency_us: number; latency_note: string; decision_note: string;
}
```

## UI obligations that come from the contract
1. Always show `risk.model_confidence` and `risk.data_completeness` next to the score, visually separate from it.
2. Always show `peer.cohort.size`; when `peer.status != "OK"` show `peer.caveat`.
3. Show `disclaimer` and the recommendation's `not_permitted` list on the merchant view.
4. Network edges/leads must display `relationship` and `source_of_record`; label leads as leads.
5. Present `latency_note` with any latency number.
