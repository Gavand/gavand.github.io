#!/usr/bin/env python3
"""Andbotics HQ: dependency-free local MVP. No external messages are sent."""
import json, os, sqlite3, uuid
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REFERENCE_DIR = Path(os.environ.get('HQ_REFERENCE_DIR',str(ROOT / 'references')))
DB = Path(os.environ.get('HQ_DATABASE', str(ROOT / 'data' / 'hq.sqlite3')))
STAGES = ['Not Contacted', 'Sent', 'Discovery', 'Pilot Agreed', 'Dead', 'New', 'Qualified', 'Proposal', 'Won']

def now(): return datetime.now(timezone.utc).isoformat()
def connect():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con
def event(con, message):
    con.execute('INSERT INTO activity VALUES (?, ?, ?)', (str(uuid.uuid4()), message, now()))
def init():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        con.executescript('''CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, company TEXT NOT NULL, contact TEXT, email TEXT, sector TEXT, stage TEXT, value INTEGER, notes TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, lead_id TEXT, kind TEXT, status TEXT, content TEXT, created TEXT, updated TEXT);
        CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, message TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS settings (service TEXT PRIMARY KEY, enabled INTEGER, detail TEXT);''')
        if not con.execute('SELECT count(*) FROM settings').fetchone()[0]:
            for service in ['Gmail', 'Google Calendar', 'Google Drive']:
                con.execute('INSERT INTO settings VALUES (?, 0, ?)', (service, 'Not connected • setup required'))
            samples = [('Meridian Manufacturing','Alex Morgan','alex@example.com','Manufacturing','Proposal',24000),('Northstar Logistics','Sam Chen','sam@example.com','Logistics','Discovery',18000),('Atlas Labs','Jordan Lee','jordan@example.com','Research','Qualified',12500),('Fieldwork Robotics','Taylor Brooks','taylor@example.com','Robotics','New',32000),('Evergreen Automation','Casey Reed','casey@example.com','Manufacturing','Won',16000)]
            if REFERENCE_DIR.joinpath('business-data.json').exists() or os.environ.get('HQ_SEED_DEMO','false') != 'true': samples = []
            for company, contact, email, sector, stage, value in samples:
                con.execute('INSERT INTO leads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', (str(uuid.uuid4()), company, contact, email, sector, stage, value, 'Demo lead — replace with a real prospect.', now()))
            event(con, 'Local workspace initialized' if not samples else 'Workspace initialized with 5 clearly marked demo leads')

        from import_data import import_snapshot
        import_snapshot(con, ROOT, REFERENCE_DIR)

