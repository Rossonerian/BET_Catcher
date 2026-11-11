"""FastAPI application (FR-008, FR-010, FR-012..FR-014). Contract: docs/contracts/API.md."""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import config, db, seed
from .engines import pipeline
from .scoring import RobustBaselineScorer, timed_score

CHANGE_TYPES = ("CATERING", "BULK_ORDERS", "EXTENDED_HOURS", "NEW_SUPPLIER", "NEW_OUTLET", "ONLINE_DELIVERY")
CASE_STATUSES = ("OPEN", "AWAITING_MERCHANT", "UNDER_REVIEW", "ENHANCED_MONITORING", "ESCALATED", "CLOSED_NO_ACTION")
AUTO_CASE_MIN_TIER = "REQUEST_CLARIFICATION"

_state: dict = {"conn": None, "scorer": None, "scorer_version": None}


def conn():
    if _state["conn"] is None:
        _state["conn"] = db.connect()
    return _state["conn"]


def _ensure_seeded(c) -> None:
    db.init_schema(c)
    if c.execute("SELECT COUNT(*) FROM merchants").fetchone()[0] == 0:
        _reset(c)


def _reset(c) -> dict:
    with db.lock():
        stats = seed.reset(c)
        pipeline.invalidate()
        res = pipeline.get(c)
        for mid, a in res["assessments"].items():
            if config.TIER_ORDER.index(a["risk"]["tier"]) >= config.TIER_ORDER.index(AUTO_CASE_MIN_TIER):
                cid = f"CASE-{mid[2:]}"
                ts = db.now_iso()
                c.execute("INSERT INTO cases VALUES (?,?,?,?,?)", (cid, mid, "OPEN", ts, ts))
                db.audit(c, mid, "system", "CASE_OPENED",
                         {"reason": f"Recommendation {a['risk']['tier']} (score {a['risk']['score']})",
                          "score": a["risk"]["score"], "tier": a["risk"]["tier"]}, case_id=cid)
        c.commit()
        return stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_seeded(conn())
    yield


