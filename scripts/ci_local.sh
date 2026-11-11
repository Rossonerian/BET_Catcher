#!/usr/bin/env bash
# Local mirror of .github/workflows/ci.yml (GitHub Actions is the CI of record; see DEC-013).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "== backend: byte-compile"; python3 -m compileall -q "$ROOT/backend/verity"
echo "== backend: tests"; (cd "$ROOT/backend" && python3 -m pytest -q)
echo "== secrets scan"
if grep -RInE '(api[_-]?key|secret|password|token)\s*[:=]\s*["'"'"'][A-Za-z0-9_\-]{12,}' \
     --include='*.py' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.yml' \
     --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=fixtures "$ROOT"; then
  echo "Possible secret found"; exit 1
fi
if [ -f "$ROOT/frontend/package.json" ]; then
  echo "== frontend: install, typecheck, test, build"
  (cd "$ROOT/frontend" && npm ci --no-audit --no-fund && npm run typecheck && npm test && npm run build)
fi
echo "CI OK"
