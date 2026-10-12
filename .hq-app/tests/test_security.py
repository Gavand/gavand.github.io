import hashlib, io, json, sys, tempfile, unittest
from pathlib import Path
from email.message import Message
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server as hq
from security import secure_handler, hash_password

class SecurityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patch = patch.object(hq,'DB',Path(self.temp.name)/'db.sqlite3'); self.patch.start(); hq.init()
        self.config={'salt':'12'*16,'password_hash':hash_password('test-password','12'*16)}
        self.handler = secure_handler(hq.Handler,hq.connect,self.config,'https://hq.example.com')
    def tearDown(self): self.patch.stop(); self.temp.cleanup()
    def request(self,path,method='GET',data=None,cookie='',csrf='',origin='https://hq.example.com'):
        obj=object.__new__(self.handler);obj.path=path;obj.headers=Message();obj.server=SimpleNamespace(hq_root=hq.ROOT)
        obj.headers['Host']='hq.example.com';obj.headers['Origin']=origin;obj.headers['Cookie']=cookie;obj.headers['X-HQ-CSRF']=csrf
        raw=json.dumps(data or {}).encode();obj.headers['Content-Length']=str(len(raw));obj.rfile=io.BytesIO(raw);obj.wfile=io.BytesIO()
        result={'headers':{}}
        obj.send_response=lambda status:result.update(status=status)
        obj.send_header=lambda k,v:result['headers'].update({k:v})
        obj.end_headers=lambda:None
        getattr(obj,'do_'+method)()
        if obj.wfile.getvalue():
            try:result['body']=json.loads(obj.wfile.getvalue())
            except ValueError:result['body']=obj.wfile.getvalue()
        return result
    def login(self):
        result=self.request('/hq/login','POST',{'password':'test-password'})
        self.assertEqual(result['status'],200)
        return result['headers']['Set-Cookie'].split(';')[0],result['headers']['Set-Cookie']
    def test_private_data_is_protected(self):
        self.assertEqual(self.request('/hq/api/state')['status'],401)
        self.assertEqual(self.request('/api/state')['status'],404)
        self.assertEqual(self.request('/hq/')['headers']['Location'],'/hq/login')
        self.assertEqual(self.request('/hq/api/leads','POST',{'company':'Blocked'})['status'],401)
        self.assertEqual(self.request('/hq/references/business-data.json')['status'],303)
    def test_login_csrf_logout_and_expiration(self):
        cookie,header=self.login()
        self.assertIn('HttpOnly',header);self.assertIn('Secure',header);self.assertIn('SameSite=Strict',header)
        state=self.request('/hq/api/state',cookie=cookie);self.assertEqual(state['status'],200)
        csrf=state['body']['csrf']
        self.assertEqual(self.request('/hq/api/leads','POST',{'company':'Protected lead'},cookie=cookie)['status'],403)
        self.assertEqual(self.request('/hq/api/leads','POST',{'company':'Protected lead'},cookie=cookie,csrf=csrf,origin='https://evil.example')['status'],403)
        self.assertEqual(self.request('/hq/api/leads','POST',{'company':'Protected lead'},cookie=cookie,csrf=csrf)['status'],200)
        self.assertEqual(self.request('/hq/api/logout','POST',cookie=cookie,csrf=csrf)['status'],200)
        self.assertEqual(self.request('/hq/api/state',cookie=cookie)['status'],401)
        cookie,_=self.login()
        with hq.connect() as con:con.execute('UPDATE sessions SET expires=0')
        self.assertEqual(self.request('/hq/api/state',cookie=cookie)['status'],401)
    def test_password_throttling(self):
        for _ in range(10):self.assertEqual(self.request('/hq/login','POST',{'password':'wrong'})['status'],401)
        self.assertEqual(self.request('/hq/login','POST',{'password':'test-password'})['status'],429)
    def test_config_rejects_unencrypted_public_origin(self):
        with self.assertRaises(RuntimeError):secure_handler(hq.Handler,hq.connect,self.config,'http://hq.example.com')

if __name__=='__main__':unittest.main()