class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/api/state':
            with connect() as con:
                result = {name:[dict(r) for r in con.execute('SELECT * FROM ' + name + (' ORDER BY created DESC' if name != 'settings' else ''))] for name in ['leads','jobs','activity','settings']}
                details = {r['id']:json.loads(r['payload']) for r in con.execute('SELECT * FROM lead_details')}
                for lead in result['leads']:
                    lead.update({k:v for k,v in details.get(lead['id'],{}).items() if k not in lead})
                source = REFERENCE_DIR / 'business-data.json'
                result['business'] = json.loads(source.read_text()) if source.exists() else {}
                result['business'].pop('leads',None)
                self.send_json(result)
            return
        paths = {'/':'index.html','/app.js':'app.js','/style.css':'style.css','/logo.jpg':'logo.jpg'}
        if self.path not in paths: self.send_json({'error':'Not found'},404); return
        file = ROOT / 'static' / paths[self.path]
        body = file.read_bytes(); self.send_response(200)
        self.send_header('Content-Type', {'html':'text/html','js':'text/javascript','css':'text/css','jpg':'image/jpeg'}[file.suffix[1:]])
        self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        # Same-origin writes only. This is a local, single-user app, not an internet deployment.
        if self.headers.get('Origin') and self.headers['Origin'] != 'http://' + self.headers.get('Host',''):
            self.send_json({'error':'Cross-origin write denied'},403); return
        try:
            length = int(self.headers.get('Content-Length',0))
            if length > 100000: raise ValueError('Request too large')
            data = json.loads(self.rfile.read(length))
            with connect() as con:
                if self.path == '/api/leads':
                    company = str(data.get('company','')).strip()
                    if not company: raise ValueError('Company is required')
                    stage = data.get('stage','Not Contacted')
                    if stage not in STAGES: raise ValueError('Invalid stage')
                    value = int(data.get('value',0))
                    if value < 0: raise ValueError('Value must be positive')
                    lead_id = data.get('id') or str(uuid.uuid4())
                    existing = con.execute('SELECT * FROM leads WHERE id=?',(lead_id,)).fetchone()
                    if data.get('id') and not existing: raise ValueError('Lead not found')
                    con.execute('INSERT OR REPLACE INTO leads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', (lead_id, company, str(data.get('contact','')), str(data.get('email','')), str(data.get('sector','')), stage, value, str(data.get('notes','')), existing['created'] if existing else now()))
                    old_details = con.execute('SELECT payload FROM lead_details WHERE id=?',(lead_id,)).fetchone()
                    detail = json.loads(old_details[0]) if old_details else {}
                    for key in ['location','phone','date_emailed','date_called','followup','reason']:
                        if key in data: detail[key] = str(data[key])
                    con.execute('INSERT OR REPLACE INTO lead_details VALUES (?, ?)',(lead_id,json.dumps(detail)))
                    event(con, ('Updated ' if existing else 'Added ') + company)
                elif self.path == '/api/workflows':
                    lead = con.execute('SELECT * FROM leads WHERE id=?',(data.get('lead_id'),)).fetchone()
                    if not lead: raise ValueError('Choose a lead')
                    kind = data.get('kind')
                    if kind not in ['research','outreach']: raise ValueError('Invalid workflow')
                    if kind == 'research':
                        content = 'SIMULATED RESEARCH — no web sources consulted.\n\nCompany: ' + lead['company'] + '\nSector supplied in CRM: ' + lead['sector'] + '\n\nSuggested discovery questions:\n• How do students currently assemble and program robots?\n• Which instructor setup, curriculum and calibration steps cause delays?\n• Who teaches the program, owns the pilot budget and defines success?\n\nNext step: verify company facts and document source links before qualification.'
                        status = 'completed'
                    else:
                        content = 'Subject: Exploring automation at ' + lead['company'] + '\n\nHi ' + (lead['contact'] or 'there') + ',\n\nI’m reaching out from Andbotics. We are developing AC-1, a humanoid robot kit that students assemble and program, for STEM enrichment programs.\n\nWould you be open to a short conversation about your robotics program, instructor setup needs, and whether an AC-1 demonstration could be a fit?\n\nBest,\nAndbotics\n\n[Simulated template — verify recipient, current program and product readiness. No customer, traction, pricing or performance claims have been inferred.]'
                        status = 'pending'
                    con.execute('INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?)',(str(uuid.uuid4()),lead['id'],kind,status,content,now(),now()))
                    event(con, ('Simulated research completed for ' if kind == 'research' else 'Outreach draft queued for approval: ') + lead['company'])
                elif self.path == '/api/approval':
                    job = con.execute('SELECT * FROM jobs WHERE id=?',(data.get('id'),)).fetchone()
                    if not job or job['kind'] != 'outreach' or job['status'] != 'pending': raise ValueError('Draft is not pending approval')
                    action = data.get('action')
                    if action not in ['approve','reject']: raise ValueError('Invalid action')
                    content = str(data.get('content',job['content'])).strip()
                    if not content: raise ValueError('Draft cannot be empty')
                    status = 'approved' if action == 'approve' else 'rejected'
                    con.execute('UPDATE jobs SET status=?, content=?, updated=? WHERE id=?',(status,content,now(),job['id']))
                    event(con, 'Draft ' + status + (' — saved only; no email sent' if status == 'approved' else ''))
                else:
                    self.send_json({'error':'No such operation. External sending is not implemented.'},404); return
            self.send_json({'ok':True})
        except (ValueError, TypeError, json.JSONDecodeError) as exc: self.send_json({'error':str(exc)},400)
        except Exception: self.send_json({'error':'Internal error'},500)

if __name__ == '__main__':
    from security import load_config, secure_handler
    config = load_config(ROOT)
    init()
    port = int(os.environ.get('PORT','8765'))
    origin = os.environ.get('HQ_PUBLIC_ORIGIN','http://127.0.0.1:'+str(port))
    ProtectedHandler = secure_handler(Handler, connect, config, origin)
    host = os.environ.get('HQ_BIND','127.0.0.1')
    httpd = ThreadingHTTPServer((host,port),ProtectedHandler)
    httpd.hq_root = ROOT
    print('Andbotics HQ running at '+origin+'/hq/',flush=True)
    httpd.serve_forever()
