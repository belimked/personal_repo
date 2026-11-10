CREATE TABLE recordings (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT,mime TEXT NOT NULL,size_bytes INTEGER NOT NULL,duration_s REAL,audio_path TEXT,status TEXT NOT NULL CHECK(status IN ('queued','transcribing','summarizing','done','failed')),attempts INTEGER NOT NULL DEFAULT 0,next_try_at TEXT,error TEXT,recorded_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,finished_at TEXT,audio_deleted_at TEXT);
CREATE INDEX recordings_owner ON recordings(user_id,created_at);
CREATE INDEX recordings_queue ON recordings(status,next_try_at);
CREATE TABLE transcripts (recording_id TEXT PRIMARY KEY,text TEXT NOT NULL,segments TEXT NOT NULL,speakers INTEGER,minutes TEXT,asr_model TEXT,asr_elapsed_s REAL,created_at TEXT NOT NULL);
CREATE TABLE devices (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,platform TEXT NOT NULL,env TEXT NOT NULL,created_at TEXT NOT NULL,last_seen_at TEXT NOT NULL);
CREATE INDEX devices_owner ON devices(user_id);
