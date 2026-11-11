# Test strategy

Acceptance criteria: [../PROJECT_SOURCE_OF_TRUTH.md](../PROJECT_SOURCE_OF_TRUTH.md) §H.

| Layer | What | Where | Gate |
|---|---|---|---|
| Determinism | Same seed ⇒ identical transaction table hash | `backend/tests/test_engines.py::test_seed_is_deterministic` | CI |
| Engine behaviour | SoT §F conditions 1–5; missing data never raises risk; pending declarations change nothing; small cohorts refuse comparison; shared long-standing supplier is not a lead | `backend/tests/test_engines.py` | CI |
| API contract | Shapes of list/assessment/timeseries/network; error codes 404/409/422; append-only audit; inline latency p95 < 5 ms in-process | `backend/tests/test_api.py` | CI |
| End-to-end | Full storyline over HTTP: template → submit → pending unchanged → approve → 65/ANALYST_REVIEW → case decision → audit → reset | `backend/tests/test_e2e.py` | CI |
| Frontend | `tsc --noEmit`, `vite build` | `frontend/` | CI |
| Manual demo | Runbook walk-through in a browser | `docs/demo/DEMO_RUNBOOK.md` | Before delivery |
| Secrets | grep for hard-coded secrets | `scripts/ci_local.sh`, workflow `secrets` job | CI |

Run everything locally: `scripts/ci_local.sh`.

**Deliberate non-goals.** Tests assert *behaviour* (tiers, resolutions, monotonic score change), not exact scores, so that thresholds can be recalibrated without rewriting tests (R-06). Model quality metrics (precision/recall) are not claimed: there is no labelled real data.

**Failure scenarios covered:** unknown merchant/declaration/case (404), re-reviewing a decided declaration (409), duplicate case (409), status change without status (422), out-of-range dates and negative amounts (422), invalid timestamp in inline scoring (422), missing declared hours (not assessable, no risk).
