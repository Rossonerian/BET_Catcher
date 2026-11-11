"""Daily feature matrix per merchant, with residual filtering for approved declarations (DEC-006)."""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field

import numpy as np

from .. import config

FEATURES = [
    # name, label, unit, kind ("ratio" => relative change, "share" => absolute change), direction of concern
    ("txn_count", "Daily transactions", "count", "ratio", "both"),
    ("daytime_avg_ticket", "Average ticket (declared hours)", "INR", "ratio", "both"),
    ("night_share", "Share of payments outside declared hours", "share", "share", "up"),
    ("high_value_share", "Revenue share from high-value payments", "share", "share", "up"),
    ("repeated_amount_share", "Revenue share from repeated identical high amounts", "share", "share", "up"),
    ("repeat_customer_share", "Share of payments from returning customers", "share", "share", "down"),
    ("refund_rate", "Refund rate", "share", "share", "up"),
]
FEATURE_META = {f[0]: {"label": f[1], "unit": f[2], "kind": f[3], "direction": f[4]} for f in FEATURES}
SCALE_FLOOR = {"txn_count": 0.05, "daytime_avg_ticket": 0.03}  # relative floors (x median)
SHARE_FLOOR = 0.01


def in_hours(hours: np.ndarray, open_h: int, close_h: int) -> np.ndarray:
    if close_h > open_h:
        return (hours >= open_h) & (hours < close_h)
    return (hours >= open_h) | (hours < close_h)


@dataclass
class MerchantData:
    merchant: dict
    tx_id: np.ndarray
    day: np.ndarray
    hour: np.ndarray
    amount: np.ndarray
    customer: np.ndarray
    is_refund: np.ndarray
    st_day: np.ndarray
    st_ben: np.ndarray
    st_amount: np.ndarray
    approved: list[dict] = field(default_factory=list)
    pending: list[dict] = field(default_factory=list)

    @property
    def mid(self) -> str:
        return self.merchant["id"]


def load_merchant(conn: sqlite3.Connection, mid: str) -> MerchantData | None:
    m = conn.execute("SELECT * FROM merchants WHERE id = ?", (mid,)).fetchone()
    if m is None:
        return None
    rows = conn.execute(
        "SELECT id, day, hour, amount, customer_id, is_refund FROM transactions WHERE merchant_id = ? ORDER BY ts, id",
        (mid,),
    ).fetchall()
    st = conn.execute("SELECT day, beneficiary_id, amount FROM settlements WHERE merchant_id = ? ORDER BY day, id", (mid,)).fetchall()
    decls = [dict(r) for r in conn.execute("SELECT * FROM declarations WHERE merchant_id = ? ORDER BY submitted_at, id", (mid,))]
    for d in decls:
        d["params"] = json.loads(d["params"])
        d["evidence"] = json.loads(d["evidence"])
    return MerchantData(
        merchant=dict(m),
        tx_id=np.array([r[0] for r in rows], dtype=object),
        day=np.array([r[1] for r in rows], dtype=np.int32),
        hour=np.array([r[2] for r in rows], dtype=np.int32),
        amount=np.array([r[3] for r in rows], dtype=float),
        customer=np.array([r[4] for r in rows], dtype=object),
        is_refund=np.array([r[5] for r in rows], dtype=bool),
        st_day=np.array([r[0] for r in st], dtype=np.int32),
        st_ben=np.array([r[1] for r in st], dtype=object),
        st_amount=np.array([r[2] for r in st], dtype=float),
        approved=[d for d in decls if d["status"] == "APPROVED"],
        pending=[d for d in decls if d["status"] == "PENDING"],
    )


