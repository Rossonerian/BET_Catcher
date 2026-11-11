"""Deterministic synthetic data generator (FR-001, NFR-002).

Scenario (all fictional):
- 9 established Bengaluru-South bakeries with a shared Diwali seasonal rise in the recent window.
- Sweet Crust Bakery: legitimate corporate catering + unexplained overnight identical high-value
  payments from one-time customers + payouts split to new beneficiaries.
- Golden Oven Bakes and Midnight Snacks Co. share a new beneficiary (BEN-X1) with Sweet Crust.
- Hearth & Honey: strong seasonal growth that matches peers (false-positive control).
- Crumb Theory: onboarded 20 days ago (lifecycle / low-confidence control).
- LedgerWise Accounting: benign shared professional-services beneficiary.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

import numpy as np

from . import config, db

START_DATE = config.AS_OF - timedelta(days=config.HISTORY_DAYS - 1)

BAKERY_REGION = "Bengaluru-South"


def day_to_date(day: int):
    return START_DATE + timedelta(days=day)


MERCHANTS = [
    # id, name, category, region, size, channel, open, close, tmin, tmax, onboarded_day, base_daily, median_ticket, season_peak
    ("M-SWEETCRUST", "Sweet Crust Bakery", "bakery", BAKERY_REGION, "small", "offline", 7, 21, 150, 600, 0, 75, 320, 1.30),
    ("M-HEARTH", "Hearth & Honey", "bakery", BAKERY_REGION, "small", "offline", 7, 21, 150, 700, 0, 70, 340, 1.45),
    ("M-GOLDENOVEN", "Golden Oven Bakes", "bakery", BAKERY_REGION, "small", "offline", 7, 22, 120, 600, 0, 65, 300, 1.30),
    ("M-RISESHINE", "Rise & Shine Bakers", "bakery", BAKERY_REGION, "small", "offline", 6, 20, 100, 500, 0, 90, 240, 1.25),
    ("M-BUTTERLANE", "Butter Lane", "bakery", BAKERY_REGION, "small", "offline", 8, 21, 150, 700, 0, 60, 360, 1.35),
    ("M-FLOURPOWER", "Flour Power", "bakery", BAKERY_REGION, "small", "offline", 7, 21, 120, 600, 0, 80, 290, 1.30),
    ("M-DAILYLOAF", "Daily Loaf Co.", "bakery", BAKERY_REGION, "small", "offline", 6, 20, 80, 450, 0, 100, 220, 1.20),
    ("M-COCOA", "Cocoa Corner", "bakery", BAKERY_REGION, "small", "offline", 9, 22, 150, 800, 0, 55, 380, 1.40),
    ("M-OVENLY", "Ovenly", "bakery", BAKERY_REGION, "small", "offline", 7, 21, 120, 600, 0, 70, 310, 1.30),
    ("M-CRUMB", "Crumb Theory", "bakery", BAKERY_REGION, "small", "offline", 8, 21, 150, 650, 100, 45, 330, 1.30),
    ("M-MIDNIGHT", "Midnight Snacks Co.", "quick_service_restaurant", BAKERY_REGION, "small", "offline", 11, 23, 100, 900, 0, 85, 260, 1.10),
    ("M-WRAP", "Wrap Republic", "quick_service_restaurant", BAKERY_REGION, "small", "offline", 11, 23, 100, 700, 0, 70, 230, 1.10),
    ("M-TANDOOR", "Tandoor Express", "quick_service_restaurant", BAKERY_REGION, "small", "offline", 12, 23, 150, 900, 0, 60, 310, 1.10),
]

DESCRIPTIONS = {
    "bakery": "Neighbourhood bakery: breads, cakes and pastries; walk-in retail.",
    "quick_service_restaurant": "Quick-service restaurant; dine-in and takeaway.",
}

SHARED_BENEFICIARIES = [
    ("BEN-ACCT", "LedgerWise Accounting LLP", "professional_services", "LedgerWise Accounting LLP"),
    ("BEN-FLOURMILL", "Deccan Flour Mills", "supplier", "Deccan Flour Mills Pvt Ltd"),
    ("BEN-X1", "R. Varma (individual a/c)", "individual", "R. Varma"),
    ("BEN-X2", "Wallet a/c ending 7781", "unknown", None),
    ("BEN-X3", "FreshPack Catering Supplies", "supplier", "FreshPack Catering Supplies"),
]

ACCOUNTANT_CLIENTS = {"M-SWEETCRUST", "M-HEARTH", "M-BUTTERLANE", "M-DAILYLOAF", "M-FLOURPOWER"}
FLOURMILL_SHARE = {"M-SWEETCRUST": 0.08, "M-RISESHINE": 0.10, "M-DAILYLOAF": 0.12, "M-OVENLY": 0.07}

CORPORATE_CLIENTS = ["C-CORP-01", "C-CORP-02", "C-CORP-03", "C-CORP-04"]

# Day indices for scenario events
SC_CATERING_START = 92
SC_OVERNIGHT_START = 96
GO_OVERNIGHT_START = 100
MN_OVERNIGHT_START = 95


def season_multiplier(day: int, peak: float) -> float:
    """Diwali (8 Nov 2026 == day 118) demand ramp for the last ~3 weeks."""
    if day < 98:
        return 1.0
    ramp = min(1.0, (day - 98) / 18.0)
    return 1.0 + (peak - 1.0) * ramp


def _in_hours(hour: int, open_h: int, close_h: int) -> bool:
    if close_h > open_h:
        return open_h <= hour < close_h
    return hour >= open_h or hour < close_h


class _Ids:
    def __init__(self) -> None:
        self.tx = 0
        self.st = 0
        self.walkin = 0

    def next_tx(self) -> str:
        self.tx += 1
        return f"T{self.tx:07d}"

    def next_st(self) -> str:
        self.st += 1
        return f"S{self.st:06d}"

    def next_walkin(self) -> str:
        self.walkin += 1
        return f"C-W{self.walkin:06d}"


_HOUR_CACHE: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}


def _retail_hour(rng: np.random.Generator, open_h: int, close_h: int) -> int:
    key = (open_h, close_h)
    if key not in _HOUR_CACHE:
        hours = [h for h in range(24) if _in_hours(h, open_h, close_h)]
        w = np.array([2.0 if 8 <= h <= 10 else 1.8 if 17 <= h <= 19 else 1.0 for h in hours])
        _HOUR_CACHE[key] = (np.array(hours), np.cumsum(w / w.sum()))
    hours, cdf = _HOUR_CACHE[key]
    return int(hours[min(int(np.searchsorted(cdf, rng.random(), side="right")), len(hours) - 1)])


def generate(conn: sqlite3.Connection) -> dict:
    rng = np.random.default_rng(config.SEED)
    ids = _Ids()
    tx_rows: list[tuple] = []
    st_rows: list[tuple] = []
    rec_rows: list[tuple] = []

    for (bid, label, kind, owner) in SHARED_BENEFICIARIES:
        conn.execute("INSERT INTO beneficiaries VALUES (?,?,?,?)", (bid, label, kind, owner))

    for m in MERCHANTS:
        (mid, name, cat, region, size, channel, open_h, close_h, tmin, tmax, onb, base, med, peak) = m
        primary = f"BEN-{mid[2:]}-PRI"
        conn.execute("INSERT INTO beneficiaries VALUES (?,?,?,?)", (primary, f"{name} business a/c", "merchant_primary", name))
        conn.execute(
            "INSERT INTO merchants VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (mid, name, cat, region, size, channel, DESCRIPTIONS[cat], open_h, close_h, float(tmin), float(tmax), onb, primary),
        )
        regulars = [f"C-{mid[2:6]}-{k:04d}" for k in range(300)]
        inv_n = 0
        m_start = len(tx_rows)

        for day in range(onb, config.HISTORY_DAYS):
            d = day_to_date(day)
            weekend = d.weekday() >= 5
            lam = base * season_multiplier(day, peak) * (1.25 if weekend else 1.0)
            n = int(rng.poisson(lam))
            ticket_boost = 1.0 + (season_multiplier(day, peak) - 1.0) * 0.35
            day_tx: list[tuple] = []

            def add(hour: int, amount: float, cust: str, refund: int = 0, minute: int | None = None,
                    dday: int = day) -> str:
                tid = ids.next_tx()
                mm = int(rng.integers(0, 60)) if minute is None else minute
                ts = datetime.combine(day_to_date(dday), datetime.min.time()) + timedelta(hours=hour, minutes=mm)
                row = (tid, mid, dday, ts.isoformat(), hour, float(round(amount, 2)), cust, refund)
                day_tx.append(row)
                return tid

            for _ in range(n):
                hour = _retail_hour(rng, open_h, close_h)
                amount = float(np.round(rng.lognormal(np.log(med * ticket_boost), 0.35) / 10.0) * 10.0)
                if rng.random() < 0.015:  # occasional celebration cake
                    amount = float(np.round(rng.uniform(1200, 2500) / 50.0) * 50.0)
                cust = regulars[int(rng.integers(0, len(regulars)))] if rng.random() < 0.55 else ids.next_walkin()
                add(hour, max(amount, 20.0), cust)
            if n and rng.random() < 0.15:
                add(_retail_hour(rng, open_h, close_h), float(np.round(rng.uniform(150, 500) / 10) * 10), ids.next_walkin(), refund=1)

            # --- Scenario: Sweet Crust legitimate catering (in hours, repeat corporate clients) ---
            if mid == "M-SWEETCRUST" and day >= SC_CATERING_START and d.weekday() in (0, 2, 4):
                for _ in range(int(rng.integers(1, 3))):
                    cust = CORPORATE_CLIENTS[int(rng.integers(0, 4))]
                    amount = float(np.round(rng.uniform(8000, 22000) / 50.0) * 50.0)
                    tid = add(int(rng.integers(10, 16)), amount, cust)
                    inv_n += 1
                    rec_rows.append((f"REC-SC-{inv_n:04d}", mid, "invoice", f"INV-SC-2026-{inv_n:04d}", cust, amount, day))
                    # keep the tx id link out of the merchant record on purpose: invoices are merchant-held documents

            # --- Scenario: overnight identical high-value payments from one-time customers ---
            overnight = None
            if mid == "M-SWEETCRUST" and day >= SC_OVERNIGHT_START:
                overnight = (6, 14, [9999.0, 9999.0, 9999.0, 4999.0])
            elif mid == "M-GOLDENOVEN" and day >= GO_OVERNIGHT_START:
                overnight = (4, 9, [9999.0, 9999.0, 4999.0])
            elif mid == "M-MIDNIGHT" and day >= MN_OVERNIGHT_START:
                overnight = (5, 11, [4999.0, 9999.0, 4999.0])
            if overnight:
                lo, hi, amounts = overnight
                for _ in range(int(rng.integers(lo, hi + 1))):
                    hour = int(rng.choice([23, 0, 1, 2]))
                    dday = day if hour == 23 else min(day + 1, config.HISTORY_DAYS - 1)
                    if hour != 23 and day + 1 >= config.HISTORY_DAYS:
                        continue
                    add(hour, amounts[int(rng.integers(0, len(amounts)))], ids.next_walkin(), dday=dday)

            tx_rows.extend(day_tx)

        # --- Settlements: daily payout of previous day's net receipts with split instructions ---
        by_day: dict[int, float] = {}
        for r in tx_rows[m_start:]:
            if True:
                by_day[r[2]] = by_day.get(r[2], 0.0) + (-r[5] if r[7] else r[5])
        for day in sorted(by_day):
            net = by_day[day] * 0.98  # acquirer fees
            if net <= 0:
                continue
            splits: dict[str, float] = {}
            if mid in FLOURMILL_SHARE:
                splits["BEN-FLOURMILL"] = FLOURMILL_SHARE[mid]
            if mid == "M-SWEETCRUST" and day >= SC_OVERNIGHT_START:
                splits.update({"BEN-X1": 0.25, "BEN-X2": 0.12, "BEN-X3": 0.07})
            if mid == "M-GOLDENOVEN" and day >= GO_OVERNIGHT_START:
                splits["BEN-X1"] = 0.28
            if mid == "M-MIDNIGHT" and day >= MN_OVERNIGHT_START:
                splits.update({"BEN-X1": 0.30, "BEN-X2": 0.10})
            remaining = net
            for ben, share in splits.items():
                amt = round(net * share, 2)
                st_rows.append((ids.next_st(), mid, day, ben, amt))
                remaining -= amt
            if mid in ACCOUNTANT_CLIENTS and day_to_date(day).day == 1:
                st_rows.append((ids.next_st(), mid, day, "BEN-ACCT", 5000.0))
                remaining -= 5000.0
            st_rows.append((ids.next_st(), mid, day, primary, round(remaining, 2)))

    # Drop two invoices so that evidence coverage is realistic (< 100%).
    rec_rows = [r for i, r in enumerate(rec_rows) if i not in (3, 11)]

    conn.executemany("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?)", tx_rows)
    conn.executemany("INSERT INTO settlements VALUES (?,?,?,?,?)", st_rows)
    conn.executemany("INSERT INTO merchant_records VALUES (?,?,?,?,?,?,?)", rec_rows)
    db.set_meta(conn, "data_version", "1")
    db.set_meta(conn, "seed", str(config.SEED))
    db.set_meta(conn, "as_of", config.AS_OF.isoformat())
    conn.commit()
    return {"transactions": len(tx_rows), "settlements": len(st_rows), "records": len(rec_rows)}


def reset(conn: sqlite3.Connection) -> dict:
    with db.lock():
        db.drop_all(conn)
        db.init_schema(conn)
        return generate(conn)


if __name__ == "__main__":
    c = db.connect()
    print(reset(c))
