# Demo runbook — Sweet Crust Bakery (2 minutes)

Scope: [../PROJECT_SOURCE_OF_TRUTH.md](../PROJECT_SOURCE_OF_TRUTH.md) §F. All data is synthetic.

## Start
```bash
scripts/run_demo.sh          # http://127.0.0.1:8000
```
Before every run, press **Reset demo** in the UI (or `curl -XPOST localhost:8000/api/demo/reset`).
Stop with `Ctrl+C`. Nothing runs in the background.

**Hosted alternative:** https://bet-catcher.vercel.app (no install). Press **Reset demo** first. Hosted state is per serverless instance (R-10); if numbers jump back mid-demo, a cold instance re-seeded — press Reset demo and repeat the beat, or switch to the local server.

## Storyline

| Time | Beat | Do | Say / show | Observable success |
|---|---|---|---|---|
| 0:00–0:20 | Establish the merchant | Select **Sweet Crust Bakery** (top of queue) | Declared: bakery, 07:00–21:00, ₹150–₹600. Baseline window 14 Jul–13 Oct; recent window 14 Oct–10 Nov. | Queue sorted by review priority; Sweet Crust 90 · Escalate, confidence 1.0, completeness 0.75 shown separately |
| 0:20–0:45 | Show the change | Behaviour drift chart: `night_share`, then `daytime_avg_ticket` | Overnight payments appear from 18 Oct; daytime ticket +39%. Dashed line = peer median. | Recent window marked; z-scores in feature table |
| 0:45–1:10 | Explain the signals | Peer context, fund flow, network | 8 peer bakeries (n shown). Volume rise is seasonal and in line with peers → explained. Settlements now split to 3 new beneficiaries; BEN-X1 also receives from Golden Oven and Midnight Snacks — a **lead, not proof**. LedgerWise accountant link shown as benign. | Cohort size visible; lead + benign link listed with relationship/source |
| 1:10–1:35 | Test the legitimate explanation | Hypotheses → Declaration: **Load demo example** → Submit → Approve (reviewer + note) | Catering for four corporate clients with 19 invoices. Pending declarations change nothing; approval updates the expected profile. | Banner: 90 → 65, Escalate → Analyst review; daytime ticket + FreshPack signals **EXPLAINED**; overnight / identical ₹9,999 / R. Varma payouts **UNRESOLVED** |
| 1:35–2:00 | Proportionate action | Case: status **Under review**, reason note | No automatic block; actions list and "not permitted" list. Audit timeline shows every step. | Audit: CASE_OPENED → DECLARATION_SUBMITTED → DECLARATION_APPROVED → ASSESSMENT_UPDATED → CASE_STATUS_CHANGED |

### Optional beats (if asked)
- **False-positive control:** select **Hearth & Honey** — +16% volume, in line with peers ⇒ passive monitoring.
- **New merchant:** **Crumb Theory** — 20 days history, confidence 0, enhanced monitoring as a lifecycle default, score 0.
- **Small cohort:** **Midnight Snacks Co.** — only 2 QSR peers ⇒ peer comparison refused, shown as a caveat.
- **Theme 1 hook:** Inline scoring panel — ₹9,999 at 01:15 ⇒ flagged for review in ~tens of µs *on this laptop* (not a Telum measurement).

## API-only fallback (if the UI fails)
```bash
B=http://127.0.0.1:8000/api
curl -s $B/merchants | python3 -m json.tool | head -30
curl -s $B/merchants/M-SWEETCRUST/assessment | python3 -c "import json,sys;a=json.load(sys.stdin);print(a['risk']['score'],a['risk']['tier'])"
curl -s $B/merchants/M-SWEETCRUST/declaration-template | python3 -c "import json,sys;d=json.load(sys.stdin);d.pop('demo_only');print(json.dumps(d))" > /tmp/d.json
curl -s -XPOST -H 'content-type: application/json' -d @/tmp/d.json $B/merchants/M-SWEETCRUST/declarations
curl -s -XPOST -H 'content-type: application/json' -d '{"decision":"APPROVED","reviewer":"analyst","note":"invoices verified"}' $B/declarations/DECL-0001/review
curl -s $B/merchants/M-SWEETCRUST/assessment | python3 -c "import json,sys;a=json.load(sys.stdin);print(a['risk']['score'],a['risk']['tier']);[print(s['resolution'],s['id']) for s in a['signals']]"
```
Swagger UI is at `/docs`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Port in use | `PORT=8010 scripts/run_demo.sh` |
| Blank page | `frontend/dist` missing → `cd frontend && npm ci && npm run build` |
| Numbers differ from this runbook | Not reset since last run → Reset demo |
| Hosted site slow on first click | Cold start re-seeds (~2–5 s); open it a minute before presenting |
| Hosted declaration disappears | New serverless instance (R-10) → Reset demo and redo, or use `scripts/run_demo.sh` |
