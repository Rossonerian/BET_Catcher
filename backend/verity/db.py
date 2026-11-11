"""SQLite persistence (stdlib only). Owner: WS-1/WS-2."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, region TEXT NOT NULL,
  size_band TEXT NOT NULL, channel TEXT NOT NULL, description TEXT NOT NULL,
  declared_open INTEGER, declared_close INTEGER,
  declared_ticket_min REAL, declared_ticket_max REAL,
  onboarded_day INTEGER NOT NULL, primary_beneficiary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS beneficiaries (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, registered_owner TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, day INTEGER NOT NULL, ts TEXT NOT NULL,
  hour INTEGER NOT NULL, amount REAL NOT NULL, customer_id TEXT NOT NULL, is_refund INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tx_merchant ON transactions(merchant_id, day);
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, day INTEGER NOT NULL,
  beneficiary_id TEXT NOT NULL, amount REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_st_merchant ON settlements(merchant_id, day);
CREATE TABLE IF NOT EXISTS merchant_records (
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, kind TEXT NOT NULL, reference TEXT NOT NULL,
  counterparty TEXT, amount REAL, day INTEGER
);
CREATE TABLE IF NOT EXISTS declarations (
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, change_type TEXT NOT NULL,
  description TEXT NOT NULL, effective_from_day INTEGER NOT NULL, params TEXT NOT NULL,
  evidence TEXT NOT NULL, status TEXT NOT NULL, submitted_at TEXT NOT NULL, submitted_by TEXT NOT NULL,
  reviewed_at TEXT, reviewer TEXT, review_note TEXT
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, status TEXT NOT NULL,
  opened_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, ts TEXT NOT NULL,
  actor TEXT NOT NULL, note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, merchant_id TEXT NOT NULL, case_id TEXT,
  ts TEXT NOT NULL, actor TEXT NOT NULL, event_type TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
"""

_lock = threading.RLock()


def connect(path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def drop_all(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TRIGGER IF EXISTS audit_no_update; DROP TRIGGER IF EXISTS audit_no_delete;
        DROP TABLE IF EXISTS meta; DROP TABLE IF EXISTS merchants; DROP TABLE IF EXISTS beneficiaries;
        DROP TABLE IF EXISTS transactions; DROP TABLE IF EXISTS settlements; DROP TABLE IF EXISTS merchant_records;
        DROP TABLE IF EXISTS declarations; DROP TABLE IF EXISTS cases; DROP TABLE IF EXISTS case_notes;
        DROP TABLE IF EXISTS audit_events;
        """
    )
    conn.commit()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_meta(conn: sqlite3.Connection, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))


def data_version(conn: sqlite3.Connection) -> int:
    return int(get_meta(conn, "data_version", "0") or 0)


def bump_data_version(conn: sqlite3.Connection) -> int:
    v = data_version(conn) + 1
    set_meta(conn, "data_version", str(v))
    return v


def audit(conn: sqlite3.Connection, merchant_id: str, actor: str, event_type: str, detail: dict[str, Any],
          case_id: str | None = None, ts: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_events(merchant_id, case_id, ts, actor, event_type, detail) VALUES (?,?,?,?,?,?)",
        (merchant_id, case_id, ts or now_iso(), actor, event_type, json.dumps(detail, sort_keys=True)),
    )


def lock() -> threading.RLock:
    return _lock
