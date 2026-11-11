# Execution status

Requirements: [../PROJECT_SOURCE_OF_TRUTH.md](../PROJECT_SOURCE_OF_TRUTH.md). Evidence-based: a task is `VERIFIED` only when a test or recorded check shows it.

_Last updated: 2026-11-11 (post-audit fixes merged into integration; 21 backend tests + frontend test passed)._

## Workstreams
| WS | Owner | Branch | Merge commit | Status | Evidence |
|---|---|---|---|---|---|
| WS-0 Foundation | Orchestrator | `main` | `a1e7f7c` | VERIFIED | SoT, decisions, risks present |
| WS-1 Data + engines | Orchestrator | `work/engines/WS1-data-and-engines` | `73fba85` | VERIFIED | `test_engines.py` 10 passed |
| WS-2 API + workflow | Orchestrator | `work/backend/WS2-api-and-workflow` | `51c4917` | VERIFIED | `test_api.py`, `test_e2e.py`; 16 recorded fixtures |
| WS-3 Frontend | Frontend subagent | `work/frontend/WS3-investigator-ui` | `881dbf9` | INTEGRATED | typecheck/build exit 0; browser runbook walk-through verified |
| WS-4 CI + docs | Orchestrator | `work/testing/WS4-ci-docs` | `f492272` | VERIFIED | `scripts/ci_local.sh` → CI OK |
| WS-2 fix (review finding) | Orchestrator | `work/backend/WS2-fix-expected-profile` | `f98e759` | VERIFIED | e2e asserts declared lines + partial explanations |
| WS-5 Independent audit | Audit subagent | `work/audit/WS5-final-audit` | `9b359d0` | VERIFIED | `reports/FINAL_ENGINEERING_AUDIT.md` (21 tests, 9 adversarial probes, contract fixtures verified) |
| Fix AUD-002 Static route path | Implementer | `work/fix/AUD-002-static-route-path` | `ce05cb9` | VERIFIED | `os.path.commonpath` containment + `/api` 404; regression test passed |
| Fix AUD-001 Declaration guard | Implementer | `work/fix/AUD-001-declaration-guard` | `6b2921e` | VERIFIED | Match preview, whitewash detection warnings & audit tracking; regression test passed |
| Fix AUD-003 Frontend test | Implementer | `work/fix/AUD-003-frontend-smoke-test` | `7e2a952` | VERIFIED | `npm test` runs `frontend/tests/format.test.mjs`; CI updated and passing |

"PR" = reviewed `--no-ff` merge into `integration/demo-48h`; no GitHub remote exists (DEC-008), so there are no PR links.

## Requirements
| ID | Status | Evidence |
|---|---|---|
| FR-001 seed | VERIFIED | `test_seed_is_deterministic` |
| FR-002 identity | VERIFIED | `test_missing_data_does_not_raise_risk`, assessment fixture |
| FR-003 behaviour | VERIFIED | `test_sweet_crust_escalates_before_declaration` |
| FR-004 peer | VERIFIED | `test_seasonal_control_not_penalised`, `test_small_cohort_refuses_peer_comparison` |
| FR-005 flow | VERIFIED | new beneficiaries asserted |
| FR-006 network | VERIFIED | `test_network_lead_and_benign_link` |
| FR-007 context | VERIFIED | resolutions asserted in e2e |
| FR-008 declarations | VERIFIED | `test_full_demo_journey`, `test_pending_declaration_changes_nothing`, `test_declaration_match_preview_and_whitewash_guard` |
| FR-009 response | VERIFIED | tier transitions asserted |
| FR-010 case/audit | VERIFIED | audit sequence asserted; append-only trigger test; whitewash warnings recorded in audit |
| FR-011 lifecycle | VERIFIED | `test_new_merchant_low_confidence_and_capped` |
| FR-012 inline | VERIFIED | `test_inline_score` (laptop latency only) |
| FR-013 UI | VERIFIED | build + `format.test.mjs` + agent browser run; manual runbook pass confirmed |
| FR-014 reset | VERIFIED | e2e reset assertion |

## Open items / risks
- No LinuxONE/Telum run (R-01) — platform fit is argued, not measured.
- No GitHub remote; CI workflow is untested on GitHub (R-05). `scripts/ci_local.sh` mirrors it locally.
- R-08 Declaration whitewashing mitigated by AUD-001 preview and forensic audit warnings.

## Next actions
1. Merge `integration/demo-48h` into `main` with `--no-ff`.
2. Team: rehearse the runbook on the presenting laptop; if LinuxONE access exists, run the same server there.
