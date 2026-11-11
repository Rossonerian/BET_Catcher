# Dependency map

See [WORKSTREAMS.md](WORKSTREAMS.md) for ownership.

```mermaid
flowchart LR
  WS0[WS-0 Foundation\nSoT, decisions] --> WS1[WS-1 Data + engines]
  WS1 --> WS2[WS-2 API + workflow\ncontract frozen + fixtures]
  WS2 --> WS3[WS-3 Frontend]
  WS2 --> WS4[WS-4 CI + docs]
  WS3 --> INT[Integration:\nUI served by API,\njourney walk-through]
  WS4 --> INT
  INT --> WS5[WS-5 Independent audit]
  WS5 --> FIX[P0/P1 fixes]
  FIX --> MAIN[Final merge → main]
```

**Critical path:** WS-0 → WS-1 → WS-2 → WS-3 → integration → WS-5 → fixes → main.
WS-3 and WS-4 run in parallel once the contract is frozen (separate worktrees, disjoint files).

| Edge | What is handed over | Mock/fallback if late |
|---|---|---|
| WS-1 → WS-2 | `pipeline.get()` | – (same owner) |
| WS-2 → WS-3 | API.md + 16 recorded fixtures | UI can be built against fixtures only |
| WS-3 → integration | `frontend/dist` | API still demoable via `/docs` (Swagger) and `test_e2e.py` |
| integration → WS-5 | integrated branch | – |
