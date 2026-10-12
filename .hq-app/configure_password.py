"""Create a private Cloudflare login verifier; never commit the result."""
import getpass,hashlib,json,secrets,os
from pathlib import Path
password=getpass.getpass('HQ password: ')
if len(password)<8 or password!=getpass.getpass('Confirm password: '):raise SystemExit('Passwords must match and have at least 8 characters')
salt=secrets.token_hex(16)
proof=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),600000).hex()
path=Path('work.auth.json');path.write_text(json.dumps({'salt':salt,'password_hash':hashlib.sha256(proof.encode()).hexdigest(),'format':'client-pbkdf2-sha256-600000'}));path.chmod(0o600)
print('Private verifier saved. Pipe work.auth.json to wrangler secret put HQ_AUTH_CONFIG. Do not publish it.')
