"""Context engine (FR-007): counterfactual hypotheses and per-signal resolution.

Deterministic rules only (DEC-007). Every supporting/contradicting statement is derived from
records already computed by the other engines; unknowns are listed as evidence gaps.
"""
from __future__ import annotations

import numpy as np

from .. import config
from . import behaviour as B
from . import features as F


def _pct(x: float | None, feature: str | None = None) -> str:
    if x is None:
        return "n/a"
    unit = " pp" if feature and F.FEATURE_META[feature]["kind"] == "share" else "%"
    return f"{x * 100:+.1f}{unit}"


def behaviour_signals(md: F.MerchantData, beh: dict, peer: dict) -> list[dict]:
    peer_pos = {p["feature"]: p for p in peer.get("features", [])}
    out = []
    for f in beh["features"]:
        if not f["is_anomalous"]:
            continue
        unit = "pp" if f["kind"] == "share" else "%"
        ch = f["change"] * 100
        desc = (f"{f['label']}: baseline {f['baseline_reference']:.4g} → recent {f['recent_value']:.4g} "
                f"({ch:+.1f}{unit}, robust z = {f['z']:.1f}) against this merchant's own history.")
        out.append({
            "id": f"SIG-BEH-{f['feature']}", "engine": "behaviour", "theme": f["theme"], "feature": f["feature"],
            "title": f"{f['label']} changed versus own baseline", "description": desc,
            "severity": B.severity(f["z"]), "direction": "up" if f["z"] > 0 else "down",
            "statistic": {"baseline": f["baseline_reference"], "observed": f["recent_value"], "z": f["z"],
                          "observed_residual": f["recent_residual_value"], "z_residual": f["z_residual"]},
            "evidence": B.evidence_for(md, f["feature"], beh["_accounted"]),
            "peer_position": peer_pos.get(f["feature"], {}).get("position"),
            "_feature_row": f,
        })
    return out


def resolve(signals: list[dict], beh: dict, md: F.MerchantData) -> None:
    decl_ids = [d for d, n in beh["accounted_by_declaration"].items() if n > 0]
    ben_decl = {b: d["id"] for d in md.approved for b in d["params"].get("beneficiary_ids", [])}
    for s in signals:
        s["resolution"], s["explained_by"] = "UNRESOLVED", []
        if s["engine"] == "behaviour":
            f = s["_feature_row"]
            if s.get("peer_position") == "IN_LINE":
                s["resolution"], s["explained_by"] = "EXPLAINED", ["H-SEASONAL"]
            elif decl_ids:
                ch, chr_ = f["change"], f["change_residual"]
                frac = 1.0 - (chr_ / ch) if ch else 0.0
                if not f["is_anomalous_residual"]:
                    s["resolution"], s["explained_by"] = "EXPLAINED", decl_ids
                elif frac >= 0.1:
                    s["resolution"], s["explained_by"] = "PARTIALLY_EXPLAINED", decl_ids
        elif s["engine"] in ("flow", "network"):
            if s.get("_explained_by_decl"):
                b = s.get("_beneficiary") or s["evidence"][0]["ref"]
                s["resolution"], s["explained_by"] = "EXPLAINED", [ben_decl.get(b, "declaration")]
            elif "_explained_fraction" in s:
                fr = s["_explained_fraction"]
                ids = sorted(set(ben_decl.values()))
                if fr >= 0.9:
                    s["resolution"], s["explained_by"] = "EXPLAINED", ids
                elif fr >= 0.1:
                    s["resolution"], s["explained_by"] = "PARTIALLY_EXPLAINED", ids


def _preview_matches(md: F.MerchantData, decl: dict) -> int:
    p = decl["params"]
    m = (np.isin(md.customer, p.get("counterparties", []))
         & (md.amount >= float(p.get("ticket_min", 0))) & (md.amount <= float(p.get("ticket_max", 1e12)))
         & (md.day >= int(decl["effective_from_day"])) & ~md.is_refund)
    return int(m.sum())


def _invoice_coverage(md: F.MerchantData, decl: dict, matched_mask: np.ndarray | None) -> tuple[float | None, int]:
    inv_total = sum(float(e.get("amount") or 0) for e in decl["evidence"] if e.get("kind") == "invoice")
    n_inv = sum(1 for e in decl["evidence"] if e.get("kind") == "invoice")
    if matched_mask is None or not matched_mask.any():
        return None, n_inv
    return inv_total / float(md.amount[matched_mask].sum()), n_inv


