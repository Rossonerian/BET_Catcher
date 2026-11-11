# Risk register

See [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md) for scope.

| ID | Risk | Likelihood | Impact | Mitigation / fallback | Owner | Status |
|---|---|---|---|---|---|---|
| R-01 | No LinuxONE/Telum access, so platform fit is argued, not shown | High | High (30% of judging) | Scorer interface + documented zDLC/ONNX path; measured laptop latency labelled honestly; if team gets LinuxONE access, run the same container there | Orchestrator | Open |
| R-02 | Synthetic data looks contrived | Medium | Medium | Seasonal peer drift, noise, a false-positive control merchant, a benign shared accountant link | WS-1 | Mitigated |
| R-03 | Judges read the score as an accusation | Medium | High | UI labels: "prioritises review, not proof"; separate confidence/completeness; no auto-block | WS-1/WS-3 | Mitigated |
| R-04 | Frontend agent drifts from contract | Medium | Medium | Frozen contract + recorded fixtures; review before merge | Orchestrator | Mitigated |
| R-05 | No GitHub remote / CI cannot actually run on GitHub | High | Low | Remote `origin` (`Rossonerian/BET_Catcher`) now exists; GitHub Actions `ci` passed on `main` and `integration/demo-48h` (2026-11-11) | WS-4 | Closed |
| R-06 | Thresholds tuned to the seed overfit the demo | High | Medium | Documented as demo-calibrated; tests assert behaviour, not exact scores, except determinism | WS-1 | Accepted |
| R-07 | Network link misread as guilt | Medium | High | Every edge has type, source, strength; benign accountant link shown alongside | WS-1 | Mitigated |
| R-08 | Declaration whitewashing by compromised or negligent analyst | Medium | High | Match preview pre-evaluates transactions; flags out-of-hours, one-time customer, and repeated amount anomalies; writes warnings into append-only audit trail (AUD-001) | WS-5 | Mitigated |
| R-09 | Inline scorer is fitted in process memory and not shared across workers (audit P2-02) | Low | Low | Demo runs one uvicorn worker (`scripts/run_demo.sh`); constraint documented in `api.py`; production would use a shared cache keyed by data version | WS-2 | Accepted |
| R-10 | Hosted (Vercel) demo state is per serverless instance and lost on cold start | Medium | Low | Deterministic re-seed; Reset demo button; local `scripts/run_demo.sh` fallback for the live presentation | WS-7 | Accepted |
