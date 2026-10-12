import hashlib,json,urllib.request,urllib.error,os
origin=os.environ.get('TEST_ORIGIN','http://localhost:8787'); cookie='';csrf=''
def call(path, data=None, code=200, token=True):
 headers={'Origin':origin,'Content-Type':'application/json'}
 if cookie:headers['Cookie']=cookie
 if token:headers['X-HQ-CSRF']=csrf
 req=urllib.request.Request(origin+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
 try:r=urllib.request.urlopen(req)
 except urllib.error.HTTPError as e:r=e
 assert r.status==code,(path,r.status,r.read().decode())
 payload=r.read();return json.loads(payload) if payload else {},r.headers
call('/hq/api/state',code=401)
challenge,_=call('/hq/auth-challenge');proof=hashlib.pbkdf2_hmac('sha256',os.environ['TEST_PASSWORD'].encode(),bytes.fromhex(challenge['salt']),600000).hex()
result,headers=call('/hq/login',{'passwordProof':proof});cookie=headers['Set-Cookie'].split(';')[0]
state,_=call('/hq/api/state');csrf=state['csrf'];assert len(state['settings'])==3
call('/hq/api/leads',{'company':'Local QA prospect','stage':'Not Contacted'},code=403,token=False)
call('/hq/api/leads',{'company':'Local QA prospect','stage':'Not Contacted'})
state,_=call('/hq/api/state');lead=next(l for l in state['leads'] if l['company']=='Local QA prospect')
call('/hq/api/workflows',{'lead_id':lead['id'],'kind':'outreach'})
state,_=call('/hq/api/state');job=next(j for j in state['jobs'] if j['lead_id']==lead['id']);assert job['status']=='pending'
call('/hq/api/approval',{'id':job['id'],'action':'approve'})
call('/hq/api/approval',{'id':job['id'],'action':'reject'},code=400)
call('/hq/api/send',{},code=404)
call('/hq/api/logout',{})
call('/hq/api/state',code=401)
print('PASS: login, protected state, CSRF, persistent CRM, draft approval, replay rejection, disabled sending, logout')
