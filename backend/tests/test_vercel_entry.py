"""Regression test for the Vercel entrypoint (api/index.py) and vercel.json (NFR-001).

Importing api/index.py mutates verity.api._state and os.environ, so the import
runs in a subprocess with its own VERITY_DB.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

SCRIPT = r"""
import sys
sys.path.insert(0, 'api')
import index
from fastapi.testclient import TestClient
c = TestClient(index.app)

r = c.get('/api/health')
assert r.status_code == 200, r.text
assert r.json().get('status') == 'ok', r.text

r = c.get('/api/merchants')
assert r.status_code == 200, r.text
ids = [m['id'] for m in r.json()]
assert ids, 'merchants list is empty'
assert 'M-SWEETCRUST' in ids, ids

assert c.get('/api/nope').status_code == 404
print('OK')
"""


def test_vercel_entrypoint_serves_api(tmp_path):
    env = dict(os.environ, VERITY_DB=str(tmp_path / "v.db"))
    proc = subprocess.run(
        [sys.executable, "-c", SCRIPT],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stderr
    assert "OK" in proc.stdout, proc.stdout + proc.stderr


def test_vercel_json_routes_api_and_output_dir():
    cfg = json.loads((REPO / "vercel.json").read_text(encoding="utf-8"))
    assert cfg["outputDirectory"] == "frontend/dist"
    rewrites = cfg.get("rewrites", [])
    assert any(
        r.get("source", "").startswith("/api/") and r.get("destination") == "/api/index"
        for r in rewrites
    ), rewrites
