# 48-hour plan

Scope: [../PROJECT_SOURCE_OF_TRUTH.md](../PROJECT_SOURCE_OF_TRUTH.md) §F. Status: [STATUS.md](STATUS.md).

This is the team plan for the datathon timebox. The orchestrated build ran compressed into one working session on 2026-11-11; the remaining hours are for the team to rehearse, extend P1/P2 items, and (if obtained) port to LinuxONE.

| Phase | Hours | Activities | Exit milestone | Actual |
|---|---|---|---|---|
| 1 Discovery & planning | 0–3 | Read the three documents, SoT, decisions, demo scope | Contracts stable | Done (SoT rev 1) |
| 2 Foundation | 3–6 | Repo, branches, schema, seed, CI | Workers can build against interfaces | Done |
| 3 Parallel build | 6–18 | Engines + API (critical path); UI against frozen contract; CI/docs | Each workstream functional | Engines/API done; UI + docs parallel |
| 4 First integration | 18–24 | Merge, UI served by API, first full journey | Vertical slice runs | See STATUS |
| 5 Dependent work | 24–32 | Polish UI states, error handling, residual chart | Complete critical flow | See STATUS |
| 6 E2E validation | 32–38 | Runbook walk-through, invalid inputs, reset | Repeatable demo | `test_e2e.py` + manual |
| 7 Independent audit | 38–44 | Fresh reviewer, P0/P1 fixes | Audit report | See `reports/` |
| 8 Packaging | 44–48 | Clean clone test, README, pitch script, final merge | Delivered | See STATUS |

**Reserve:** the final ≥ 20% (hours 38–48) is reserved for audit, fixes and packaging; no new features after hour 38.

## Scope by priority
- **P0:** FR-001–005, 007–010, 013, 014 — the full Sweet Crust journey.
- **P1:** FR-006 network view, FR-011 lifecycle, FR-012 inline scoring panel.
- **P2 (deferred):** Intent Intelligence from public web data, Reputation Passport portability, cross-provider sharing in enclaves, real LinuxONE/Telum deployment, auth/roles, merchant-facing portal separate from analyst UI.

## Team rehearsal checklist (hours 40–48)
1. Fresh clone → `scripts/run_demo.sh` on the presenting laptop, offline.
2. Walk [../demo/DEMO_RUNBOOK.md](../demo/DEMO_RUNBOOK.md) twice, timing each beat to the 2-minute storyline.
3. Prepare the "Why IBM Z" slide from SoT §D — present it as the production path, not as a demonstrated result.
