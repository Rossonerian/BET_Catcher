"""Network engine (FR-006): merchant–beneficiary relationships. Links are leads, not findings."""
from __future__ import annotations

from .. import config
from ..seed import day_to_date

BENIGN_KINDS = {"professional_services"}
CONCERN_FEATURES = {"night_share", "repeated_amount_share", "high_value_share"}


def build_graph(conn, merchants: list[dict], bens: dict, behaviours: dict[str, dict]) -> dict:
    rows = conn.execute(
        "SELECT merchant_id, beneficiary_id, SUM(amount) total, MIN(day) first_day, "
        "SUM(CASE WHEN day >= ? THEN amount ELSE 0 END) recent FROM settlements GROUP BY 1, 2",
        (config.RECENT_START,),
    ).fetchall()
    recent_totals: dict[str, float] = {}
    for r in rows:
        recent_totals[r["merchant_id"]] = recent_totals.get(r["merchant_id"], 0.0) + r["recent"]
    anomalous = {
        mid: sorted(f["feature"] for f in b["features"] if f["is_anomalous_residual"] and f["feature"] in CONCERN_FEATURES)
        for mid, b in behaviours.items()
    }
    nodes = {}
    for m in merchants:
        nodes[m["id"]] = {"id": m["id"], "type": "merchant", "label": m["name"], "category": m["category"],
                          "anomalous_features": anomalous.get(m["id"], [])}
    edges = []
    for r in rows:
        b = bens.get(r["beneficiary_id"], {"label": r["beneficiary_id"], "kind": "unknown"})
        nodes.setdefault(r["beneficiary_id"], {"id": r["beneficiary_id"], "type": "beneficiary", "label": b["label"], "kind": b["kind"]})
        rt = recent_totals.get(r["merchant_id"], 0.0)
        edges.append({
            "source": r["merchant_id"], "target": r["beneficiary_id"], "relationship": "settlement_payout",
            "source_of_record": "acquirer settlement instructions",
            "amount_total": round(r["total"], 2), "amount_recent": round(r["recent"], 2),
            "share_recent": round(r["recent"] / rt, 6) if rt else 0.0,
            "first_seen": day_to_date(r["first_day"]).isoformat(),
            "new_in_recent": r["first_day"] >= config.RECENT_START,
        })
    return {"nodes": nodes, "edges": edges}


def ego(graph: dict, focus: str | None) -> dict:
    """Subgraph around a merchant: its beneficiaries and other merchants paying the same (non-primary) beneficiaries."""
    edges = graph["edges"]
    if focus is None:
        keep_edges = [e for e in edges if graph["nodes"][e["target"]].get("kind") != "merchant_primary"]
    else:
        mine = {e["target"] for e in edges if e["source"] == focus}
        shared = {t for t in mine if graph["nodes"][t].get("kind") != "merchant_primary"}
        keep_edges = [e for e in edges if e["source"] == focus or e["target"] in shared]
    ids = {e["source"] for e in keep_edges} | {e["target"] for e in keep_edges}
    if focus:
        ids.add(focus)
    return {"nodes": [graph["nodes"][i] for i in sorted(ids)], "edges": keep_edges}


def leads(graph: dict, focus: str) -> dict:
    mine = [e for e in graph["edges"] if e["source"] == focus]
    out, benign = [], []
    for e in mine:
        bn = graph["nodes"][e["target"]]
        if bn.get("kind") == "merchant_primary":
            continue
        others = [x for x in graph["edges"] if x["target"] == e["target"] and x["source"] != focus]
        if not others:
            continue
        linked = []
        for o in others:
            mn = graph["nodes"][o["source"]]
            linked.append({"id": mn["id"], "name": mn["label"], "category": mn["category"],
                           "similar_pattern": bool(mn["anomalous_features"]),
                           "anomalous_features": mn["anomalous_features"],
                           "first_seen": o["first_seen"], "share_recent": o["share_recent"]})
        item = {"beneficiary_id": bn["id"], "label": bn["label"], "kind": bn["kind"],
                "relationship": "shared settlement beneficiary", "source_of_record": e["source_of_record"],
                "focus_share_recent": e["share_recent"], "linked_merchants": linked}
        if bn["kind"] in BENIGN_KINDS:
            item["interpretation"] = "Common service provider shared by several merchants; an innocent link is likely."
            benign.append(item)
        elif bn["kind"] == "supplier" and not e["new_in_recent"]:
            item["interpretation"] = "Established supplier relationship that predates the review window; shared suppliers are common."
            benign.append(item)
        else:
            similar = [x for x in linked if x["similar_pattern"]]
            item["interpretation"] = (
                f"{len(similar)} linked merchant(s) show similar unexplained timing/payment-pattern anomalies. "
                "This is an investigation lead; a shared beneficiary can have legitimate explanations."
                if similar else "Shared beneficiary without similar anomalies elsewhere; low-priority context."
            )
            item["corroborating"] = bool(similar)
            out.append(item)
    return {"leads": out, "benign_links": benign}


def signals(focus: str, lead_info: dict, accounted: set[str]) -> list[dict]:
    out = []
    for l in lead_info["leads"]:
        if not l.get("corroborating"):
            continue
        names = ", ".join(x["name"] for x in l["linked_merchants"] if x["similar_pattern"])
        out.append({
            "id": f"SIG-NET-{l['beneficiary_id']}", "engine": "network", "theme": "NETWORK", "feature": None,
            "title": f"Shared beneficiary with anomalous merchants: {l['label']}",
            "description": f"{l['label']} also receives settlements from {names}, which show similar unexplained patterns.",
            "severity": "medium", "direction": "up",
            "statistic": {"baseline": None, "observed": l["focus_share_recent"], "z": None},
            "evidence": [{"type": "network", "ref": l["beneficiary_id"],
                          "detail": f"Relationship: {l['relationship']} · source: {l['source_of_record']}"}],
            "_explained_by_decl": l["beneficiary_id"] in accounted,
        })
    return out
