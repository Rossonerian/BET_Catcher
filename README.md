# VERITY — Merchant Behavioural Intelligence

Detects when a merchant's payment activity drifts away from its declared business **without penalising legitimate businesses**: own-baseline drift, peer context, fund-flow and network leads, evidence-grounded counterfactual explanations, merchant change declarations, and a graduated, human-in-the-loop response.

> Prepared for the IBM Z Datathon 2026. **All data is synthetic.** Scores prioritise review; they never determine wrongdoing.

- Source of truth: [docs/PROJECT_SOURCE_OF_TRUTH.md](docs/PROJECT_SOURCE_OF_TRUTH.md)
- Architecture: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) · API contract: [docs/contracts/API.md](docs/contracts/API.md)
- Demo script: [docs/demo/DEMO_RUNBOOK.md](docs/demo/DEMO_RUNBOOK.md) · Status: [docs/execution/STATUS.md](docs/execution/STATUS.md) · Audit: [reports/FINAL_ENGINEERING_AUDIT.md](reports/FINAL_ENGINEERING_AUDIT.md)

## Quick start
Requirements: Python 3.11+, Node 20+ (only to build the UI). No network access needed at runtime.

```bash
scripts/run_demo.sh        # installs missing deps, builds UI once, serves http://127.0.0.1:8000
```
Manual equivalent:
```bash
pip install -r backend/requirements.txt
(cd frontend && npm ci && npm run build)
cd backend && python3 -m uvicorn verity.api:app --port 8000
```
The SQLite database (`backend/verity.db`, override with `VERITY_DB`) is seeded on first start. `POST /api/demo/reset` restores the seeded state.

## Development
```bash
pip install -r backend/requirements-dev.txt
cd backend && python3 -m pytest -q                       # engines, API contract, end-to-end journey
cd frontend && npm run dev                               # Vite on :5173, proxies /api to :8000
scripts/ci_local.sh                                      # everything CI runs
scripts/record_fixtures.sh                               # re-record docs/contracts/fixtures after API changes
```

## Repository layout
```
backend/verity/            seed, db, scoring, api
backend/verity/engines/    features, identity, behaviour, peer, flow, network, context, response, pipeline
backend/tests/             test_engines, test_api, test_e2e
frontend/                  React + Vite + TypeScript investigator console
docs/                      source of truth, decisions, risks, contracts, architecture, execution, testing, demo
reports/                   final engineering audit
scripts/                   run_demo, ci_local, record_fixtures
```

## What is real vs demo-only
| Real in this demo | Demo-only / not demonstrated |
|---|---|
| All six engines, residual analysis, scoring, tiers, caps | Data is synthetic; thresholds are demo-calibrated |
| Declaration → review → re-assessment loop, cases, append-only audit | `declaration-template` endpoint pre-fills from seeded records |
| Inline per-transaction indicators with measured latency | Latency is measured on the demo host, **not on IBM Telum** |
| Single-process deployment | No auth, no real LinuxONE / Secure Execution deployment |

## Why IBM Z / LinuxONE (production path, proposed)
In-transaction scoring next to the acquiring ledger on the Telum on-chip AI accelerator (model → ONNX → IBM zDLC); peer and network analysis over sensitive merchant data inside IBM Secure Execution enclaves; pervasive encryption for the audit trail; and enclave-based cross-provider signals as a future extension. See SoT §D.
