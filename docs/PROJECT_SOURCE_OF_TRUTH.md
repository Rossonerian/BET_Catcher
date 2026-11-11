# VERITY — Project Source of Truth

> **Authoritative.** All other documents link here. Any change to scope, architecture or interface contracts must update this file and add a row to the revision history (§K).

| | |
|---|---|
| Project | VERITY — Merchant Behavioural Intelligence |
| Event context | IBM Z Datathon 2026 ("AI for Good", must justify IBM Z / LinuxONE) |
| Demo timebox | 48 hours |
| Data | 100% synthetic, deterministic seed. No real merchants, people or accounts. |

## Inputs and their status

| Document | Contributes | Classification |
|---|---|---|
| `VERITY_Merchant_Misuse_Solution_Compendium.pdf` (10 Nov 2026) | Problem, 12 concepts, recommended MVP (Merchant Intelligence Engine + Adaptive Trust + compact network), 6-engine product architecture, 2-minute storyline, guardrails | **Verified** source of product requirements |
| `ibm_z_datathon_2026_complete_briefing.md` | Datathon themes, mandatory "Why IBM Z" pillar, judging rubric, 15 other ideas | **Verified** event context; the 15 ideas are **Outdated** for this project (superseded by VERITY, see DEC-001) |
| `attachment.txt` (master prompt) | Process: SoT, workstreams, Git/PR flow, audit, deliverables | **Verified** process requirements |

---

## A. Project definition

**Problem.** A merchant can pass onboarding with genuine documents and later use its payment account for activity that no longer matches its declared business. Detect that change *without treating every unusual sales pattern as wrongdoing*.

**Design principle (from the PDF).** Continuously compare declared business identity with observed financial behaviour, then use context, corroborating evidence and human review before taking consequential action.

**Users.**
- *Risk analyst / investigator* (primary): triages merchants, reads evidence, decides next step.
- *Merchant* (secondary): declares legitimate business changes with supporting evidence.

**Primary journey (the demo).** Sweet Crust Bakery: establish declared profile → show drift from its own baseline → peer context → fund-flow change → shared beneficiary in network → competing explanations → merchant declares catering → analyst approves → re-assessment separates *explained* from *unresolved* → proportionate action recorded with audit trail.

## B. Functional requirements

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-001 | Seed deterministic synthetic merchants, transactions, settlements and beneficiaries, including the Sweet Crust scenario, a seasonal false-positive control, a new merchant and a network cluster | P0 | PDF §MVP, storyline |
| FR-002 | **Identity engine**: compare declared profile (hours, ticket range, category) with observed activity | P0 | PDF engine table |
| FR-003 | **Behaviour engine**: merchant-specific baseline and drift per feature (ticket, frequency, time-of-day, repeated amounts, repeat customers, refunds) with explainable robust statistics | P0 | Concept 1, MVP #1 |
| FR-004 | **Peer engine**: compare drift with a comparable cohort; always show cohort size; refuse comparison when cohort < 5 | P0 | Concept 7, MVP #2 |
| FR-005 | **Flow engine**: settlement destinations baseline vs recent, new beneficiaries, source→merchant→beneficiary flow | P0 | Concept 3, MVP #3 |
| FR-006 | **Network engine**: merchant–beneficiary graph, shared beneficiaries, labelled relationship type/source/strength, links are leads not findings | P1 | Concept 4, MVP #6 |
| FR-007 | **Context engine**: legitimate and suspicious hypotheses, each with supporting evidence, contradicting evidence and evidence gaps; per-signal resolution EXPLAINED / PARTIALLY_EXPLAINED / UNRESOLVED | P0 | Concept 11 |
| FR-008 | **Change declaration**: merchant submits a material change with evidence; analyst approves/rejects; approved changes update the expected profile only after review; previous baseline preserved | P0 | Concept 8, MVP #4 |
| FR-009 | **Response engine**: graduated recommendation (passive → enhanced monitoring → clarification → analyst review → escalate); never auto-restricts | P0 | Concept 6 |
| FR-010 | **Case workflow**: case status, analyst notes (reason required for status change), audit timeline of every event | P0 | MVP #5 |
| FR-011 | **Lifecycle**: merchants with short history get low confidence and conservative monitoring; lack of history never raises risk | P1 | Concept 12 |
| FR-012 | **Inline transaction indicators**: per-transaction score against cached baseline with measured latency (Theme 1 hook) | P1 | Briefing Theme 1 |
| FR-013 | Investigator UI covering the full journey in one screen flow | P0 | Storyline |
| FR-014 | Demo reset to the seeded state | P0 | Repeatability |

**Explicitly excluded:** Intent Intelligence web scraping (Concept 2), real multi-provider sharing (Concept 9), Reputation Passport portability (Concept 5), LLM-generated narratives, authentication, real LinuxONE deployment, production data connectors.

