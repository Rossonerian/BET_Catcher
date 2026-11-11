"""Behaviour engine (FR-003): merchant-specific baseline and drift, raw and residual."""
from __future__ import annotations

import math

import numpy as np

from .. import config
from . import features as F

MIN_EFFECT = {"ratio": 0.10, "share": 0.03}
MIN_EFFECT_FEATURE = {"refund_rate": 0.01}
THEME = {
    "txn_count": "VOLUME",
    "daytime_avg_ticket": "TICKET_SIZE",
    "night_share": "TIMING",
    "high_value_share": "PAYMENT_PATTERN",
    "repeated_amount_share": "PAYMENT_PATTERN",
    "repeat_customer_share": "PAYMENT_PATTERN",
    "refund_rate": "REFUNDS",
}


def _change(kind: str, recent: float, ref: float) -> float:
    if kind == "ratio":
        return (recent / ref - 1.0) if ref else float("nan")
    return recent - ref


def _anomalous(meta: dict, feature: str, z: float, change: float) -> bool:
    if z is None or math.isnan(z) or change is None or math.isnan(change):
        return False
    d = meta["direction"]
    if d == "up" and z <= 0:
        return False
    if d == "down" and z >= 0:
        return False
    min_eff = MIN_EFFECT_FEATURE.get(feature, MIN_EFFECT[meta["kind"]])
    return abs(z) >= config.Z_THRESHOLD and abs(change) >= min_eff


def severity(z: float) -> str:
    a = abs(z)
    return "high" if a >= 10 else "medium" if a >= 5 else "low"


def _clean(x):
    if x is None:
        return None
    x = float(x)
    return None if math.isnan(x) or math.isinf(x) else round(x, 6)


def run(md: F.MerchantData) -> dict:
    baseline, recent = F.window_days(md)
    agg = F.daily_aggregates(md)
    accounted, per_decl = F.accounted_mask(md)
    agg_res = F.daily_aggregates(md, exclude=accounted) if accounted.any() else agg
    stats = F.baseline_stats(agg, baseline)
    rec = F.window_value(agg, recent)
    rec_res = F.window_value(agg_res, recent)
    status = "OK" if len(baseline) >= config.MIN_BASELINE_DAYS else "INSUFFICIENT_HISTORY"

    rows = []
    for f, meta in F.FEATURE_META.items():
        s = stats[f]
        ref, scale = s["median"], s["scale"]
        z = zr = ch = chr_ = None
        anom = anom_r = False
        if status == "OK" and ref is not None:
            z = (rec[f] - ref) / scale if not math.isnan(rec[f]) else float("nan")
            zr = (rec_res[f] - ref) / scale if not math.isnan(rec_res[f]) else float("nan")
            ch, chr_ = _change(meta["kind"], rec[f], ref), _change(meta["kind"], rec_res[f], ref)
            anom, anom_r = _anomalous(meta, f, z, ch), _anomalous(meta, f, zr, chr_)
        rows.append({
            "feature": f, "label": meta["label"], "unit": meta["unit"], "kind": meta["kind"],
            "direction": meta["direction"], "theme": THEME[f],
            "baseline_reference": _clean(ref), "baseline_scale": _clean(scale), "baseline_windows": s["n_windows"],
            "recent_value": _clean(rec[f]), "recent_residual_value": _clean(rec_res[f]),
            "change": _clean(ch), "change_residual": _clean(chr_),
            "z": _clean(z), "z_residual": _clean(zr),
            "is_anomalous": bool(anom), "is_anomalous_residual": bool(anom_r),
        })
    return {
        "status": status,
        "baseline_days": int(len(baseline)),
        "recent_days": int(len(recent)),
        "features": rows,
        "accounted_transactions": int(accounted.sum()),
        "accounted_by_declaration": {k: int(v.sum()) for k, v in per_decl.items()},
        "_agg": agg, "_agg_res": agg_res, "_accounted": accounted, "_per_decl": per_decl,
    }


def evidence_for(md: F.MerchantData, feature: str, accounted: np.ndarray) -> list[dict]:
    """Concrete record references behind a behaviour signal (NFR-003)."""
    _, recent = F.window_days(md)
    if not len(recent):
        return []
    prof = F.expected_profile(md)
    win = (md.day >= recent.min()) & ~md.is_refund
    ev: list[dict] = []
    if feature == "night_share" and prof["open"] is not None:
        sel = win & ~F.in_hours(md.hour, prof["open"], prof["close"]) & ~accounted
        custs = md.customer[sel]
        uniq, counts = np.unique(custs, return_counts=True) if len(custs) else (np.array([]), np.array([]))
        ev.append({"type": "transactions", "ref": ",".join(md.tx_id[sel][:5]),
                   "detail": f"{int(sel.sum())} payments outside declared hours "
                             f"({prof['open']:02d}:00–{prof['close']:02d}:00) from {len(uniq)} distinct customers, "
                             f"{int((counts == 1).sum())} seen only once"})
    elif feature in ("repeated_amount_share", "high_value_share"):
        thr = config.REPEATED_AMOUNT_MIN if feature == "repeated_amount_share" else (prof["ticket_max"] or 0) * config.HIGH_VALUE_MULTIPLIER
        sel = win & (md.amount >= thr) & ~accounted
        vals, counts = np.unique(md.amount[sel], return_counts=True) if sel.any() else (np.array([]), np.array([]))
        top = sorted(zip(counts, vals), reverse=True)[:3]
        ev.append({"type": "transactions", "ref": ",".join(md.tx_id[sel][:5]),
                   "detail": f"{int(sel.sum())} payments ≥ ₹{thr:,.0f}; most frequent amounts: "
                             + ", ".join(f"₹{v:,.0f} × {c}" for c, v in top)})
        if accounted.any():
            ev.append({"type": "declaration_match", "ref": "accounted",
                       "detail": f"{int((accounted & win).sum())} high-value payments matched to approved declarations were excluded"})
    elif feature == "daytime_avg_ticket" and prof["ticket_max"]:
        thr = prof["ticket_max"] * config.HIGH_VALUE_MULTIPLIER
        sel = win & (md.amount > thr) & F.in_hours(md.hour, prof["open"], prof["close"])
        custs, counts = np.unique(md.customer[sel], return_counts=True) if sel.any() else (np.array([]), np.array([]))
        top = sorted(zip(counts, custs), reverse=True)[:4]
        ev.append({"type": "transactions", "ref": ",".join(md.tx_id[sel][:5]),
                   "detail": f"{int(sel.sum())} in-hours payments above ₹{thr:,.0f}; top payers: "
                             + ", ".join(f"{c} ({n})" for n, c in top)})
    elif feature == "txn_count":
        ev.append({"type": "aggregate", "ref": "daily_counts", "detail": "Daily transaction counts, recent vs baseline windows"})
    else:
        ev.append({"type": "aggregate", "ref": feature, "detail": F.FEATURE_META[feature]["label"]})
    return ev
