CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('user','admin')),pw_hash TEXT NOT NULL,pw_salt TEXT NOT NULL,disabled INTEGER DEFAULT 0,deleted_at TEXT,created_at TEXT NOT NULL);
CREATE TABLE sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE items (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted INTEGER DEFAULT 0);
CREATE INDEX items_owner ON items(user_id,kind,updated_at);
CREATE TABLE messages (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,thread TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,model TEXT,created_at TEXT NOT NULL);
CREATE INDEX messages_owner ON messages(user_id,thread,created_at);
CREATE TABLE audit (id TEXT PRIMARY KEY,actor_email TEXT NOT NULL,action TEXT NOT NULL,target TEXT,created_at TEXT NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
