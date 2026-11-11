#!/usr/bin/env bash
# Records API contract fixtures from a fresh, seeded server. Usage: scripts/record_fixtures.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="$ROOT/docs/contracts/fixtures"; PORT="${PORT:-8765}"; B="http://127.0.0.1:$PORT/api"
DB="$(mktemp -d)/fixtures.db"
cd "$ROOT/backend"
VERITY_DB="$DB" python3 -m uvicorn verity.api:app --port "$PORT" --log-level warning &
PID=$!; trap 'kill $PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "$B/health" >/dev/null 2>&1 && break; sleep 0.5; done
mkdir -p "$F"
get() { curl -sf "$B/$1" > "$F/$2"; }
post() { curl -sf -XPOST -H 'content-type: application/json' -d "$2" "$B/$1" > "$F/$3"; }
get health health.json
get merchants merchants.json
get merchants/M-SWEETCRUST merchant_profile.json
get merchants/M-SWEETCRUST/assessment assessment_sweetcrust_before.json
get merchants/M-HEARTH/assessment assessment_hearth.json
get merchants/M-CRUMB/assessment assessment_crumb.json
get merchants/M-SWEETCRUST/timeseries timeseries_sweetcrust.json
get "network?focus=M-SWEETCRUST" network_sweetcrust.json
get merchants/M-SWEETCRUST/declaration-template declaration_template.json
TPL="$(python3 -c "import json,sys;d=json.load(open('$F/declaration_template.json'));d.pop('demo_only');print(json.dumps(d))")"
post merchants/M-SWEETCRUST/declarations "$TPL" declaration_created.json
DID="$(python3 -c "import json;print(json.load(open('$F/declaration_created.json'))['id'])")"
post "declarations/$DID/review" '{"decision":"APPROVED","reviewer":"analyst.priya","note":"Invoices match four corporate clients"}' declaration_reviewed.json
get merchants/M-SWEETCRUST/assessment assessment_sweetcrust_after.json
post cases/CASE-SWEETCRUST/actions '{"action":"CHANGE_STATUS","status":"UNDER_REVIEW","actor":"analyst.priya","note":"Catering verified; overnight payments unresolved"}' case_action.json
get merchants/M-SWEETCRUST/case case_sweetcrust.json
post score/transaction '{"merchant_id":"M-SWEETCRUST","amount":9999,"timestamp":"2026-11-10T01:15:00","customer_id":"C-W999999"}' score_transaction.json
post demo/reset '{}' demo_reset.json
echo "Recorded $(ls "$F" | wc -l) fixtures into $F"
