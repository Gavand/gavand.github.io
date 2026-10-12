"""Run locally to configure or rotate the HQ password, without committing it."""
import getpass, json, os, secrets
from pathlib import Path
from security import hash_password

def configure(password, root):
    if len(password)<8: raise ValueError('Use a password of at least 8 characters.')
    salt = secrets.token_hex(16)
    data = {'salt':salt,'password_hash':hash_password(password,salt)}
    directory = root / 'data'
    directory.mkdir(parents=True,exist_ok=True)
    path = directory / 'auth.json'
    fd = os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    os.fchmod(fd,0o600)
    with os.fdopen(fd,'w') as out: json.dump(data,out)
    # Revoke old sessions on password rotation.
    database = directory / 'hq.sqlite3'
    if database.exists():
        import sqlite3
        with sqlite3.connect(database) as con:
            if con.execute("SELECT 1 FROM sqlite_master WHERE name='sessions'").fetchone(): con.execute('DELETE FROM sessions')
    return path

if __name__ == '__main__':
    password = getpass.getpass('HQ password: ')
    if password != getpass.getpass('Confirm password: '): raise SystemExit('Passwords differ')
    configure(password,Path(__file__).resolve().parent)
    print('Password configured. Restart the server. Keep data/auth.json private.')
