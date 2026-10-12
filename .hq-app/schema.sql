CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,company TEXT NOT NULL,contact TEXT,email TEXT,sector TEXT,stage TEXT,value INTEGER,notes TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS lead_details(id TEXT PRIMARY KEY,payload TEXT);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,lead_id TEXT,kind TEXT,status TEXT,content TEXT,created TEXT,updated TEXT);
CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,message TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS settings(service TEXT PRIMARY KEY,enabled INTEGER,detail TEXT);
CREATE TABLE IF NOT EXISTS business(id TEXT PRIMARY KEY,payload TEXT);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,csrf TEXT,expires INTEGER,config_hash TEXT);
CREATE TABLE IF NOT EXISTS login_attempts(id TEXT PRIMARY KEY,created INTEGER);
INSERT OR IGNORE INTO settings VALUES('Gmail',0,'Not connected • setup required'),('Google Calendar',0,'Not connected • setup required'),('Google Drive',0,'Not connected • setup required');
