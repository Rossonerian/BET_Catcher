"""Assessment pipeline: runs all engines for all merchants, cached per data version."""
from __future__ import annotations

import sqlite3
import time

import numpy as np

from .. import config, db
from ..seed import day_to_date
from . import behaviour, context, features as F, flow, identity, network, peer, response

_cache: dict = {"version": None, "result": None}


def _public(d):
    """Strip private keys (prefixed with '_') recursively."""
    if isinstance(d, dict):
        return {k: _public(v) for k, v in d.items() if not k.startswith("_")}
    if isinstance(d, list):
        return [_public(x) for x in d]
    return d


def compute_all(conn: sqlite3.Connection) -> dict:
    t0 = time.perf_counter()
    merchants = [dict(r) for r in conn.execute("SELECT * FROM merchants ORDER BY id")]
    bens = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM beneficiaries")}
    mds = {m["id"]: F.load_merchant(conn, m["id"]) for m in merchants}
    behs = {mid: behaviour.run(md) for mid, md in mds.items()}
    flows = {mid: flow.run(md, bens, behs[mid]) for mid, md in mds.items()}
    graph = network.build_graph(conn, merchants, bens, behs)

    assessments, internals = {}, {}
    for m in merchants:
        mid, md, beh = m["id"], mds[m["id"]], behs[m["id"]]
        pr = peer.run(m, beh, merchants, behs)
        idn = identity.run(md, beh)
        fl = flows[mid]
        lead_info = network.leads(graph, mid)
        accounted_bens = set(fl["accounted_beneficiaries"])
        sigs = context.behaviour_signals(md, beh, pr) + flow.signals(md, fl) + network.signals(mid, lead_info, accounted_bens)
        context.resolve(sigs, beh, md)
        hyps = context.hypotheses(md, beh, pr, idn, fl, lead_info, sigs)
        resp = response.run(m, beh, pr, fl, sigs, hyps)
        baseline, recent = F.window_days(md)
        assessments[mid] = _public({
            "merchant_id": mid, "merchant_name": m["name"], "as_of": config.AS_OF.isoformat(),
            "data_version": db.data_version(conn),
            "windows": {
                "baseline": {"start": day_to_date(int(baseline.min())).isoformat(), "end": day_to_date(int(baseline.max())).isoformat(),
                             "days": int(len(baseline))} if len(baseline) else None,
                "recent": {"start": day_to_date(int(recent.min())).isoformat(), "end": day_to_date(int(recent.max())).isoformat(),
                           "days": int(len(recent))} if len(recent) else None,
            },
            "risk": resp["risk"], "recommendation": resp["recommendation"],
            "identity": idn, "behaviour": beh, "peer": pr, "flow": fl,
            "network": lead_info, "signals": sigs, "hypotheses": hyps,
            "disclaimer": config.DISCLAIMER,
        })
        internals[mid] = {"md": md, "beh": beh, "peer": pr}
    return {"assessments": assessments, "internals": internals, "graph": graph, "merchants": merchants,
            "compute_ms": round((time.perf_counter() - t0) * 1000, 1)}


def get(conn: sqlite3.Connection) -> dict:
    with db.lock():
        v = db.data_version(conn)
        if _cache["version"] != v or _cache["result"] is None:
            _cache["result"] = compute_all(conn)
            _cache["version"] = v
        return _cache["result"]


def invalidate() -> None:
    _cache["version"] = None
    _cache["result"] = None


def timeseries(result: dict, mid: str) -> dict:
    internals = result["internals"]
    md, beh, pr = internals[mid]["md"], internals[mid]["beh"], internals[mid]["peer"]
    daily = F.daily_features(beh["_agg"])
    daily_res = F.daily_features(beh["_agg_res"])
    baseline, recent = F.window_days(md)
    members = pr["cohort"]["member_ids"] if pr["status"] == "OK" else []
    peer_daily = [F.daily_features(internals[p]["beh"]["_agg"]) for p in members]
    onb = int(md.merchant["onboarded_day"])

    def clean(v):
        return None if v is None or np.isnan(v) else round(float(v), 6)

    days = []
    for d in range(config.HISTORY_DAYS):
        row = {"date": day_to_date(d).isoformat(),
               "window": "pre_onboarding" if d < onb else "recent" if d >= config.RECENT_START else "baseline"}
        for f in F.FEATURE_META:
            row[f] = clean(daily[f][d])
            row[f + "_residual"] = clean(daily_res[f][d])
            if peer_daily:
                vals = np.array([p[f][d] for p in peer_daily], dtype=float)
                vals = vals[~np.isnan(vals)]
                row[f + "_peer_median"] = clean(np.median(vals)) if len(vals) else None
            else:
                row[f + "_peer_median"] = None
        days.append(row)
    return {
        "merchant_id": mid,
        "features": [{"feature": f, **meta} for f, meta in F.FEATURE_META.items()],
        "baseline_start": day_to_date(int(baseline.min())).isoformat() if len(baseline) else None,
        "recent_start": day_to_date(int(recent.min())).isoformat() if len(recent) else None,
        "peer_cohort_size": len(members),
        "days": days,
    }
