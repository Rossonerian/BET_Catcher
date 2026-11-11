# Decision log

Canonical scope lives in [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md).

| ID | Date | Context | Alternatives | Decision | Reasoning | Consequences | Status |
|---|---|---|---|---|---|---|---|
| DEC-001 | 2026-11-11 | Briefing lists 15 ideas; VERITY PDF proposes a different project | Build one of the 15; build VERITY | **Build VERITY** | VERITY is newer (10 Nov), purpose-written with a concrete MVP and storyline; briefing still supplies platform framing | The 15 ideas are out of scope | Accepted |
| DEC-002 | 2026-11-11 | PDF offers architectures A/B/C | A only; C only; A + C fairness + compact network | **A + C fairness loop + compact network** | The PDF itself recommends this; gives detection story *and* false-positive safeguard | 6 engines + declaration workflow | Accepted |
| DEC-003 | 2026-11-11 | No LinuxONE/Telum access verified | Claim Telum; skip platform; abstract scorer | **Scorer interface, x86 execution, Telum path documented as Proposed** | Never present unverified hardware claims | Latency numbers are laptop numbers | Accepted |
| DEC-004 | 2026-11-11 | Stack choice | Django/Postgres/Next.js; FastAPI/SQLite/React | **FastAPI + stdlib sqlite3 + NumPy; React+Vite+TS static build** | Minimal infra, one-command demo, no ORM | Single-process, single-user demo | Accepted |
| DEC-005 | 2026-11-11 | How to model anomalies | Isolation Forest / autoencoder; robust z-scores | **Robust median/MAD z-scores per daily feature + peer drift percentile** | PDF asks for a "simple, explainable baseline"; every number is traceable | Less sensitive to multivariate interactions | Accepted |
| DEC-006 | 2026-11-11 | How a legitimate change becomes "explained" | Lower thresholds after declaration; residual analysis | **Residual analysis**: transactions matching an approved declaration are excluded, then features recomputed | Separates explained from unresolved activity honestly; previous baseline preserved | Matching rules per change type must be explicit | Accepted |
| DEC-007 | 2026-11-11 | Counterfactual reasoning | LLM; rules | **Deterministic rules with evidence references** | PDF: AI may invent explanations; ground every claim | Fixed hypothesis catalogue | Accepted |
| DEC-008 | 2026-11-11 | `gh` token invalid, no remote | Wait for auth; local workflow | **Local branches + reviewed `--no-ff` merges**; no push | Never claim PRs that do not exist | PR records are merge commits + `docs/execution/STATUS.md` | Accepted |
| DEC-009 | 2026-11-11 | Risk tiers | Single score threshold to block | **Five graduated tiers, recommendation only; low confidence caps at `REQUEST_CLARIFICATION`** | PDF fairness guardrails | Analyst action always required for consequential steps | Accepted |
