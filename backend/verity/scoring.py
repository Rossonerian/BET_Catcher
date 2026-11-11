"""Inline transaction indicators (FR-012) behind a scorer interface (DEC-003).

`RobustBaselineScorer` runs here in NumPy. Production path (Proposed, not demonstrated):
export an equivalent model to ONNX and compile with IBM zDLC so it executes on the Telum
on-chip accelerator inside the authorisation path, next to the core-banking ledger.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

import numpy as np

from . import config
from .engines import features as F


class Scorer(Protocol):
    name: str

    def score(self, merchant_id: str, amount: float, hour: int, customer_id: str) -> dict: ...


@dataclass
class _Baseline:
    sorted_amounts: np.ndarray
    log_median: float
    log_scale: float
    open_h: int | None
    close_h: int | None
    ticket_max: float | None
    known_customers: frozenset
    recent_high_amounts: dict


class RobustBaselineScorer:
    name = "robust-baseline-numpy"

    def __init__(self) -> None:
        self._b: dict[str, _Baseline] = {}

    def fit(self, mds: dict[str, F.MerchantData]) -> None:
        self._b.clear()
        for mid, md in mds.items():
            baseline, recent = F.window_days(md)
            prof = F.expected_profile(md)
            sel = np.isin(md.day, baseline) & ~md.is_refund
            a = md.amount[sel] if sel.any() else md.amount[~md.is_refund]
            la = np.log(np.maximum(a, 1.0)) if len(a) else np.array([0.0])
            med = float(np.median(la))
            scale = max(float(np.median(np.abs(la - med))) * 1.4826, 0.05)
            rsel = np.isin(md.day, recent) & ~md.is_refund & (md.amount >= config.REPEATED_AMOUNT_MIN)
            vals, counts = np.unique(md.amount[rsel], return_counts=True) if rsel.any() else (np.array([]), np.array([]))
            self._b[mid] = _Baseline(np.sort(a), med, scale, prof["open"], prof["close"], prof["ticket_max"],
                                     frozenset(md.customer.tolist()), {float(v): int(c) for v, c in zip(vals, counts)})

    def score(self, merchant_id: str, amount: float, hour: int, customer_id: str) -> dict:
        b = self._b[merchant_id]
        ind = []
        z = (np.log(max(amount, 1.0)) - b.log_median) / b.log_scale
        pct = float(np.searchsorted(b.sorted_amounts, amount) / max(len(b.sorted_amounts), 1) * 100)
        if z >= 3:
            ind.append({"id": "AMOUNT_VS_BASELINE", "detail": f"Amount is above the {pct:.1f}th percentile of this merchant's baseline (log-z {z:.1f})"})
        if b.open_h is not None and not bool(F.in_hours(np.array([hour]), b.open_h, b.close_h)[0]):
            ind.append({"id": "OUTSIDE_DECLARED_HOURS", "detail": f"{hour:02d}:00 is outside declared hours {b.open_h:02d}:00–{b.close_h:02d}:00"})
        rep = b.recent_high_amounts.get(float(amount), 0)
        if amount >= config.REPEATED_AMOUNT_MIN and rep >= config.REPEATED_AMOUNT_COUNT:
            ind.append({"id": "REPEATED_EXACT_AMOUNT", "detail": f"₹{amount:,.0f} already seen {rep} times in the recent window"})
        if customer_id not in b.known_customers:
            ind.append({"id": "NEW_CUSTOMER", "detail": "Customer not seen before at this merchant (common; low weight)"})
        weights = {"AMOUNT_VS_BASELINE": 0.35, "OUTSIDE_DECLARED_HOURS": 0.3, "REPEATED_EXACT_AMOUNT": 0.3, "NEW_CUSTOMER": 0.05}
        s = min(1.0, sum(weights[i["id"]] for i in ind))
        return {"indicator_score": round(s, 2), "indicators": ind, "amount_percentile": round(pct, 1),
                "action": "ALLOW_AND_FLAG_FOR_REVIEW" if s >= 0.6 else "ALLOW_AND_LOG"}


def timed_score(scorer: RobustBaselineScorer, merchant_id: str, amount: float, timestamp: str, customer_id: str) -> dict:
    hour = datetime.fromisoformat(timestamp).hour
    t0 = time.perf_counter_ns()
    res = scorer.score(merchant_id, amount, hour, customer_id)
    elapsed_us = (time.perf_counter_ns() - t0) / 1000
    return {**res, "merchant_id": merchant_id, "scorer": scorer.name, "latency_us": round(elapsed_us, 1),
            "latency_note": "Measured on the demo host (x86/ARM laptop or CI), not on IBM Telum.",
            "decision_note": "Indicators never decline a payment; they flag for review."}
