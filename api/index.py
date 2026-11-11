"""Vercel entrypoint for /api/*. SQLite lives in /tmp; cold instances re-seed the synthetic data (~2 s)."""
import os
import sys

os.environ.setdefault("VERITY_DB", "/tmp/verity.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from verity import api as _api  # noqa: E402

_api._ensure_seeded(_api.conn())  # lifespan may not run on serverless
app = _api.app