def expected_profile(md: MerchantData) -> dict:
    """Declared profile updated by APPROVED declarations only (FR-008). Original kept alongside."""
    m = md.merchant
    prof = {
        "open": m["declared_open"], "close": m["declared_close"],
        "ticket_min": m["declared_ticket_min"], "ticket_max": m["declared_ticket_max"],
        "accounted_beneficiaries": [], "sources": [],
    }
    for d in md.approved:
        p = d["params"]
        if d["change_type"] == "EXTENDED_HOURS" and p.get("new_close") is not None:
            prof["close"] = int(p["new_close"])
            prof["sources"].append(d["id"])
        prof["accounted_beneficiaries"].extend(p.get("beneficiary_ids", []))
    return prof


def accounted_mask(md: MerchantData) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """Transactions explained by approved declarations (CATERING / BULK_ORDERS)."""
    mask = np.zeros(len(md.amount), dtype=bool)
    per_decl: dict[str, np.ndarray] = {}
    for d in md.approved:
        p = d["params"]
        if d["change_type"] not in ("CATERING", "BULK_ORDERS"):
            continue
        cps = set(p.get("counterparties", []))
        lo, hi = float(p.get("ticket_min", 0)), float(p.get("ticket_max", 1e12))
        open_h = int(p.get("hours_open", md.merchant["declared_open"] or 0))
        close_h = int(p.get("hours_close", md.merchant["declared_close"] or 24))
        m = (
            np.isin(md.customer, list(cps))
            & (md.amount >= lo) & (md.amount <= hi)
            & in_hours(md.hour, open_h, close_h)
            & (md.day >= int(d["effective_from_day"]))
            & ~md.is_refund
        )
        per_decl[d["id"]] = m
        mask |= m
    return mask, per_decl


AGG_KEYS = ("n_all", "n_ref", "n_sale", "rev", "n_inh", "rev_inh", "rev_hv", "rev_rep", "n_ret")


def daily_aggregates(md: MerchantData, exclude: np.ndarray | None = None) -> dict[str, np.ndarray]:
    """Per-day sums; every feature is a ratio of these sums so daily and pooled values are consistent."""
    prof = expected_profile(md)
    n_days = config.HISTORY_DAYS
    keep = np.ones(len(md.amount), dtype=bool) if exclude is None else ~exclude
    day, hour, amt, cust, ref = md.day[keep], md.hour[keep], md.amount[keep], md.customer[keep], md.is_refund[keep]
    hours_known = prof["open"] is not None and prof["close"] is not None
    inh = in_hours(hour, prof["open"], prof["close"]) if hours_known else np.ones(len(hour), dtype=bool)
    tmax = prof["ticket_max"]
    hv_thresh = tmax * config.HIGH_VALUE_MULTIPLIER if tmax else np.inf

    returning = np.zeros(len(cust), dtype=bool)
    last_seen: dict[str, int] = {}
    for i in range(len(cust)):
        prev = last_seen.get(cust[i])
        if prev is not None and day[i] - prev <= config.REPEAT_CUSTOMER_LOOKBACK_DAYS:
            returning[i] = True
        last_seen[cust[i]] = int(day[i])

    # repeated identical high amounts within the same day
    rep = np.zeros(len(amt), dtype=bool)
    big = (amt >= config.REPEATED_AMOUNT_MIN) & ~ref
    if big.any():
        keys = day[big].astype(np.int64) * 10_000_000 + np.round(amt[big]).astype(np.int64)
        uniq, inv, counts = np.unique(keys, return_inverse=True, return_counts=True)
        rep_idx = np.flatnonzero(big)
        rep[rep_idx[counts[inv] >= config.REPEATED_AMOUNT_COUNT]] = True

    sale = ~ref
    agg = {k: np.zeros(n_days) for k in AGG_KEYS}
    np.add.at(agg["n_all"], day, 1)
    np.add.at(agg["n_ref"], day, ref.astype(float))
    np.add.at(agg["n_sale"], day, sale.astype(float))
    np.add.at(agg["rev"], day, np.where(sale, amt, 0.0))
    np.add.at(agg["n_inh"], day, (sale & inh).astype(float))
    np.add.at(agg["rev_inh"], day, np.where(sale & inh, amt, 0.0))
    np.add.at(agg["rev_hv"], day, np.where(sale & (amt > hv_thresh), amt, 0.0))
    np.add.at(agg["rev_rep"], day, np.where(rep, amt, 0.0))
    np.add.at(agg["n_ret"], day, (sale & returning).astype(float))
    agg["_hours_known"] = np.array([hours_known])
    return agg


