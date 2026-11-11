"""End-to-end demo journey through HTTP only (SoT §F conditions 5–6)."""
from tests.test_api import client  # noqa: F401  (fixture re-use)


def test_full_demo_journey(client):  # noqa: F811
    before = client.get("/api/merchants/M-SWEETCRUST/assessment").json()
    assert before["risk"]["tier"] == "ESCALATE_INVESTIGATION"

    # merchant declares catering (demo template from merchant's own records)
    tpl = client.get("/api/merchants/M-SWEETCRUST/declaration-template").json()
    assert tpl["demo_only"] is True
    tpl.pop("demo_only")
    decl = client.post("/api/merchants/M-SWEETCRUST/declarations", json=tpl)
    assert decl.status_code == 201
    did = decl.json()["id"]
    assert decl.json()["status"] == "PENDING"

    pending = client.get("/api/merchants/M-SWEETCRUST/assessment").json()
    assert pending["risk"]["score"] == before["risk"]["score"], "pending declarations must not change the profile"

    # analyst approves
    r = client.post(f"/api/declarations/{did}/review",
                    json={"decision": "APPROVED", "reviewer": "analyst.priya", "note": "Invoices match four corporate clients"})
    assert r.status_code == 200 and r.json()["status"] == "APPROVED"
    assert client.post(f"/api/declarations/{did}/review",
                       json={"decision": "REJECTED", "reviewer": "x", "note": "again"}).status_code == 409

    after = client.get("/api/merchants/M-SWEETCRUST/assessment").json()
    res = {s["id"]: s["resolution"] for s in after["signals"]}
    assert res["SIG-BEH-daytime_avg_ticket"] == "EXPLAINED"
    assert res["SIG-BEH-night_share"] == "UNRESOLVED"
    assert res["SIG-BEH-repeated_amount_share"] == "UNRESOLVED"
    assert res["SIG-FLOW-NEW-BEN-X1"] == "UNRESOLVED"
    assert after["risk"]["score"] < before["risk"]["score"]
    assert after["risk"]["tier"] == "ANALYST_REVIEW"
    exp = after["identity"]["expected"]
    assert exp["ticket_range"] == before["identity"]["expected"]["ticket_range"]  # retail baseline preserved
    assert exp["updated_by"] == [did] and exp["declared_lines"][0]["declaration_id"] == did
    assert "BEN-X3" in exp["declared_beneficiaries"]

    # analyst records a proportionate decision
    case = client.get("/api/merchants/M-SWEETCRUST/case").json()["case"]
    r = client.post(f"/api/cases/{case['id']}/actions", json={
        "action": "CHANGE_STATUS", "status": "UNDER_REVIEW", "actor": "analyst.priya",
        "note": "Catering verified. Overnight ₹9,999 payments and payouts to BEN-X1 remain unexplained; requesting clarification."})
    assert r.status_code == 200 and r.json()["case"]["status"] == "UNDER_REVIEW"

    events = [e["event_type"] for e in client.get("/api/merchants/M-SWEETCRUST/case").json()["audit"]]
    for e in ("CASE_OPENED", "DECLARATION_SUBMITTED", "DECLARATION_APPROVED", "ASSESSMENT_UPDATED", "CASE_STATUS_CHANGED"):
        assert e in events
    upd = next(e for e in client.get("/api/merchants/M-SWEETCRUST/case").json()["audit"] if e["event_type"] == "ASSESSMENT_UPDATED")
    assert upd["detail"]["from_tier"] == "ESCALATE_INVESTIGATION" and upd["detail"]["to_tier"] == "ANALYST_REVIEW"
    assert "SIG-BEH-daytime_avg_ticket" in upd["detail"]["newly_explained"]
    assert "SIG-FLOW-NONPRIMARY" in upd["detail"]["newly_partially_explained"]
    assert "SIG-FLOW-NONPRIMARY" not in upd["detail"]["newly_explained"]

    # reset restores the seeded state
    client.post("/api/demo/reset")
    again = client.get("/api/merchants/M-SWEETCRUST/assessment").json()
    assert again["risk"]["score"] == before["risk"]["score"]
    assert client.get("/api/merchants/M-SWEETCRUST").json()["declarations"] == []
