"""Idempotent snapshot import. Never writes to Google Drive."""
import json, uuid
from pathlib import Path
from datetime import datetime, timezone

def import_snapshot(con, root, reference_dir=None):
    con.execute('CREATE TABLE IF NOT EXISTS lead_details (id TEXT PRIMARY KEY, payload TEXT)')
    con.execute('CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, imported TEXT)')
    source = (reference_dir or root / 'references') / 'business-data.json'
    if not source.exists() or con.execute("SELECT 1 FROM imports WHERE id='tracker-v1'").fetchone(): return
    data = json.loads(source.read_text())
    # Remove only untouched fictional seeds. User-created and edited records are preserved.
    demo_ids = [r[0] for r in con.execute("SELECT id FROM leads WHERE notes='Demo lead — replace with a real prospect.'")]
    for lead_id in demo_ids:
        con.execute('DELETE FROM jobs WHERE lead_id=?',(lead_id,))
        con.execute('DELETE FROM leads WHERE id=?',(lead_id,))
    stamp = datetime.now(timezone.utc).isoformat()
    for lead in data['leads']:
        con.execute('INSERT OR IGNORE INTO leads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',tuple(lead[k] for k in ['id','company','contact','email','sector','stage','value','notes'])+(stamp,))
        con.execute('INSERT OR IGNORE INTO lead_details VALUES (?, ?)',(lead['id'],json.dumps(lead)))
    con.execute('INSERT INTO imports VALUES (?, ?)',('tracker-v1',stamp))
    con.execute('INSERT INTO activity VALUES (?, ?, ?)',(str(uuid.uuid4()),str(len(data['leads']))+' historical lead records imported from Andbotics Tracker.xlsx; no messages sent',stamp))
