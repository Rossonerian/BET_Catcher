"""Identity engine (FR-002): does observed activity fit the declared business?

Identity checks are context: they are shown and cited by hypotheses but are not scored,
to avoid double-counting with behaviour signals.
"""
from __future__ import annotations

import numpy as np

from .. import config
from . import features as F

CATEGORY_NORMS = {
    "bakery": {"min_returning_share": 0.30, "max_repeated_amount_share": 0.05},
    "quick_service_restaurant": {"min_returning_share": 0.25, "max_repeated_amount_share": 0.05},
}


def run(md: F.MerchantData, behaviour: dict) -> dict:
    m = md.merchant
    prof = F.expected_profile(md)
    _, recent = F.window_days(md)
    rec = F.window_value(behaviour["_agg_res"], recent)
    win = (md.day >= (recent.min() if len(recent) else 10**9)) & ~md.is_refund & ~behaviour["_accounted"]
    amounts = md.amount[win]
    norms = CATEGORY_NORMS.get(m["category"], {})
    checks = []

    def na(cid: str, label: str, missing: str) -> dict:
        return {"id": cid, "check": label, "declared": None, "observed": None, "consistent": None,
                "note": f"Not assessable — {missing} missing. Missing data does not raise risk."}

    if prof["open"] is None or prof["close"] is None:
        checks.append(na("ID-HOURS", "Operating hours", "declared hours"))
    else:
        ns = rec["night_share"]
        declared = f"{prof['open']:02d}:00–{prof['close']:02d}:00"
        if prof["sources"]:
            declared += f" (updated by {', '.join(prof['sources'])})"
        checks.append({"id": "ID-HOURS", "check": "Operating hours", "declared": declared,
                       "observed": f"{ns * 100:.1f}% of payments outside declared hours",
                       "consistent": bool(ns <= 0.02), "note": "Tolerance 2% for late card settlement and clock drift"})

    if prof["ticket_max"] is None:
        checks.append(na("ID-TICKET", "Ticket size", "declared ticket range"))
    else:
        p50 = float(np.median(amounts)) if len(amounts) else float("nan")
        p95 = float(np.percentile(amounts, 95)) if len(amounts) else float("nan")
        hv = rec["high_value_share"]
        checks.append({"id": "ID-TICKET", "check": "Ticket size",
                       "declared": f"₹{prof['ticket_min']:,.0f}–₹{prof['ticket_max']:,.0f}",
                       "observed": f"median ₹{p50:,.0f}, p95 ₹{p95:,.0f}; {hv * 100:.1f}% of revenue above ₹{prof['ticket_max'] * config.HIGH_VALUE_MULTIPLIER:,.0f}",
                       "consistent": bool(hv <= 0.15), "note": "High value = more than 3× declared maximum ticket"})

    if "min_returning_share" in norms:
        rs = rec["repeat_customer_share"]
        checks.append({"id": "ID-CUSTOMERS", "check": "Customer mix",
                       "declared": f"{m['category']} norm: ≥{norms['min_returning_share'] * 100:.0f}% returning customers",
                       "observed": f"{rs * 100:.1f}% of payments from returning customers",
                       "consistent": bool(rs >= norms["min_returning_share"]), "note": "Category norm, demo-calibrated"})
        rp = rec["repeated_amount_share"]
        checks.append({"id": "ID-PATTERN", "check": "Payment pattern",
                       "declared": f"{m['category']} norm: ≤{norms['max_repeated_amount_share'] * 100:.0f}% revenue from repeated identical high amounts",
                       "observed": f"{rp * 100:.1f}% of revenue",
                       "consistent": bool(rp <= norms["max_repeated_amount_share"]), "note": "Identical high amounts repeated ≥3× in a day"})
    return {
        "declared": {"category": m["category"], "description": m["description"], "channel": m["channel"],
                     "hours": [m["declared_open"], m["declared_close"]],
                     "ticket_range": [m["declared_ticket_min"], m["declared_ticket_max"]]},
        "expected": {"hours": [prof["open"], prof["close"]], "ticket_range": [prof["ticket_min"], prof["ticket_max"]],
                     "updated_by": prof["sources"]},
        "checks": checks,
        "scored": False,
    }
