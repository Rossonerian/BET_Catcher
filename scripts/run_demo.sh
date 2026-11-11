#!/usr/bin/env bash
# One-command demo (NFR-001): installs deps if missing, builds the UI, starts the server on :8000.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8000}"
python3 -c "import fastapi, uvicorn, numpy" 2>/dev/null || python3 -m pip install -r "$ROOT/backend/requirements.txt"
if [ -f "$ROOT/frontend/package.json" ] && [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  (cd "$ROOT/frontend" && npm ci --no-audit --no-fund && npm run build)
fi
cd "$ROOT/backend"
echo "VERITY on http://127.0.0.1:$PORT  (API docs: /docs). Data is synthetic and re-seeded on first start."
exec python3 -m uvicorn verity.api:app --host 127.0.0.1 --port "$PORT"
