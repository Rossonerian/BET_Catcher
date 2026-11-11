"""Flow engine (FR-005): where do receipts settle, and has that changed?"""
from __future__ import annotations

import numpy as np

from .. import config
from . import features as F
from ..seed import day_to_date

NEW_BENEFICIARY_MIN_SHARE = 0.03
NON_PRIMARY_SHIFT_PP = 0.15
KIND_SEVERITY = {"individual": "medium", "unknown": "low", "supplier": "low",
                 "professional_services": "low", "merchant_primary": None}


def _shares(md: F.MerchantData, days_mask: np.ndarray, bens: dict) -> tuple[list[dict], float]:
    amt = md.st_amount[days_mask]
    ben = md.st_ben[days_mask]
    total = float(amt.sum())
    rows = []
    for b in sorted(set(ben)):
        a = float(amt[ben == b].sum())
        info = bens.get(b, {"label": b, "kind": "unknown"})
        rows.append({"beneficiary_id": b, "label": info["label"], "kind": info["kind"],
                     "amount": round(a, 2), "share": round(a / total, 6) if total else 0.0})
    rows.sort(key=lambda r: -r["amount"])
    return rows, total


def run(md: F.MerchantData, bens: dict, behaviour: dict) -> dict:
    baseline, recent = F.window_days(md)
    prof = F.expected_profile(md)
    primary = md.merchant["primary_beneficiary"]
    b_mask = np.isin(md.st_day, baseline)
    r_mask = np.isin(md.st_day, recent)
    b_rows, b_total = _shares(md, b_mask, bens)
    r_rows, r_total = _shares(md, r_mask, bens)
    seen_before = set(md.st_ben[b_mask])
    first_seen = {}
    for d, b in zip(md.st_day, md.st_ben):
        first_seen.setdefault(b, int(d))

    def non_primary(rows):
        return round(sum(r["share"] for r in rows if r["beneficiary_id"] != primary), 6)

    np_base, np_recent = non_primary(b_rows), non_primary(r_rows)
    new_bens = [r for r in r_rows if r["beneficiary_id"] not in seen_before and r["beneficiary_id"] != primary
                and len(baseline) >= config.MIN_BASELINE_DAYS]

    # Source -> merchant -> beneficiary flow for the recent window
    win = (md.day >= (recent.min() if len(recent) else 10**9)) & ~md.is_refund
    accounted = behaviour["_accounted"]
    inh = F.in_hours(md.hour, prof["open"], prof["close"]) if prof["open"] is not None else np.ones(len(md.hour), bool)
    hv = md.amount > ((prof["ticket_max"] or np.inf) * config.HIGH_VALUE_MULTIPLIER)
    sources = [
        ("SRC-RETAIL", "In-hours retail", win & inh & ~hv),
        ("SRC-DECLARED", "Declared change (approved)", win & accounted),
        ("SRC-HIGHVALUE", "In-hours high value (undeclared)", win & inh & hv & ~accounted),
        ("SRC-OFFHOURS", "Outside declared hours", win & ~inh & ~accounted),
    ]
    nodes = [{"id": sid, "label": lbl, "type": "source"} for sid, lbl, m in sources if m.any()]
    links = [{"source": sid, "target": md.mid, "value": round(float(md.amount[m].sum()), 2)} for sid, _, m in sources if m.any()]
    nodes.append({"id": md.mid, "label": md.merchant["name"], "type": "merchant"})
    for r in r_rows:
        nodes.append({"id": r["beneficiary_id"], "label": r["label"], "type": "beneficiary", "kind": r["kind"],
                      "new": r["beneficiary_id"] not in seen_before})
        links.append({"source": md.mid, "target": r["beneficiary_id"], "value": r["amount"]})

    return {
        "primary_beneficiary": primary,
        "baseline": {"total": round(b_total, 2), "shares": b_rows},
        "recent": {"total": round(r_total, 2), "shares": r_rows},
        "non_primary_share": {"baseline": np_base, "recent": np_recent, "change_pp": round(np_recent - np_base, 6)},
        "new_beneficiaries": [
            {**r, "first_seen": day_to_date(first_seen[r["beneficiary_id"]]).isoformat()} for r in new_bens
        ],
        "accounted_beneficiaries": prof["accounted_beneficiaries"],
        "sankey": {"nodes": nodes, "links": links},
    }


def signals(md: F.MerchantData, flow: dict) -> list[dict]:
    out = []
    accounted = set(flow["accounted_beneficiaries"])
    for r in flow["new_beneficiaries"]:
        if r["share"] < NEW_BENEFICIARY_MIN_SHARE:
            continue
        sev = KIND_SEVERITY.get(r["kind"], "low")
        if sev is None:
            continue
        explained = r["beneficiary_id"] in accounted
        kind_note = "ownership not on record (does not by itself raise risk)" if r["kind"] == "unknown" else r["kind"].replace("_", " ")
        out.append({
            "id": f"SIG-FLOW-NEW-{r['beneficiary_id']}", "engine": "flow", "theme": "FUND_FLOW", "feature": None,
            "title": f"New settlement beneficiary: {r['label']}",
            "description": f"{r['share'] * 100:.1f}% of recent settlements now go to {r['label']} ({kind_note}), first seen {r['first_seen']}.",
            "severity": sev, "direction": "up",
            "statistic": {"baseline": 0.0, "observed": r["share"], "z": None},
            "evidence": [{"type": "settlements", "ref": r["beneficiary_id"],
                          "detail": f"₹{r['amount']:,.0f} settled in recent window; not present in baseline"}],
            "_explained_by_decl": explained, "_beneficiary": r["beneficiary_id"],
        })
    np_ = flow["non_primary_share"]
    if np_["change_pp"] >= NON_PRIMARY_SHIFT_PP:
        acc_share = sum(r["share"] for r in flow["recent"]["shares"] if r["beneficiary_id"] in accounted)
        out.append({
            "id": "SIG-FLOW-NONPRIMARY", "engine": "flow", "theme": "FUND_FLOW", "feature": None,
            "title": "Receipts diverted away from the business account",
            "description": f"Share settled outside the primary business account rose from {np_['baseline'] * 100:.1f}% to {np_['recent'] * 100:.1f}%.",
            "severity": "medium", "direction": "up",
            "statistic": {"baseline": np_["baseline"], "observed": np_["recent"], "z": None},
            "evidence": [{"type": "settlements", "ref": flow["primary_beneficiary"], "detail": "Settlement split, baseline vs recent"}],
            "_explained_fraction": (acc_share / np_["change_pp"]) if np_["change_pp"] > 0 else 0.0,
        })
    return out