def hypotheses(md: F.MerchantData, beh: dict, peer: dict, identity: dict, flow: dict, lead_info: dict,
               signals: list[dict]) -> list[dict]:
    by_theme: dict[str, list[dict]] = {}
    for s in signals:
        by_theme.setdefault(s["theme"], []).append(s)
    unresolved = {t for t, ss in by_theme.items() if any(s["resolution"] != "EXPLAINED" for s in ss)}
    hyps = []

    # --- H-SEASONAL -------------------------------------------------------
    beh_sigs = [s for s in signals if s["engine"] == "behaviour"]
    if beh_sigs:
        pf = {p["feature"]: p for p in peer.get("features", [])}
        in_line = [s for s in beh_sigs if s.get("peer_position") == "IN_LINE"]
        exceeds = [s for s in beh_sigs if s.get("peer_position") == "EXCEEDS_PEERS"]
        if peer["status"] != "OK":
            status = "PLAUSIBLE_UNTESTED"
        else:
            status = "SUPPORTED" if in_line and not exceeds else "PARTIALLY_SUPPORTED" if in_line else "NOT_SUPPORTED"
        hyps.append({
            "id": "H-SEASONAL", "kind": "LEGITIMATE", "title": "Seasonal or festival demand shared with peers",
            "status": status, "explains": [s["id"] for s in in_line],
            "supporting": [f"{F.FEATURE_META[s['feature']]['label']}: merchant {_pct(pf[s['feature']]['merchant_change'], s['feature'])} vs "
                           f"peer median {_pct(pf[s['feature']]['peer_median_change'], s['feature'])} (n={pf[s['feature']]['n']})" for s in in_line],
            "contradicting": [f"{F.FEATURE_META[s['feature']]['label']}: merchant {_pct(pf[s['feature']]['merchant_change'], s['feature'])} exceeds "
                              f"peer range (upper bound {_pct(pf[s['feature']]['peer_upper_bound'], s['feature'])})" for s in exceeds],
            "gaps": [] if peer["status"] == "OK" else [peer["caveat"]],
        })

    # --- H-CATERING -------------------------------------------------------
    ticket_sigs = [s for s in signals if s["feature"] in ("daytime_avg_ticket", "high_value_share")]
    caterings = [d for d in md.approved + md.pending if d["change_type"] in ("CATERING", "BULK_ORDERS")]
    if ticket_sigs or caterings:
        h = {"id": "H-CATERING", "kind": "LEGITIMATE", "title": "Corporate catering or bulk orders",
             "explains": [], "supporting": [], "contradicting": [], "gaps": []}
        approved = [d for d in caterings if d["status"] == "APPROVED"]
        pending = [d for d in caterings if d["status"] == "PENDING"]
        if approved:
            d = approved[0]
            mask = beh["_per_decl"].get(d["id"])
            cov, n_inv = _invoice_coverage(md, d, mask)
            n = int(mask.sum()) if mask is not None else 0
            h["status"] = "SUPPORTED" if n and cov is not None and cov >= 0.7 else "PARTIALLY_SUPPORTED"
            h["explains"] = [s["id"] for s in signals if d["id"] in s.get("explained_by", [])]
            h["supporting"].append(f"Declaration {d['id']} approved by {d['reviewer']} ({d['reviewed_at'][:10]})")
            h["supporting"].append(f"{n} payments from {len(d['params'].get('counterparties', []))} declared corporate clients "
                                   f"matched (₹{float(md.amount[mask].sum()) if n else 0:,.0f}); excluded from residual analysis")
            if cov is not None:
                h["supporting"].append(f"{n_inv} invoices cover {cov * 100:.0f}% of matched value")
                if cov < 0.98:
                    h["gaps"].append("Some matched catering payments have no invoice on file")
            if "TIMING" in unresolved or "PAYMENT_PATTERN" in unresolved:
                h["contradicting"].append("Declared catering does not account for out-of-hours payments or repeated identical amounts")
        elif pending:
            d = pending[0]
            h["status"] = "PENDING_REVIEW"
            h["supporting"].append(f"Declaration {d['id']} submitted {d['submitted_at'][:10]} with {len(d['evidence'])} evidence items; "
                                   f"{_preview_matches(md, d)} payments would match its parameters")
            h["gaps"].append("Analyst review of the submitted evidence (expected profile is unchanged until approved)")
        else:
            sig = next((s for s in ticket_sigs if s["feature"] == "daytime_avg_ticket"), None)
            h["status"] = "PLAUSIBLE_UNTESTED"
            if sig:
                h["supporting"].append("In-hours high-value payments concentrate on a few repeat payers: " + sig["evidence"][0]["detail"])
            h["gaps"] += ["Invoices or purchase orders for the repeat high-value payers", "Merchant declaration of a catering or bulk-order line"]
        hyps.append(h)

    # --- H-HOURS ----------------------------------------------------------
    timing = by_theme.get("TIMING", [])
    if timing:
        rep = next((s for s in signals if s["feature"] == "repeated_amount_share" and s["resolution"] != "EXPLAINED"), None)
        night_ev = timing[0]["evidence"][0]["detail"] if timing[0]["evidence"] else ""
        h = {"id": "H-HOURS", "kind": "LEGITIMATE", "title": "Extended opening hours or late-night delivery",
             "explains": [], "supporting": [], "contradicting": [], "gaps": []}
        if any(d["change_type"] == "EXTENDED_HOURS" for d in md.approved):
            h["status"] = "SUPPORTED"
            h["supporting"].append("Approved extended-hours declaration")
        else:
            h["status"] = "NOT_SUPPORTED" if rep else "PLAUSIBLE_UNTESTED"
            h["contradicting"].append("No declaration of extended hours or delivery service on file")
            if rep:
                h["contradicting"].append("Out-of-hours activity is dominated by identical high amounts — atypical for late-night retail. "
                                          + rep["evidence"][0]["detail"])
            if "seen only once" in night_ev:
                h["contradicting"].append(night_ev)
            h["gaps"] += ["Delivery-platform settlement reports for the out-of-hours payments", "Merchant explanation of late-night trading"]
        hyps.append(h)

    # --- H-SUPPLIER -------------------------------------------------------
    flow_new = [s for s in signals if s["id"].startswith("SIG-FLOW-NEW-")]
    if flow_new:
        h = {"id": "H-SUPPLIER", "kind": "LEGITIMATE", "title": "New supplier or business payee",
             "explains": [s["id"] for s in flow_new if s["resolution"] == "EXPLAINED"],
             "supporting": [], "contradicting": [], "gaps": []}
        kinds = {r["beneficiary_id"]: r for r in flow["new_beneficiaries"]}
        for s in flow_new:
            r = kinds.get(s["_beneficiary"], {})
            if s["resolution"] == "EXPLAINED":
                h["supporting"].append(f"{r.get('label')} declared as a business payee in {', '.join(s['explained_by'])}")
            elif r.get("kind") == "supplier":
                h["supporting"].append(f"{r.get('label')} is registered as a supplier")
                h["gaps"].append(f"Supplier invoice or contract for {r.get('label')}")
            elif r.get("kind") == "individual":
                h["contradicting"].append(f"{r.get('label')} is an individual account, not a registered business")
                h["gaps"].append(f"Purpose of payouts to {r.get('label')}")
            else:
                h["gaps"].append(f"Ownership of {r.get('label')} is not on record")
        h["status"] = ("SUPPORTED" if len(h["explains"]) == len(flow_new)
                       else "PARTIALLY_SUPPORTED" if h["explains"] or h["supporting"] else "NOT_SUPPORTED")
        hyps.append(h)

    # --- C-MISUSE (concern) -----------------------------------------------
    concern_themes = sorted(t for t in ("TIMING", "PAYMENT_PATTERN", "FUND_FLOW", "NETWORK") if t in unresolved)
    if concern_themes or signals:
        sup = [s["title"] for s in signals if s["theme"] in concern_themes and s["resolution"] != "EXPLAINED"]
        checks_fail = [c["check"] for c in identity["checks"] if c["consistent"] is False]
        if checks_fail:
            sup.append("Declared-vs-observed checks inconsistent: " + ", ".join(checks_fail))
        gaps = ["Customer-side records (orders, receipts) for the unexplained payments", "Chargeback and complaint history"]
        for s in signals:
            if s["id"].startswith("SIG-FLOW-NEW-") and s["resolution"] != "EXPLAINED":
                gaps.append(f"Purpose and ownership of payouts to {s['title'].split(': ', 1)[1]}")
        hyps.append({
            "id": "C-MISUSE", "kind": "CONCERN",
            "title": "Account used for activity inconsistent with the declared business",
            "status": "SUPPORTED" if len(concern_themes) >= 2 else "PARTIALLY_SUPPORTED" if concern_themes else "NOT_SUPPORTED",
            "explains": [s["id"] for s in signals if s["theme"] in concern_themes and s["resolution"] != "EXPLAINED"],
            "supporting": sup,
            "contradicting": [f"{h['title']}: {h['status'].lower().replace('_', ' ')}" for h in hyps
                              if h["kind"] == "LEGITIMATE" and h["status"] in ("SUPPORTED", "PARTIALLY_SUPPORTED")],
            "gaps": gaps if concern_themes else [],
            "note": "A supported concern prioritises human review. It is not a finding of wrongdoing.",
        })
    return hyps