## C. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-001 | One-command start; full demo reproducible from README on a clean machine with Python 3.11+ and Node 20+ |
| NFR-002 | Deterministic: same seed ⇒ identical data and scores |
| NFR-003 | Explainability: every signal lists its feature, baseline, observed value, statistic and evidence references |
| NFR-004 | Separate **risk score**, **model confidence** and **data completeness**; missing data never increases risk |
| NFR-005 | No consequential action without a human; recommendations only |
| NFR-006 | Full assessment for one merchant < 500 ms; inline transaction indicators < 5 ms p95 on a laptop (measured, reported as such — *not* a Telum claim) |
| NFR-007 | No secrets, no external network calls at runtime |
| NFR-008 | Every recorded audit event is append-only |

## D. Architecture

```mermaid
flowchart LR
  subgraph Data["SQLite (synthetic)"]
    M[merchants] --- T[transactions]
    M --- S[settlements] --- B[beneficiaries]
    M --- D[declarations]
    C[cases] --- A[audit_events]
  end
  subgraph Engines["verity.engines (pure Python + NumPy)"]
    F[features: daily feature matrix + residual filter]
    ID[identity] ; BE[behaviour] ; PE[peer] ; FL[flow] ; NE[network] ; CX[context] ; RE[response]
    F --> BE --> PE
    F --> ID
    FL --> NE
    BE & PE & ID & FL & NE --> CX --> RE
  end
  Data --> F
  Data --> FL
  API[FastAPI /api/*] --> Engines
  API --> Data
  UI[React investigator UI\n(static build served by FastAPI)] --> API
```

- **Pipeline** (`engines/pipeline.py`) builds a `MerchantAssessment` from all engines. Results are cached per *data version*; any declaration review or reset bumps the version.
- **Residual analysis**: transactions matched to an *approved* declaration are marked *accounted for* and excluded from behaviour features; this is how a legitimate change becomes "explained" while unrelated anomalies remain.
- **Scorer interface** (`scoring.py`): `RobustBaselineScorer` (median/MAD). Production path (Proposed, not demonstrated): export to ONNX and compile with IBM zDLC for the Telum on-chip accelerator so in-transaction scoring runs next to core-banking data.
- **Error format**: `{"detail": "<message>"}` with HTTP 400/404/409/422.

### Why IBM Z / LinuxONE (pitch layer — Proposed, not demonstrated)
| VERITY need | IBM Z capability |
|---|---|
| Score every acquiring transaction against the merchant's own baseline inside the authorisation window | Telum on-chip AI accelerator, co-located with CICS/IMS ledgers — no network hop to a GPU cluster |
| Peer and network analysis over sensitive merchant/beneficiary data | IBM Secure Execution / Hyper Protect enclaves; pervasive encryption |
| Collaborative signals across providers (Concept 9, future) | Confidential computing with remote attestation |
| Always-on monitoring | Seven-nines availability, dedicated I/O |

## E. Interface contracts
Defined in [`docs/contracts/API.md`](contracts/API.md) with recorded fixtures in `docs/contracts/fixtures/`. The contract is frozen for WS-3; changes require an update here.

## F. Demo scope (P0)
See [`docs/demo/DEMO_RUNBOOK.md`](demo/DEMO_RUNBOOK.md). Observable success conditions:
1. Sweet Crust (`M-SWEETCRUST`) shows tier ≥ `ANALYST_REVIEW` before declaration.
2. Hearth & Honey (`M-HEARTH`) has a volume increase but is in line with peers ⇒ tier ≤ `ENHANCED_MONITORING`.
3. Crumb Theory (`M-CRUMB`) shows low confidence and never exceeds `REQUEST_CLARIFICATION`.
4. Network view links Sweet Crust, Golden Oven and Midnight Snacks via one beneficiary, labelled as a lead.
5. After the catering declaration is approved: daytime-ticket signal → `EXPLAINED`; overnight/identical-amount/new-individual-beneficiary signals stay `UNRESOLVED`; risk score falls but stays above passive monitoring.
6. Audit timeline shows declaration, review, re-assessment and analyst status change.

## G. Technical decisions
See [`docs/DECISIONS.md`](DECISIONS.md).

## H. Acceptance criteria
| Area | Criterion | Verified by |
|---|---|---|
| Data | Seed is deterministic (hash of transaction table stable) | `test_seed.py` |
| Engines | Conditions F1–F3 and F5 | `test_engines.py`, `test_e2e.py` |
| Network | Condition F4 | `test_engines.py` |
| API | All contract endpoints return the documented shape | `test_api.py` |
| Journey | Condition F5–F6 through HTTP only | `test_e2e.py` |
| UI | `npm run build` succeeds; manual runbook walk-through | CI + runbook |

## I. Risks
See [`docs/RISKS.md`](RISKS.md).

## J. Implementation status
Live board: [`docs/execution/STATUS.md`](execution/STATUS.md).

## K. Revision history
| Rev | Date | Change |
|---|---|---|
| 1 | 2026-11-11 | Initial SoT from the three supplied documents |
| 2 | 2026-11-11 | Contract: `expected.declared_lines` / `declared_beneficiaries`; audit `newly_partially_explained` (raised by WS-3 review) |