def _div(a: float, b: float) -> float:
    return float(a / b) if b > 0 else float("nan")


def features_from_sums(s: dict[str, float], n_days: int, hours_known: bool) -> dict[str, float]:
    return {
        "txn_count": float(s["n_sale"]) / n_days if n_days else float("nan"),
        "daytime_avg_ticket": _div(s["rev_inh"], s["n_inh"]),
        "night_share": (_div(s["n_sale"] - s["n_inh"], s["n_sale"]) if hours_known else 0.0) if s["n_sale"] else float("nan"),
        "high_value_share": _div(s["rev_hv"], s["rev"]),
        "repeated_amount_share": _div(s["rev_rep"], s["rev"]),
        "repeat_customer_share": _div(s["n_ret"], s["n_sale"]),
        "refund_rate": _div(s["n_ref"], s["n_all"]),
    }


def window_value(agg: dict[str, np.ndarray], days: np.ndarray) -> dict[str, float]:
    if len(days) == 0:
        return {f: float("nan") for f in FEATURE_META}
    sums = {k: float(agg[k][days].sum()) for k in AGG_KEYS}
    return features_from_sums(sums, len(days), bool(agg["_hours_known"][0]))


def daily_features(agg: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    out = {f: np.full(config.HISTORY_DAYS, np.nan) for f in FEATURE_META}
    hk = bool(agg["_hours_known"][0])
    for d in range(config.HISTORY_DAYS):
        if agg["n_all"][d] == 0:
            continue
        vals = features_from_sums({k: float(agg[k][d]) for k in AGG_KEYS}, 1, hk)
        for f, v in vals.items():
            out[f][d] = v
    return out


def window_days(md: MerchantData) -> tuple[np.ndarray, np.ndarray]:
    onb = int(md.merchant["onboarded_day"])
    all_days = np.arange(config.HISTORY_DAYS)
    baseline = all_days[(all_days >= onb) & (all_days < config.RECENT_START)]
    recent = all_days[all_days >= max(config.RECENT_START, onb)]
    return baseline, recent


def baseline_stats(agg: dict[str, np.ndarray], baseline: np.ndarray) -> dict[str, dict]:
    """Reference = median of rolling RECENT_DAYS-long pooled windows inside the baseline;
    scale = 1.4826 * MAD of those windows, floored. Same unit as the pooled recent value."""
    w = config.RECENT_DAYS
    if len(baseline) == 0:
        return {f: {"median": None, "scale": None, "n_windows": 0} for f in FEATURE_META}
    if len(baseline) >= w:
        windows = [baseline[i:i + w] for i in range(0, len(baseline) - w + 1)]
    else:
        windows = [baseline]
    per_window = [window_value(agg, wd) for wd in windows]
    stats = {}
    for f, meta in FEATURE_META.items():
        vals = np.array([pw[f] for pw in per_window], dtype=float)
        vals = vals[~np.isnan(vals)]
        if len(vals) == 0:
            stats[f] = {"median": None, "scale": None, "n_windows": 0}
            continue
        med = float(np.median(vals))
        mad = float(np.median(np.abs(vals - med))) * 1.4826
        floor = SCALE_FLOOR.get(f, 0.05) * abs(med) if meta["kind"] == "ratio" else SHARE_FLOOR
        stats[f] = {"median": med, "scale": max(mad, floor, 1e-9), "n_windows": int(len(vals))}
    return stats
