"""Server-side login for HQ. Secrets and private data never belong in Pages source."""
import hashlib, hmac, json, os, secrets, time
from http.cookies import SimpleCookie
from urllib.parse import urlsplit

ITERATIONS = 600000

def hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),ITERATIONS).hex()

def load_config(root):
    raw = os.environ.get('HQ_AUTH_CONFIG')
    path = root / 'data' / 'auth.json'
    if not raw and path.exists(): raw = path.read_text()
    if not raw: raise RuntimeError('Password is not configured. Run python3 configure_password.py first.')
    config = json.loads(raw)
    if len(config.get('salt','')) != 32 or len(config.get('password_hash','')) != 64:
        raise RuntimeError('Invalid authentication configuration')
    return config

def secure_handler(base, connect, config, public_origin):
    origin = urlsplit(public_origin)
    if origin.scheme not in ('http','https') or not origin.netloc or origin.path not in ('','/'):
        raise RuntimeError('HQ_PUBLIC_ORIGIN must be an origin without a path')
    if origin.scheme != 'https' and origin.hostname not in ('localhost','127.0.0.1'):
        raise RuntimeError('Public deployment requires HTTPS')
    secure = origin.scheme == 'https'
    with connect() as con:
        con.executescript('''CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT, expires REAL);
        CREATE TABLE IF NOT EXISTS login_attempts (created REAL);''')

    class ProtectedHandler(base):
        session = None
        def end_headers(self):
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('X-Frame-Options','DENY')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; connect-src 'self'")
            if secure: self.send_header('Strict-Transport-Security','max-age=31536000')
            super().end_headers()
        def send_json(self, data, status=200):
            if self.session and isinstance(data,dict) and 'leads' in data:
                data['csrf'] = self.session['csrf']
            super().send_json(data,status)
        def cookie(self, token, ttl=28800):
            return 'hq_session='+token+'; Path=/hq; HttpOnly; SameSite=Strict; Max-Age='+str(ttl)+('; Secure' if secure else '')
        def authenticate(self):
            try:
                cookie = SimpleCookie(self.headers.get('Cookie',''))
                token = cookie['hq_session'].value if 'hq_session' in cookie else ''
            except Exception: token = ''
            if len(token) > 100: return False
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            with connect() as con:
                con.execute('DELETE FROM sessions WHERE expires < ?',(time.time(),))
                row = con.execute('SELECT * FROM sessions WHERE token_hash=?',(token_hash,)).fetchone()
            self.session = dict(row) if row else None
            return bool(row)
        def redirect(self, location):
            self.send_response(303); self.send_header('Location',location); self.send_header('Content-Length','0'); self.end_headers()
        def public_file(self, filename, mime):
            body = (self.server.hq_root / 'static' / filename).read_bytes()
            self.send_response(200); self.send_header('Content-Type',mime); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        def allowed_host(self):
            return self.headers.get('Host','').lower() == origin.netloc.lower()
        def do_GET(self):
            if self.path == '/healthz':
                self.send_json({'ok':True}); return
            if not self.allowed_host(): self.send_json({'error':'Invalid host'},400); return
            path = urlsplit(self.path).path
            if path in ('/','/hq'): self.redirect('/hq/'); return
            public = {'/hq/login':('login.html','text/html'),'/hq/login.js':('login.js','text/javascript'),'/hq/style.css':('style.css','text/css'),'/hq/logo.jpg':('logo.jpg','image/jpeg')}
            if path in public:
                self.public_file(*public[path]); return
            if not path.startswith('/hq/'):
                self.send_json({'error':'Not found'},404); return
            if not self.authenticate():
                if path.startswith('/hq/api/'): self.send_json({'error':'Login required'},401)
                else: self.redirect('/hq/login')
                return
            self.path = path[3:]
            super().do_GET()
        def do_POST(self):
            if not self.allowed_host() or self.headers.get('Origin') != public_origin.rstrip('/'):
                self.send_json({'error':'Cross-origin write denied'},403); return
            path = urlsplit(self.path).path
            if path == '/hq/login':
                self.login(); return
            if not path.startswith('/hq/api/'):
                self.send_json({'error':'Not found'},404); return
            if not self.authenticate(): self.send_json({'error':'Login required'},401); return
            if not hmac.compare_digest(self.headers.get('X-HQ-CSRF',''),self.session['csrf']):
                self.send_json({'error':'Invalid request token'},403); return
            if path == '/hq/api/logout':
                with connect() as con: con.execute('DELETE FROM sessions WHERE token_hash=?',(self.session['token_hash'],))
                self.send_response(200); self.send_header('Set-Cookie',self.cookie('',0)); self.send_header('Content-Type','application/json'); self.send_header('Content-Length','11'); self.end_headers(); self.wfile.write(b'{"ok":true}'); return
            self.path = path[3:]
            # Origin was verified above against configured HTTPS origin.
            original = self.headers.get('Origin')
            del self.headers['Origin']
            try: super().do_POST()
            finally: self.headers['Origin'] = original
        def login(self):
            with connect() as con:
                con.execute('BEGIN IMMEDIATE')
                con.execute('DELETE FROM login_attempts WHERE created < ?',(time.time()-900,))
                if con.execute('SELECT count(*) FROM login_attempts').fetchone()[0] >= 10:
                    self.send_json({'error':'Too many login attempts. Try again in 15 minutes.'},429); return
                con.execute('INSERT INTO login_attempts VALUES (?)',(time.time(),))
            try:
                length = int(self.headers.get('Content-Length','0'))
                if length <= 0 or length > 1024: raise ValueError()
                password = json.loads(self.rfile.read(length)).get('password','')
                if not isinstance(password,str) or len(password)>256: raise ValueError()
            except (ValueError,TypeError,AttributeError): self.send_json({'error':'Invalid login request'},400); return
            if not hmac.compare_digest(hash_password(password,config['salt']),config['password_hash']):
                self.send_json({'error':'Incorrect password'},401); return
            token = secrets.token_urlsafe(32)
            with connect() as con:
                con.execute('BEGIN IMMEDIATE')
                con.execute('DELETE FROM login_attempts')
                con.execute('INSERT INTO sessions VALUES (?, ?, ?)',(hashlib.sha256(token.encode()).hexdigest(),secrets.token_urlsafe(32),time.time()+28800))
            body = b'{"ok":true}'
            self.send_response(200); self.send_header('Set-Cookie',self.cookie(token)); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    return ProtectedHandler
