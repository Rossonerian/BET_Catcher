# Workstreams

Requirements: [../PROJECT_SOURCE_OF_TRUTH.md](../PROJECT_SOURCE_OF_TRUTH.md). Live status: [STATUS.md](STATUS.md).

| ID | Name | Objective | Scope | Exclusions | Depends on | Owned files | Requirements | Tests / acceptance | Branch | PR → | Owner | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WS-0 | Foundation | Repo, SoT, decisions, risks | skeleton, docs | code | – | `docs/PROJECT_SOURCE_OF_TRUTH.md`, `docs/DECISIONS.md`, `docs/RISKS.md`, `.gitignore`, `backend/requirements*.txt` | all | SoT reviewed | `main` (initial commit) | – | Orchestrator | Critical |
| WS-1 | Data + engines | Deterministic data and six engines | `backend/verity/{config,db,seed,scoring}.py`, `backend/verity/engines/` | API, UI | WS-0 | as scope + `backend/tests/test_engines.py` | FR-001–007, 009, 011, 012 | `test_engines.py` (determinism, SoT §F 1–5) | `work/engines/WS1-data-and-engines` | integration | Orchestrator | Critical |
| WS-2 | API + workflow | Contract endpoints, declarations, cases, audit | `backend/verity/api.py`, `docs/contracts/`, `scripts/record_fixtures.sh` | engine internals | WS-1 | as scope + `backend/tests/test_api.py`, `test_e2e.py` | FR-008, 010, 012–014 | contract + e2e tests | `work/backend/WS2-api-and-workflow` | integration | Orchestrator | Critical |
| WS-3 | Frontend | Investigator console for the storyline | `frontend/**` | everything else | WS-2 contract (frozen) | `frontend/**` | FR-013 | `npm run typecheck`, `npm run build`, served by backend, journey walk-through | `work/frontend/WS3-investigator-ui` (own worktree) | integration | Frontend subagent | Critical |
| WS-4 | CI, docs, runbook | Quality gates and reproducibility | `.github/`, `scripts/ci_local.sh`, `scripts/run_demo.sh`, `docs/architecture/`, `docs/execution/`, `docs/testing/`, `docs/demo/`, `README.md` | product code | WS-2 | as scope | NFR-001, all | `scripts/ci_local.sh` passes | `work/testing/WS4-ci-docs` | integration | Orchestrator | High |
| WS-5 | Independent audit | Whole-project audit + fixes | `reports/FINAL_ENGINEERING_AUDIT.md`; fixes on separate branch | – | WS-1..4 integrated | `reports/` | all | P0/P1 fixed | `work/audit/WS5-final-audit` | integration → main | Fresh audit subagent (+ orchestrator for fixes) | Critical |

## Interface contracts between workstreams
- WS-1 → WS-2: `pipeline.get(conn)` returns `{assessments, internals, graph, merchants, compute_ms}`; assessments are JSON-safe (private `_` keys stripped).
- WS-2 → WS-3: `docs/contracts/API.md` + `docs/contracts/fixtures/` (recorded, not hand-written).
- WS-3 → WS-2: UI is served from `frontend/dist`; Vite dev proxy for `/api`.

## Dependency classification
| Task | Class |
|---|---|
| SoT, decisions | Independent |
| Seed + engines | Contract-dependent (SoT) |
| API | Integration-dependent (engines) |
| Frontend | Contract-dependent (API.md + fixtures) |
| CI / docs | Contract-dependent |
| E2E test | Validation-dependent |
| Audit, final merge | Finalisation-dependent |
