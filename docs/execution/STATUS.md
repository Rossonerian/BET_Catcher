# Execution status

Requirements: [../PROJECT_SOURCE_OF_TRUTH.md](../PROJECT_SOURCE_OF_TRUTH.md). Evidence-based: a task is `VERIFIED` only when a test or recorded check shows it.

_Last updated: 2026-11-11 (integration `f98e759`, before WS-5 audit)._

## Workstreams
| WS | Owner | Branch | Merge commit | Status | Evidence |
|---|---|---|---|---|---|
| WS-0 Foundation | Orchestrator | `main` | `a1e7f7c` | VERIFIED | SoT, decisions, risks present |
| WS-1 Data + engines | Orchestrator | `work/engines/WS1-data-and-engines` | `73fba85` | VERIFIED | `test_engines.py` 10 passed |
| WS-2 API + workflow | Orchestrator | `work/backend/WS2-api-and-workflow` | `51c4917` | VERIFIED | `test_api.py`, `test_e2e.py`; 16 recorded fixtures |
| WS-3 Frontend | Frontend subagent | `work/frontend/WS3-investigator-ui` | `881dbf9` | INTEGRATED | typecheck/build exit 0 (re-run by orchestrator); headless-Chrome walk-through by agent; screenshots reviewed |
| WS-4 CI + docs | Orchestrator | `work/testing/WS4-ci-docs` | `f492272` | VERIFIED | `scripts/ci_local.sh` → CI OK |
| WS-2 fix (review finding) | Orchestrator | `work/backend/WS2-fix-expected-profile` | `f98e759` | VERIFIED | e2e asserts declared lines + partial explanations |
| WS-5 Independent audit | Audit subagent | `work/audit/WS5-final-audit` | – | COMPLETE | `reports/FINAL_ENGINEERING_AUDIT.md` (19 tests, 9 adversarial probes, contract fixtures verified) |

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
| FR-008 declarations | VERIFIED | `test_full_demo_journey`, `test_pending_declaration_changes_nothing` |
| FR-009 response | VERIFIED | tier transitions asserted |
| FR-010 case/audit | VERIFIED | audit sequence asserted; append-only trigger test |
| FR-011 lifecycle | VERIFIED | `test_new_merchant_low_confidence_and_capped` |
| FR-012 inline | VERIFIED | `test_inline_score` (laptop latency only) |
| FR-013 UI | INTEGRATED | build + agent browser run; manual runbook pass pending by team |
| FR-014 reset | VERIFIED | e2e reset assertion |

## Open items / risks
- No LinuxONE/Telum run (R-01) — platform fit is argued, not measured.
- No GitHub remote; CI workflow is untested on GitHub (R-05). `scripts/ci_local.sh` mirrors it.
- No automated frontend tests; UI verified by build + browser walk-through.

## Next actions
1. WS-5 audit → fix P0/P1 → merge integration into `main`.
2. Team: rehearse the runbook on the presenting laptop; if LinuxONE access exists, run the same server there.
