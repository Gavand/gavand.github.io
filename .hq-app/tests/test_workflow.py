import importlib.util
import json
import tempfile
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from io import BytesIO

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

spec = importlib.util.spec_from_file_location('hq', Path(__file__).resolve().parents[1] / 'server.py')
hq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hq)

class WorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patch = patch.object(hq, 'DB', Path(self.temp.name) / 'test.sqlite3')
        self.patch.start()
        hq.init()
    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()
    def post(self, path, data):
        handler = object.__new__(hq.Handler)
        raw = json.dumps(data).encode()
        handler.path = path
        handler.headers = {'Content-Length':str(len(raw)), 'Host':'127.0.0.1:8765', 'Origin':'http://127.0.0.1:8765'}
        handler.rfile = BytesIO(raw)
        captured = []
        handler.send_json = lambda data, status=200: captured.append((status, data))
        handler.do_POST()
        return captured[0]
    def test_vertical_slice_and_persistence(self):
        self.assertEqual(self.post('/api/leads', {'company':'Real prospect', 'stage':'Discovery','value':3000})[0],200)
        with hq.connect() as con:
            lead = con.execute('SELECT * FROM leads WHERE company=?',('Real prospect',)).fetchone()
        self.assertEqual(lead['stage'],'Discovery')
        self.assertEqual(self.post('/api/workflows',{'lead_id':lead['id'],'kind':'research'})[0],200)
        self.assertEqual(self.post('/api/workflows',{'lead_id':lead['id'],'kind':'outreach'})[0],200)
        with hq.connect() as con:
            job = con.execute("SELECT * FROM jobs WHERE kind='outreach'").fetchone()
            research = con.execute("SELECT * FROM jobs WHERE kind='research'").fetchone()
        self.assertIn('SIMULATED',research['content'])
        self.assertEqual(job['status'],'pending')
        self.assertEqual(self.post('/api/approval',{'id':research['id'],'action':'approve'})[0],400)
        self.assertEqual(self.post('/api/approval',{'id':job['id'],'action':'approve','content':'Reviewed exact content'})[0],200)
        self.assertEqual(self.post('/api/approval',{'id':job['id'],'action':'approve'})[0],400)
        with hq.connect() as con:
            saved = con.execute('SELECT * FROM jobs WHERE id=?',(job['id'],)).fetchone()
        self.assertEqual(saved['status'],'approved')
        self.assertEqual(saved['content'],'Reviewed exact content')
        self.assertEqual(self.post('/api/send',{'id':job['id']})[0],404)
    @unittest.skipUnless((hq.ROOT / "references/business-data.json").exists(),"Private tracker snapshot is not included in public source")
    def test_import_is_idempotent_and_preserves_edits(self):
        with hq.connect() as con:
            self.assertEqual(con.execute("SELECT count(*) FROM lead_details").fetchone()[0],34)
            lead = con.execute("SELECT * FROM leads WHERE company='Fusion Robotics Education'").fetchone()
            self.assertEqual(lead['stage'],'Pilot Agreed')
            self.assertEqual(lead['value'],0)
            con.execute("UPDATE leads SET notes='My new note' WHERE id=?",(lead['id'],))
        hq.init()
        with hq.connect() as con:
            self.assertEqual(con.execute("SELECT count(*) FROM leads").fetchone()[0],34)
            self.assertEqual(con.execute("SELECT notes FROM leads WHERE id=?",(lead['id'],)).fetchone()[0],'My new note')
            self.assertEqual(con.execute("SELECT email FROM leads WHERE company='USC (Robotics and Autonomous Systems Center)'").fetchone()[0],'')

    def test_validation_and_rejection(self):
        self.assertEqual(self.post('/api/leads',{'company':''})[0],400)
        self.assertEqual(self.post('/api/leads',{'company':'Invalid','stage':'Unrecognized'})[0],400)
        self.assertEqual(self.post('/api/workflows',{'lead_id':'missing','kind':'outreach'})[0],400)
        self.post('/api/leads',{'company':'Rejection test lead'})
        with hq.connect() as con:
            lead_id = con.execute("SELECT id FROM leads WHERE company='Rejection test lead'").fetchone()[0]
        self.post('/api/workflows',{'lead_id':lead_id,'kind':'outreach'})
        with hq.connect() as con:
            job_id = con.execute('SELECT id FROM jobs LIMIT 1').fetchone()[0]
        self.assertEqual(self.post('/api/approval',{'id':job_id,'action':'approve','content':''})[0],400)
        self.assertEqual(self.post('/api/approval',{'id':job_id,'action':'reject'})[0],200)
        self.assertEqual(self.post('/api/approval',{'id':job_id,'action':'approve'})[0],400)

if __name__ == '__main__': unittest.main()
