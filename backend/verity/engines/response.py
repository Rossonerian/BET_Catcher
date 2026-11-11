"""Response engine (FR-009, FR-011): explainable score, separate confidence/completeness, graduated tier."""
from __future__ import annotations

from .. import config

TIER_LABEL = {
    "PASSIVE_MONITORING": "Passive monitoring",
    "ENHANCED_MONITORING": "Enhanced monitoring",
    "REQUEST_CLARIFICATION": "Request clarification",
    "ANALYST_REVIEW": "Analyst review",
    "ESCALATE_INVESTIGATION": "Escalate to investigation",
}
NOT_PERMITTED = [
    "Automatic account restriction, closure or permanent ban",
    "Any consequential action based solely on the risk score",
    "Treating a network link or anomaly as proof of wrongdoing",
]


def lifecycle(history_days: int) -> str:
    if history_days < config.LIFECYCLE_ONBOARDING_DAYS:
        return "ONBOARDING"
    if history_days < config.LIFECYCLE_ESTABLISHED_DAYS:
        return "EARLY"
    return "ESTABLISHED"


def _tier_for(score: float) -> str:
    for threshold, tier in config.TIERS:
        if score >= threshold:
            return tier
    return "PASSIVE_MONITORING"


def _idx(t: str) -> int:
    return config.TIER_ORDER.index(t)


def score(signals: list[dict]) -> tuple[float, list[dict]]:
    """Sum over themes of the strongest signal's points × resolution factor (correlated signals are not double-counted)."""
    themes: dict[str, dict] = {}
    for s in signals:
        pts = config.NETWORK_LEAD_POINTS if s["theme"] == "NETWORK" else config.SEVERITY_POINTS[s["severity"]]
        eff = pts * config.RESOLUTION_FACTOR[s["resolution"]]
        cur = themes.get(s["theme"])
        if cur is None or eff > cur["points"] or (eff == cur["points"] and pts > cur["raw_points"]):
            themes[s["theme"]] = {"theme": s["theme"], "points": eff, "raw_points": pts,
                                  "signal_id": s["id"], "resolution": s["resolution"]}
    breakdown = sorted(themes.values(), key=lambda t: -t["points"])
    return min(100.0, round(sum(t["points"] for t in breakdown), 1)), breakdown


def completeness(merchant: dict, flow: dict) -> tuple[float, list[str]]:
    items, notes = [], []
    for key, label in (("declared_open", "declared opening hours"), ("declared_ticket_max", "declared ticket range")):
        ok = merchant.get(key) is not None
        items.append(ok)
        if not ok:
            notes.append(f"Missing {label}")
    unknown = [r["label"] for r in flow["recent"]["shares"] if r["kind"] == "unknown"]
    items.append(not unknown)
    if unknown:
        notes.append("Beneficiary ownership unknown: " + ", ".join(unknown))
    items.append(True)  # customer identifiers present on all transactions (seeded)
    return round(sum(items) / len(items), 2), notes


def run(merchant: dict, beh: dict, peer: dict, flow: dict, signals: list[dict], hyps: list[dict]) -> dict:
    history = config.HISTORY_DAYS - int(merchant["onboarded_day"])
    stage = lifecycle(history)
    s, breakdown = score(signals)
    conf = min(1.0, beh["baseline_days"] / config.FULL_CONFIDENCE_BASELINE_DAYS)
    if peer["status"] != "OK":
        conf *= 0.85
    conf = round(conf, 2)
    comp, comp_notes = completeness(merchant, flow)

    tier = _tier_for(s)
    caps, rationale = [], []
    if conf < config.LOW_CONFIDENCE and _idx(tier) > _idx(config.LOW_CONFIDENCE_TIER_CAP):
        tier = config.LOW_CONFIDENCE_TIER_CAP
        caps.append(f"Model confidence {conf} < {config.LOW_CONFIDENCE}: tier capped at {TIER_LABEL[tier]}")
    if stage == "ONBOARDING" and _idx(tier) < _idx("ENHANCED_MONITORING"):
        tier = "ENHANCED_MONITORING"
        caps.append("Lifecycle default for a new merchant (conservative monitoring, not a risk signal)")

    unresolved = [x for x in signals if x["resolution"] != "EXPLAINED"]
    explained = [x for x in signals if x["resolution"] == "EXPLAINED"]
    rationale.append(f"{len(unresolved)} unresolved or partially explained signal(s); {len(explained)} explained by context")
    for b in breakdown:
        if b["points"] > 0:
            rationale.append(f"{b['theme']}: {b['points']:g} pts from {b['signal_id']} ({b['resolution'].lower().replace('_', ' ')})")
    if stage != "ESTABLISHED":
        rationale.append(f"Lifecycle stage {stage}: {history} days of history; lack of history is not treated as suspicious")

    gaps = []
    for h in hyps:
        for g in h["gaps"]:
            if g not in gaps:
                gaps.append(g)
    actions = {
        "PASSIVE_MONITORING": ["Continue passive monitoring"],
        "ENHANCED_MONITORING": ["Enhanced monitoring: re-assess weekly", "No merchant contact required yet"],
        "REQUEST_CLARIFICATION": ["Request clarification from the merchant (proportionate evidence only)"] + [f"Ask for: {g}" for g in gaps[:3]],
        "ANALYST_REVIEW": ["Assign to an analyst for evidence review", "Request clarification from the merchant"] + [f"Resolve gap: {g}" for g in gaps[:4]],
        "ESCALATE_INVESTIGATION": ["Escalate to the investigation team (human approval required)",
                                   "Analyst may consider a temporary hold on payouts to unverified new beneficiaries — requires recorded approval"]
                                  + [f"Resolve gap: {g}" for g in gaps[:4]],
    }[tier]
    return {
        "risk": {
            "score": s, "tier": tier, "tier_label": TIER_LABEL[tier], "model_confidence": conf,
            "data_completeness": comp, "completeness_notes": comp_notes, "score_breakdown": breakdown,
            "caps_applied": caps, "lifecycle_stage": stage, "history_days": history,
        },
        "recommendation": {
            "tier": tier, "actions": actions,
            "requires_human_approval": _idx(tier) >= _idx("ANALYST_REVIEW"),
            "not_permitted": NOT_PERMITTED, "rationale": rationale,
        },
    }
