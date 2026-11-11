"""API contract tests (docs/contracts/API.md)."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from verity import api, config
    from verity.engines import pipeline

    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "api.db"))
    api._state.update({"conn": None, "scorer": None, "scorer_version": None})
    pipeline.invalidate()
    with TestClient(api.app) as c:
        yield c
    api._state["conn"].close()
    api._state.update({"conn": None, "scorer": None, "scorer_version": None})
    pipeline.invalidate()


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["as_of"] == "2026-11-10"


def test_merchant_list_shape_and_order(client):
    rows = client.get("/api/merchants").json()
    assert rows[0]["id"] == "M-SWEETCRUST"
    keys = {"id", "name", "category", "region", "lifecycle_stage", "risk_score", "tier", "tier_label",
            "model_confidence", "data_completeness", "unresolved_signal_count", "case_status"}
    assert keys <= set(rows[0])
    assert rows[0]["case_status"] == "OPEN"
    scores = [r["risk_score"] for r in rows]
    assert scores == sorted(scores, reverse=True)


def test_assessment_shape(client):
    a = client.get("/api/merchants/M-SWEETCRUST/assessment").json()
    for k in ("risk", "recommendation", "identity", "behaviour", "peer", "flow", "network", "signals", "hypotheses", "disclaimer", "windows"):
        assert k in a
    assert not any(k.startswith("_") for k in a["behaviour"])
    assert a["recommendation"]["not_permitted"]
    for s in a["signals"]:
        assert {"id", "engine", "theme", "title", "severity", "resolution", "explained_by", "evidence"} <= set(s)


def test_timeseries(client):
    t = client.get("/api/merchants/M-SWEETCRUST/timeseries").json()
    assert len(t["days"]) == 120 and t["peer_cohort_size"] >= 5
    assert {"date", "window", "night_share", "night_share_peer_median", "night_share_residual"} <= set(t["days"][-1])


def test_network(client):
    g = client.get("/api/network?focus=M-SWEETCRUST").json()
    ids = {n["id"] for n in g["nodes"]}
    assert {"M-SWEETCRUST", "M-GOLDENOVEN", "M-MIDNIGHT", "BEN-X1"} <= ids
    assert all({"relationship", "source_of_record"} <= set(e) for e in g["edges"])
    assert client.get("/api/network?focus=M-NOPE").status_code == 404


def test_errors(client):
    assert client.get("/api/merchants/M-NOPE/assessment").status_code == 404
    bad = {"change_type": "CATERING", "description": "x", "effective_from": "2020-01-01"}
    assert client.post("/api/merchants/M-SWEETCRUST/declarations", json=bad).status_code == 422
    assert client.post("/api/declarations/DECL-9999/review", json={"decision": "APPROVED", "reviewer": "a", "note": "fine"}).status_code == 404
    r = client.post("/api/cases/CASE-SWEETCRUST/actions", json={"action": "CHANGE_STATUS", "actor": "a", "note": "no status"})
    assert r.status_code == 422


def test_inline_score(client):
    hot = client.post("/api/score/transaction", json={"merchant_id": "M-SWEETCRUST", "amount": 9999,
                                                      "timestamp": "2026-11-10T01:15:00", "customer_id": "C-NEW"}).json()
    ids = {i["id"] for i in hot["indicators"]}
    assert {"OUTSIDE_DECLARED_HOURS", "REPEATED_EXACT_AMOUNT", "AMOUNT_VS_BASELINE"} <= ids
    assert hot["action"] == "ALLOW_AND_FLAG_FOR_REVIEW"
    cold = client.post("/api/score/transaction", json={"merchant_id": "M-SWEETCRUST", "amount": 320,
                                                       "timestamp": "2026-11-10T09:15:00", "customer_id": "C-SWEE-0001"}).json()
    assert cold["action"] == "ALLOW_AND_LOG" and cold["indicators"] == []
    lat = [client.post("/api/score/transaction", json={"merchant_id": "M-HEARTH", "amount": 400,
                                                       "timestamp": "2026-11-10T10:00:00", "customer_id": "x"}).json()["latency_us"]
           for _ in range(50)]
    assert sorted(lat)[int(len(lat) * 0.95) - 1] < 5000  # NFR-006: < 5 ms p95 in-process


def test_audit_is_append_only(client):
    from verity import api
    import sqlite3
    with pytest.raises(sqlite3.DatabaseError):
        api._state["conn"].execute("DELETE FROM audit_events")


def test_spa_static_route_security(client, tmp_path, monkeypatch):
    import os
    from verity import api

    # 1. /api exact path returns 404 JSON
    r_api = client.get("/api")
    assert r_api.status_code == 404
    assert r_api.json()["detail"] == "Not found"

    # 2. Path traversal attempts do not leak backend files
    r_trav = client.get("/..%2f..%2fbackend%2fverity%2fapi.py")
    assert "FastAPI(title=" not in r_trav.text

    # 3. Sibling directory prefix check (dist2 must not be accessible via dist)
    dist_dir = tmp_path / "mock_dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<html>SPA</html>")
    (dist_dir / "app.js").write_text("console.log('app');")

    sibling_dir = tmp_path / "mock_dist2"
    sibling_dir.mkdir()
    (sibling_dir / "secret.txt").write_text("TOP_SECRET_SIBLING")

    monkeypatch.setattr(api, "_DIST", str(dist_dir))

    # Request to valid file in dist succeeds
    r_valid = client.get("/app.js")
    assert r_valid.status_code == 200
    assert r_valid.text == "console.log('app');"

    # Request trying to escape into sibling directory dist2 fails containment check
    r_escape = client.get("/../mock_dist2/secret.txt")
    assert "TOP_SECRET_SIBLING" not in r_escape.text
    assert r_escape.text == "<html>SPA</html>"  # Safely falls back to index.html

