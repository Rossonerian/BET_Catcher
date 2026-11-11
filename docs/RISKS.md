# Risk register

See [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md) for scope.

| ID | Risk | Likelihood | Impact | Mitigation / fallback | Owner | Status |
|---|---|---|---|---|---|---|
| R-01 | No LinuxONE/Telum access, so platform fit is argued, not shown | High | High (30% of judging) | Scorer interface + documented zDLC/ONNX path; measured laptop latency labelled honestly; if team gets LinuxONE access, run the same container there | Orchestrator | Open |
| R-02 | Synthetic data looks contrived | Medium | Medium | Seasonal peer drift, noise, a false-positive control merchant, a benign shared accountant link | WS-1 | Mitigated |
| R-03 | Judges read the score as an accusation | Medium | High | UI labels: "prioritises review, not proof"; separate confidence/completeness; no auto-block | WS-1/WS-3 | Mitigated |
| R-04 | Frontend agent drifts from contract | Medium | Medium | Frozen contract + recorded fixtures; review before merge | Orchestrator | Open |
| R-05 | No GitHub remote / CI cannot actually run on GitHub | High | Low | Local CI script mirrors workflow; workflow file ready for when a remote exists | WS-4 | Open |
| R-06 | Thresholds tuned to the seed overfit the demo | High | Medium | Documented as demo-calibrated; tests assert behaviour, not exact scores, except determinism | WS-1 | Accepted |
| R-07 | Network link misread as guilt | Medium | High | Every edge has type, source, strength; benign accountant link shown alongside | WS-1 | Mitigated |
