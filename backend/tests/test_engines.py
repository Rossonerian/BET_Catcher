"""Engine behaviour against the seeded scenario (SoT §F conditions 1–5)."""
import hashlib
import json

from verity import config, db, seed
from verity.engines import pipeline
from verity.config import TIER_ORDER


def _tier(a):
    return TIER_ORDER.index(a["risk"]["tier"])


def _sig(a, sid):
    return next(s for s in a["signals"] if s["id"] == sid)


def test_seed_is_deterministic(tmp_path):
    hashes = []
    for i in range(2):
        c = db.connect(str(tmp_path / f"d{i}.db"))
        seed.reset(c)
        h = hashlib.sha256()
        for r in c.execute("SELECT * FROM transactions ORDER BY id"):
            h.update(repr(tuple(r)).encode())
        hashes.append(h.hexdigest())
        c.close()
    assert hashes[0] == hashes[1]


def test_sweet_crust_escalates_before_declaration(conn):
    a = pipeline.get(conn)["assessments"]["M-SWEETCRUST"]
    assert _tier(a) >= TIER_ORDER.index("ANALYST_REVIEW")
    for f in ("daytime_avg_ticket", "night_share", "repeated_amount_share"):
        s = _sig(a, f"SIG-BEH-{f}")
        assert s["resolution"] == "UNRESOLVED"
        assert s["peer_position"] == "EXCEEDS_PEERS"
        assert s["evidence"], "every signal must cite evidence"
    assert {"BEN-X1", "BEN-X2", "BEN-X3"} <= {b["beneficiary_id"] for b in a["flow"]["new_beneficiaries"]}


def test_seasonal_control_not_penalised(conn):
    a = pipeline.get(conn)["assessments"]["M-HEARTH"]
    assert _tier(a) <= TIER_ORDER.index("ENHANCED_MONITORING")
    vol = _sig(a, "SIG-BEH-txn_count")
    assert vol["resolution"] == "EXPLAINED" and vol["explained_by"] == ["H-SEASONAL"]


def test_new_merchant_low_confidence_and_capped(conn):
    a = pipeline.get(conn)["assessments"]["M-CRUMB"]
    assert a["risk"]["model_confidence"] < config.LOW_CONFIDENCE
    assert a["risk"]["lifecycle_stage"] == "ONBOARDING"
    assert a["behaviour"]["status"] == "INSUFFICIENT_HISTORY"
    assert a["risk"]["score"] == 0  # lack of history never raises risk
    assert _tier(a) <= TIER_ORDER.index("REQUEST_CLARIFICATION")


def test_small_cohort_refuses_peer_comparison(conn):
    a = pipeline.get(conn)["assessments"]["M-MIDNIGHT"]
    assert a["peer"]["status"] == "INSUFFICIENT_COHORT"
    assert a["peer"]["cohort"]["size"] < config.MIN_COHORT_SIZE


def test_network_lead_and_benign_link(conn):
    a = pipeline.get(conn)["assessments"]["M-SWEETCRUST"]
    lead = next(l for l in a["network"]["leads"] if l["beneficiary_id"] == "BEN-X1")
    assert {m["id"] for m in lead["linked_merchants"]} == {"M-GOLDENOVEN", "M-MIDNIGHT"}
    assert all(m["similar_pattern"] for m in lead["linked_merchants"])
    assert "lead" in lead["interpretation"]
    benign = {b["beneficiary_id"] for b in a["network"]["benign_links"]}
    assert "BEN-ACCT" in benign
    # a shared, long-standing supplier must not create a network signal for an ordinary bakery
    dl = pipeline.get(conn)["assessments"]["M-DAILYLOAF"]
    assert not [s for s in dl["signals"] if s["engine"] == "network"]


def test_missing_data_does_not_raise_risk(conn):
    conn.execute("UPDATE merchants SET declared_open = NULL, declared_close = NULL WHERE id = 'M-COCOA'")
    db.bump_data_version(conn)
    conn.commit()
    a = pipeline.get(conn)["assessments"]["M-COCOA"]
    hours = next(c for c in a["identity"]["checks"] if c["id"] == "ID-HOURS")
    assert hours["consistent"] is None
    assert a["risk"]["score"] == 0
    assert a["risk"]["data_completeness"] < 1


def test_approved_declaration_separates_explained_from_unresolved(conn):
    before = pipeline.get(conn)["assessments"]["M-SWEETCRUST"]
    recs = [dict(r) for r in conn.execute("SELECT * FROM merchant_records WHERE merchant_id='M-SWEETCRUST'")]
    params = {"counterparties": seed.CORPORATE_CLIENTS, "ticket_min": 5000, "ticket_max": 25000,
              "hours_open": 9, "hours_close": 17, "beneficiary_ids": ["BEN-X3"]}
    ev = [{"kind": "invoice", "reference": r["reference"], "amount": r["amount"], "counterparty": r["counterparty"]} for r in recs]
    conn.execute("INSERT INTO declarations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 ("DECL-T1", "M-SWEETCRUST", "CATERING", "Corporate catering", 92, json.dumps(params), json.dumps(ev),
                  "APPROVED", db.now_iso(), "merchant", db.now_iso(), "analyst", "verified"))
    db.bump_data_version(conn)
    conn.commit()
    after = pipeline.get(conn)["assessments"]["M-SWEETCRUST"]
    assert _sig(after, "SIG-BEH-daytime_avg_ticket")["resolution"] == "EXPLAINED"
    assert _sig(after, "SIG-FLOW-NEW-BEN-X3")["resolution"] == "EXPLAINED"
    for sid in ("SIG-BEH-night_share", "SIG-BEH-repeated_amount_share", "SIG-FLOW-NEW-BEN-X1"):
        assert _sig(after, sid)["resolution"] == "UNRESOLVED"
    assert after["risk"]["score"] < before["risk"]["score"]
    assert _tier(after) > TIER_ORDER.index("PASSIVE_MONITORING")
    cat = next(h for h in after["hypotheses"] if h["id"] == "H-CATERING")
    assert cat["status"] == "SUPPORTED"


def test_pending_declaration_changes_nothing(conn):
    before = pipeline.get(conn)["assessments"]["M-SWEETCRUST"]["risk"]["score"]
    conn.execute("INSERT INTO declarations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 ("DECL-T2", "M-SWEETCRUST", "CATERING", "x", 92,
                  json.dumps({"counterparties": seed.CORPORATE_CLIENTS, "ticket_min": 5000, "ticket_max": 25000}),
                  "[]", "PENDING", db.now_iso(), "merchant", None, None, None))
    db.bump_data_version(conn)
    conn.commit()
    a = pipeline.get(conn)["assessments"]["M-SWEETCRUST"]
    assert a["risk"]["score"] == before
    assert next(h for h in a["hypotheses"] if h["id"] == "H-CATERING")["status"] == "PENDING_REVIEW"


def test_assessment_latency(conn):
    r = pipeline.get(conn)
    assert r["compute_ms"] / len(r["assessments"]) < 500  # NFR-006 per merchant
