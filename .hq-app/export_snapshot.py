"""Convert private tracker snapshot to a private, idempotent D1 import. Never publish the output."""
import json,sys,datetime
from pathlib import Path
quote=lambda value:"'"+str(value).replace("'","''")+"'"
data=json.loads(Path(sys.argv[1]).read_text());stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
statements=[]
for lead in data.get('leads',[]):
 values=[lead.get(k,'') for k in ['id','company','contact','email','sector','stage','value','notes']]+[stamp]
 statements.append('INSERT OR IGNORE INTO leads VALUES('+','.join(quote(v) for v in values)+');')
 statements.append('INSERT OR IGNORE INTO lead_details VALUES('+quote(lead['id'])+','+quote(json.dumps(lead))+');')
summary={k:v for k,v in data.items() if k!='leads'}
statements.append('INSERT OR IGNORE INTO business VALUES(\'snapshot\','+quote(json.dumps(summary))+');')
Path(sys.argv[2]).write_text('\n'.join(statements));Path(sys.argv[2]).chmod(0o600)
print('Private import prepared; existing records are preserved.')
