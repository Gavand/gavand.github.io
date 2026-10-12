const stamp=()=>new Date().toISOString(), id=()=>crypto.randomUUID();
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(s.match(/../g)||[],v=>parseInt(v,16));
const encode=s=>new TextEncoder().encode(s);
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',encode(s)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function verifyPassword(proof,config){
 if(typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof)||!/^[a-f0-9]{64}$/.test(config.password_hash))return false;
 const actual=await hash(proof);let difference=0;
 for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^config.password_hash.charCodeAt(i);return difference===0;
}
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...security,'Content-Type':'application/json',...extra}});
const redirect=path=>new Response(null,{status:302,headers:{...security,Location:path}});
async function body(request){const text=await request.text();if(encode(text).length>100000)throw Error('Request too large');const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request');return data;}
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const one=(env,sql,...args)=>stmt(env,sql,...args).first();
const list=async(env,sql)=> (await env.DB.prepare(sql).all()).results;
const event=(env,message)=>stmt(env,'INSERT INTO activity VALUES(?,?,?)',id(),message,stamp());
const field=(data,key)=>String(data[key]??'');
const cookie=token=>`hq_session=${token}; Path=/hq; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
const stages=['Not Contacted','Sent','Discovery','Pilot Agreed','Dead','New','Qualified','Proposal','Won'];
async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/healthz')return json({ok:true});
 if(url.origin!==env.HQ_PUBLIC_ORIGIN)return json({error:'Workspace origin is not configured for this address'},503);
 if(!env.HQ_AUTH_CONFIG||!env.DB)return json({error:'Workspace setup is incomplete'},503);
 const config=JSON.parse(env.HQ_AUTH_CONFIG), configHash=await hash(env.HQ_AUTH_CONFIG);
 if(path==='/'||path==='/hq')return redirect('/hq/');
 if(!path.startsWith('/hq/'))return json({error:'Not found'},404);
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Cross-origin write denied'},403);
 if(path==='/hq/auth-challenge'&&request.method==='GET')return json({salt:config.salt,iterations:600000});
 if(path==='/hq/login'&&request.method==='POST'){
  const data=await body(request), now=Date.now();
  // The conditional insert is a single SQL operation, so concurrent attempts share the same limit.
  await stmt(env,'DELETE FROM login_attempts WHERE created<?',now-900000).run();
  const reserved=await stmt(env,'INSERT INTO login_attempts SELECT ?,? WHERE (SELECT count(*) FROM login_attempts)<10',id(),now).run();
  if(!reserved.meta.changes)return json({error:'Too many login attempts. Try again in 15 minutes.'},429);
  if(!await verifyPassword(data.passwordProof,config))return json({error:'Incorrect password'},401);
  const token=random(),csrf=random();
  await env.DB.batch([stmt(env,'DELETE FROM sessions WHERE expires<?',now),stmt(env,'INSERT INTO sessions VALUES(?,?,?,?)',await hash(token),csrf,now+28800000,configHash)]);
  return json({ok:true},200,{'Set-Cookie':cookie(token)});
 }
 const token=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)hq_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const session=token?await one(env,'SELECT * FROM sessions WHERE token_hash=? AND expires>? AND config_hash=?',await hash(token),Date.now(),configHash):null;
 const publicAssets={'/hq/login':'login.html','/hq/login.html':'login.html','/hq/login.js':'login.js','/hq/style.css':'style.css','/hq/logo.jpg':'logo.jpg'};
 if(request.method==='GET'&&publicAssets[path])return asset(request,env,publicAssets[path]);
 if(!session)return path.startsWith('/hq/api/')?json({error:'Sign in required'},401):redirect('/hq/login');
 if(request.method==='GET'){
  if(path==='/hq/'||path==='/hq/index.html')return asset(request,env,'index.html');
  if(path==='/hq/app.js')return asset(request,env,'app.js');
  if(path==='/hq/api/state'){
   const result={csrf:session.csrf};
   for(const table of ['leads','jobs','activity','settings'])result[table]=await list(env,`SELECT * FROM ${table}${table==='settings'?'':' ORDER BY created DESC'}`);
   const details=await list(env,'SELECT * FROM lead_details');
   for(const lead of result.leads){const extra=details.find(d=>d.id===lead.id);if(extra)for(const [key,value] of Object.entries(JSON.parse(extra.payload)))if(!(key in lead))lead[key]=value;}
   result.business=JSON.parse((await one(env,"SELECT payload FROM business WHERE id='snapshot'"))?.payload||'{}');delete result.business.leads;
   return json(result);
  }
  return json({error:'Not found'},404);
 }
 if(request.headers.get('X-HQ-CSRF')!==session.csrf)return json({error:'Invalid request token'},403);
 if(path==='/hq/api/logout'){await stmt(env,'DELETE FROM sessions WHERE token_hash=?',session.token_hash).run();return json({ok:true},200,{'Set-Cookie':'hq_session=; Path=/hq; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});}
 const data=await body(request);
 if(path==='/hq/api/leads'){
  const company=field(data,'company').trim(),stage=data.stage||'Not Contacted',value=Number(data.value||0);
  if(!company||!stages.includes(stage)||!Number.isSafeInteger(value)||value<0)throw Error('Check company, stage and value');
  const leadId=data.id||id(),existing=await one(env,'SELECT * FROM leads WHERE id=?',leadId);
  if(data.id&&!existing)throw Error('Lead not found');
  const detail=JSON.parse((await one(env,'SELECT payload FROM lead_details WHERE id=?',leadId))?.payload||'{}');
  for(const key of ['location','phone','date_emailed','date_called','followup','reason'])if(key in data)detail[key]=field(data,key);
  await env.DB.batch([stmt(env,'INSERT OR REPLACE INTO leads VALUES(?,?,?,?,?,?,?,?,?)',leadId,company,field(data,'contact'),field(data,'email'),field(data,'sector'),stage,value,field(data,'notes'),existing?.created||stamp()),stmt(env,'INSERT OR REPLACE INTO lead_details VALUES(?,?)',leadId,JSON.stringify(detail)),event(env,(existing?'Updated ':'Added ')+company)]);
 }else if(path==='/hq/api/workflows'){
  const lead=await one(env,'SELECT * FROM leads WHERE id=?',data.lead_id||'');
  if(!lead||!['research','outreach'].includes(data.kind))throw Error('Choose a lead and workflow');
  const research=data.kind==='research';
  const content=research?`SIMULATED RESEARCH — no web sources consulted.\n\nCompany: ${lead.company}\nSector supplied in CRM: ${lead.sector}\n\nDiscovery questions:\n• How do students assemble and program robots today?\n• Which instructor setup and curriculum steps cause delays?\n• Who owns the pilot budget and defines success?\n\nVerify company facts and add source links before qualification.`:`Subject: Exploring robotics at ${lead.company}\n\nHi ${lead.contact||'there'},\n\nI’m reaching out from Andbotics. We are developing AC-1, a humanoid robot kit that students assemble and program, for STEM enrichment programs.\n\nWould you be open to a short conversation about your robotics program and whether an AC-1 demonstration could be a fit?\n\nBest,\nAndbotics\n\n[Simulated template — verify recipient, program and product readiness. No customer, traction, pricing or performance claims have been inferred.]`;
  await env.DB.batch([stmt(env,'INSERT INTO jobs VALUES(?,?,?,?,?,?,?)',id(),lead.id,data.kind,research?'completed':'pending',content,stamp(),stamp()),event(env,(research?'Simulated research completed for ':'Outreach draft queued for approval: ')+lead.company)]);
 }else if(path==='/hq/api/approval'){
  if(!['approve','reject'].includes(data.action))throw Error('Invalid action');
  const job=await one(env,"SELECT * FROM jobs WHERE id=? AND kind='outreach' AND status='pending'",data.id||'');if(!job)throw Error('Draft is not pending approval');
  const content=String(data.content??job.content).trim();if(!content)throw Error('Draft cannot be empty');
  const status=data.action==='approve'?'approved':'rejected';
  const changed=await stmt(env,"UPDATE jobs SET status=?,content=?,updated=? WHERE id=? AND status='pending'",status,content,stamp(),job.id).run();if(!changed.meta.changes)throw Error('Draft is not pending approval');
  await event(env,'Draft '+status+(status==='approved'?' — saved only; no email sent':'')).run();
 }else return json({error:'No such operation. External sending is not implemented.'},404);
 return json({ok:true});
}
async function asset(request,env,name){const url=new URL(request.url);url.pathname='/'+name;url.search='';const result=await env.ASSETS.fetch(new Request(url));const headers=new Headers(result.headers);for(const [key,value] of Object.entries(security))headers.set(key,value);return new Response(result.body,{status:result.status,headers});}
export default {async fetch(request,env){try{return await handle(request,env);}catch(error){if(error instanceof SyntaxError)return json({error:'Invalid request or configuration'},400);if(/^(Request too large|Invalid request|Check company|Lead not found|Choose a lead|Invalid action|Draft)/.test(error.message))return json({error:error.message},400);return json({error:'Workspace request failed'},500);}}};
