"""Peer engine (FR-004): is the merchant's drift unusual relative to comparable merchants?"""
from __future__ import annotations

import numpy as np

from .. import config

PEER_FLOOR = {"ratio": 0.05, "share": 0.01}


def cohort_for(merchant: dict, all_merchants: list[dict], baseline_days: dict[str, int]) -> list[str]:
    return [
        m["id"] for m in all_merchants
        if m["id"] != merchant["id"]
        and m["category"] == merchant["category"]
        and m["region"] == merchant["region"]
        and m["size_band"] == merchant["size_band"]
        and baseline_days.get(m["id"], 0) >= config.FULL_CONFIDENCE_BASELINE_DAYS
    ]


def run(merchant: dict, behaviour: dict, all_merchants: list[dict], behaviours: dict[str, dict]) -> dict:
    bdays = {mid: b["baseline_days"] for mid, b in behaviours.items()}
    members = cohort_for(merchant, all_merchants, bdays)
    definition = f"{merchant['category']} · {merchant['region']} · {merchant['size_band']} · ≥{config.FULL_CONFIDENCE_BASELINE_DAYS} days history"
    base = {"cohort": {"definition": definition, "size": len(members), "member_ids": members}}
    if len(members) < config.MIN_COHORT_SIZE or behaviour["status"] != "OK":
        reason = (f"Cohort has {len(members)} comparable merchants; at least {config.MIN_COHORT_SIZE} are required"
                  if len(members) < config.MIN_COHORT_SIZE else "Merchant has insufficient history for drift comparison")
        return {**base, "status": "INSUFFICIENT_COHORT" if len(members) < config.MIN_COHORT_SIZE else "INSUFFICIENT_HISTORY",
                "features": [], "caveat": reason + ". Peer context is unavailable and is not treated as a risk factor."}

    rows = []
    for fr in behaviour["features"]:
        f = fr["feature"]
        if fr["change"] is None:
            continue
        changes = []
        for mid in members:
            pf = next(x for x in behaviours[mid]["features"] if x["feature"] == f)
            if pf["change"] is not None:
                changes.append(pf["change"])
        if len(changes) < config.MIN_COHORT_SIZE:
            continue
        arr = np.array(changes)
        med = float(np.median(arr))
        spread = max(float(np.median(np.abs(arr - med))) * 1.4826, PEER_FLOOR[fr["kind"]])
        upper, lower = med + 3 * spread, med - 3 * spread
        mc = fr["change"]
        position = "EXCEEDS_PEERS" if mc > upper else "BELOW_PEERS" if mc < lower else "IN_LINE"
        rows.append({
            "feature": f, "merchant_change": round(mc, 6), "peer_median_change": round(med, 6),
            "peer_upper_bound": round(upper, 6), "peer_lower_bound": round(lower, 6),
            "percentile": round(float((arr < mc).mean() * 100), 1), "n": len(changes), "position": position,
        })
    return {**base, "status": "OK", "features": rows,
            "caveat": f"Compared with {len(members)} peers ({definition}). Small cohorts give unstable statistics; treat as context."}