app = FastAPI(title="VERITY API", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------- helpers
def _result():
    return pipeline.get(conn())


def _assessment(mid: str) -> dict:
    a = _result()["assessments"].get(mid)
    if a is None:
        raise HTTPException(404, f"Merchant {mid} not found")
    return a


def _decl_row(r) -> dict:
    d = dict(r)
    d["params"] = json.loads(d["params"])
    d["evidence"] = json.loads(d["evidence"])
    d["effective_from"] = seed.day_to_date(d.pop("effective_from_day")).isoformat()
    return d


def _open_case(mid: str):
    return conn().execute("SELECT * FROM cases WHERE merchant_id = ? AND status != 'CLOSED_NO_ACTION' ORDER BY opened_at DESC",
                          (mid,)).fetchone()


def _case_payload(case_row) -> dict:
    c = conn()
    notes = [dict(n) for n in c.execute("SELECT ts, actor, note FROM case_notes WHERE case_id = ? ORDER BY id", (case_row["id"],))]
    return {**dict(case_row), "notes": notes}


def _audit_list(mid: str) -> list[dict]:
    rows = conn().execute("SELECT * FROM audit_events WHERE merchant_id = ? ORDER BY id", (mid,)).fetchall()
    return [{**dict(r), "detail": json.loads(r["detail"])} for r in rows]


def _record_reassessment(mid: str, before: dict, actor: str, reason: str) -> dict:
    db.bump_data_version(conn())
    conn().commit()
    after = _assessment(mid)
    case = _open_case(mid)
    db.audit(conn(), mid, actor, "ASSESSMENT_UPDATED", {
        "reason": reason,
        "from_score": before["risk"]["score"], "to_score": after["risk"]["score"],
        "from_tier": before["risk"]["tier"], "to_tier": after["risk"]["tier"],
        "newly_explained": sorted(
            s["id"] for s in after["signals"]
            if s["resolution"] != "UNRESOLVED"
            and next((b for b in before["signals"] if b["id"] == s["id"]), {}).get("resolution") != s["resolution"]
        ),
    }, case_id=case["id"] if case else None)
    conn().commit()
    return after


# ---------------------------------------------------------------- read endpoints
@app.get("/api/health")
def health():
    c = conn()
    return {"status": "ok", "data_version": db.data_version(c), "as_of": config.AS_OF.isoformat(), "seed": config.SEED}


@app.get("/api/merchants")
def list_merchants():
    with db.lock():
        res = _result()
        out = []
        for m in res["merchants"]:
            a = res["assessments"][m["id"]]
            case = _open_case(m["id"])
            out.append({
                "id": m["id"], "name": m["name"], "category": m["category"], "region": m["region"],
                "lifecycle_stage": a["risk"]["lifecycle_stage"], "risk_score": a["risk"]["score"],
                "tier": a["risk"]["tier"], "tier_label": a["risk"]["tier_label"],
                "model_confidence": a["risk"]["model_confidence"], "data_completeness": a["risk"]["data_completeness"],
                "unresolved_signal_count": sum(1 for s in a["signals"] if s["resolution"] != "EXPLAINED"),
                "case_status": case["status"] if case else None,
            })
        out.sort(key=lambda x: (-x["risk_score"], x["name"]))
        return out


@app.get("/api/merchants/{mid}")
def merchant_profile(mid: str):
    with db.lock():
        m = conn().execute("SELECT * FROM merchants WHERE id = ?", (mid,)).fetchone()
        if m is None:
            raise HTTPException(404, f"Merchant {mid} not found")
        a = _assessment(mid)
        decls = [_decl_row(r) for r in conn().execute("SELECT * FROM declarations WHERE merchant_id = ? ORDER BY submitted_at, id", (mid,))]
        m = dict(m)
        m["onboarded_on"] = seed.day_to_date(m.pop("onboarded_day")).isoformat()
        return {**m, "declared": a["identity"]["declared"], "expected": a["identity"]["expected"], "declarations": decls}


@app.get("/api/merchants/{mid}/assessment")
def merchant_assessment(mid: str):
    with db.lock():
        return _assessment(mid)


@app.get("/api/merchants/{mid}/timeseries")
def merchant_timeseries(mid: str):
    with db.lock():
        _assessment(mid)
        return pipeline.timeseries(_result(), mid)


@app.get("/api/network")
def network_graph(focus: str | None = None):
    from .engines import network
    with db.lock():
        res = _result()
        if focus is not None and focus not in res["assessments"]:
            raise HTTPException(404, f"Merchant {focus} not found")
        g = network.ego(res["graph"], focus)
        tiers = {mid: a["risk"]["tier"] for mid, a in res["assessments"].items()}
        nodes =[{**n, "tier": tiers.get(n["id"])} if n["type"] == "merchant" else dict(n) for n in g["nodes"]]
        return {"focus": focus, "nodes": nodes, "edges": g["edges"],
                "leads": res["assessments"][focus]["network"]["leads"] if focus else [],
                "benign_links": res["assessments"][focus]["network"]["benign_links"] if focus else [],
                "note": "Links are investigation leads, not findings. Each edge shows its relationship type and source of record."}


# ---------------------------------------------------------------- declarations
class EvidenceItem(BaseModel):
    kind: Literal["invoice", "contract", "purchase_order", "photo", "other"]
    reference: str = Field(min_length=1, max_length=120)
    amount: float | None = Field(default=None, ge=0)
    counterparty: str | None = Field(default=None, max_length=120)


class DeclarationParams(BaseModel):
    counterparties: list[str] = Field(default_factory=list, max_length=50)
    ticket_min: float | None = Field(default=None, ge=0)
    ticket_max: float | None = Field(default=None, ge=0)
    hours_open: int | None = Field(default=None, ge=0, le=23)
    hours_close: int | None = Field(default=None, ge=0, le=24)
    new_close: int | None = Field(default=None, ge=0, le=24)
    beneficiary_ids: list[str] = Field(default_factory=list, max_length=20)


class DeclarationIn(BaseModel):
    change_type: Literal[CHANGE_TYPES]  # type: ignore[valid-type]
    description: str = Field(min_length=3, max_length=1000)
    effective_from: date
    params: DeclarationParams = Field(default_factory=DeclarationParams)
    evidence: list[EvidenceItem] = Field(default_factory=list, max_length=200)
    submitted_by: str = Field(default="merchant", min_length=1, max_length=80)

    @field_validator("effective_from")
    @classmethod
    def _in_history(cls, v: date) -> date:
        if not (seed.START_DATE <= v <= config.AS_OF):
            raise ValueError(f"effective_from must be between {seed.START_DATE} and {config.AS_OF}")
        return v


class ReviewIn(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    reviewer: str = Field(min_length=1, max_length=80)
    note: str = Field(min_length=3, max_length=2000)


@app.get("/api/merchants/{mid}/declaration-template")
def declaration_template(mid: str):
    """DEMO-ONLY helper: pre-fills a declaration from the merchant's own seeded records."""
    with db.lock():
        _assessment(mid)
        recs = [dict(r) for r in conn().execute("SELECT * FROM merchant_records WHERE merchant_id = ? ORDER BY day, id", (mid,))]
        if not recs:
            raise HTTPException(404, "No demo template for this merchant")
        first = min(r["day"] for r in recs)
        return {
            "demo_only": True,
            "change_type": "CATERING",
            "description": "Started corporate catering for four office clients (weekday lunch orders), using FreshPack for catering packaging.",
            "effective_from": seed.day_to_date(first).isoformat(),
            "params": {"counterparties": sorted({r["counterparty"] for r in recs}), "ticket_min": 5000, "ticket_max": 25000,
                       "hours_open": 9, "hours_close": 17, "beneficiary_ids": ["BEN-X3"]},
            "evidence": [{"kind": "invoice", "reference": r["reference"], "amount": r["amount"], "counterparty": r["counterparty"]} for r in recs],
            "submitted_by": "merchant",
        }


@app.post("/api/merchants/{mid}/declarations", status_code=201)
def submit_declaration(mid: str, body: DeclarationIn):
    with db.lock():
        _assessment(mid)
        c = conn()
        if body.params.ticket_min is not None and body.params.ticket_max is not None and body.params.ticket_min > body.params.ticket_max:
            raise HTTPException(422, "params.ticket_min must be <= params.ticket_max")
        known = {r[0] for r in c.execute("SELECT id FROM beneficiaries")}
        unknown = [b for b in body.params.beneficiary_ids if b not in known]
        if unknown:
            raise HTTPException(422, f"Unknown beneficiary ids: {', '.join(unknown)}")
        n = c.execute("SELECT COUNT(*) FROM declarations").fetchone()[0] + 1
        did = f"DECL-{n:04d}"
        day = (body.effective_from - seed.START_DATE).days
        ts = db.now_iso()
        c.execute("INSERT INTO declarations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (did, mid, body.change_type, body.description, day, body.params.model_dump_json(),
                   json.dumps([e.model_dump() for e in body.evidence]), "PENDING", ts, body.submitted_by, None, None, None))
        case = _open_case(mid)
        db.audit(c, mid, body.submitted_by, "DECLARATION_SUBMITTED",
                 {"declaration_id": did, "change_type": body.change_type, "evidence_items": len(body.evidence)},
                 case_id=case["id"] if case else None)
        db.bump_data_version(c)
        c.commit()
        return _decl_row(c.execute("SELECT * FROM declarations WHERE id = ?", (did,)).fetchone())


@app.post("/api/declarations/{did}/review")
def review_declaration(did: str, body: ReviewIn):
    with db.lock():
        c = conn()
        row = c.execute("SELECT * FROM declarations WHERE id = ?", (did,)).fetchone()
        if row is None:
            raise HTTPException(404, f"Declaration {did} not found")
        if row["status"] != "PENDING":
            raise HTTPException(409, f"Declaration {did} is already {row['status']}")
        mid = row["merchant_id"]
        before = _assessment(mid)
        c.execute("UPDATE declarations SET status = ?, reviewed_at = ?, reviewer = ?, review_note = ? WHERE id = ?",
                  (body.decision, db.now_iso(), body.reviewer, body.note, did))
        case = _open_case(mid)
        db.audit(c, mid, body.reviewer, f"DECLARATION_{body.decision}", {"declaration_id": did, "note": body.note},
                 case_id=case["id"] if case else None)
        _record_reassessment(mid, before, "system", f"Declaration {did} {body.decision.lower()}")
        return _decl_row(c.execute("SELECT * FROM declarations WHERE id = ?", (did,)).fetchone())


# ---------------------------------------------------------------- cases
class CaseActionIn(BaseModel):
    action: Literal["ADD_NOTE", "CHANGE_STATUS"]
    actor: str = Field(min_length=1, max_length=80)
    note: str = Field(min_length=3, max_length=2000)
    status: Literal[CASE_STATUSES] | None = None  # type: ignore[valid-type]


@app.get("/api/merchants/{mid}/case")
def merchant_case(mid: str):
    with db.lock():
        _assessment(mid)
        case = _open_case(mid)
        return {"case": _case_payload(case) if case else None, "audit": _audit_list(mid)}


@app.post("/api/merchants/{mid}/case", status_code=201)
def open_case(mid: str, actor: str = "analyst"):
    with db.lock():
        a = _assessment(mid)
        if _open_case(mid):
            raise HTTPException(409, "An open case already exists for this merchant")
        c = conn()
        n = c.execute("SELECT COUNT(*) FROM cases WHERE merchant_id = ?", (mid,)).fetchone()[0]
        cid = f"CASE-{mid[2:]}" + (f"-{n + 1}" if n else "")
        ts = db.now_iso()
        c.execute("INSERT INTO cases VALUES (?,?,?,?,?)", (cid, mid, "OPEN", ts, ts))
        db.audit(c, mid, actor, "CASE_OPENED", {"reason": "Opened manually", "score": a["risk"]["score"], "tier": a["risk"]["tier"]}, case_id=cid)
        c.commit()
        return {"case": _case_payload(_open_case(mid)), "audit": _audit_list(mid)}


@app.post("/api/cases/{cid}/actions")
def case_action(cid: str, body: CaseActionIn):
    with db.lock():
        c = conn()
        row = c.execute("SELECT * FROM cases WHERE id = ?", (cid,)).fetchone()
        if row is None:
            raise HTTPException(404, f"Case {cid} not found")
        if row["status"] == "CLOSED_NO_ACTION":
            raise HTTPException(409, "Case is closed")
        ts = db.now_iso()
        c.execute("INSERT INTO case_notes(case_id, ts, actor, note) VALUES (?,?,?,?)", (cid, ts, body.actor, body.note))
        if body.action == "CHANGE_STATUS":
            if body.status is None:
                raise HTTPException(422, "status is required for CHANGE_STATUS")
            if body.status == row["status"]:
                raise HTTPException(409, f"Case is already {body.status}")
            a = _assessment(row["merchant_id"])
            c.execute("UPDATE cases SET status = ?, updated_at = ? WHERE id = ?", (body.status, ts, cid))
            db.audit(c, row["merchant_id"], body.actor, "CASE_STATUS_CHANGED",
                     {"from": row["status"], "to": body.status, "reason": body.note,
                      "score_at_decision": a["risk"]["score"], "tier_at_decision": a["risk"]["tier"]}, case_id=cid)
        else:
            c.execute("UPDATE cases SET updated_at = ? WHERE id = ?", (ts, cid))
            db.audit(c, row["merchant_id"], body.actor, "CASE_NOTE_ADDED", {"note": body.note}, case_id=cid)
        c.commit()
        updated = c.execute("SELECT * FROM cases WHERE id = ?", (cid,)).fetchone()
        return {"case": _case_payload(updated), "audit": _audit_list(row["merchant_id"])}


# ---------------------------------------------------------------- inline scoring + demo
class TxnIn(BaseModel):
    merchant_id: str
    amount: float = Field(gt=0, le=10_000_000)
    timestamp: str
    customer_id: str = Field(min_length=1, max_length=80)


@app.post("/api/score/transaction")
def score_transaction(body: TxnIn):
    with db.lock():
        res = _result()
        if body.merchant_id not in res["assessments"]:
            raise HTTPException(404, f"Merchant {body.merchant_id} not found")
        if _state["scorer_version"] != db.data_version(conn()):
            s = RobustBaselineScorer()
            s.fit({mid: i["md"] for mid, i in res["internals"].items()})
            _state["scorer"], _state["scorer_version"] = s, db.data_version(conn())
        try:
            return timed_score(_state["scorer"], body.merchant_id, body.amount, body.timestamp, body.customer_id)
        except ValueError as e:
            raise HTTPException(422, f"Invalid timestamp: {e}") from e


@app.post("/api/demo/reset")
def demo_reset():
    stats = _reset(conn())
    return {"status": "reset", "data_version": db.data_version(conn()), **stats}


# ---------------------------------------------------------------- static UI
_DIST = os.environ.get("VERITY_UI_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = os.path.join(_DIST, path)
        if path and os.path.isfile(f) and os.path.realpath(f).startswith(os.path.realpath(_DIST)):
            return FileResponse(f)
        return FileResponse(os.path.join(_DIST, "index.html"))
