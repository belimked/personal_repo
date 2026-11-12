CREATE TABLE job_runs (id TEXT PRIMARY KEY,job TEXT NOT NULL,user_id TEXT NOT NULL,run_key TEXT NOT NULL,status TEXT NOT NULL,detail TEXT,started_at TEXT NOT NULL,finished_at TEXT,UNIQUE(job,user_id,run_key));
CREATE INDEX job_runs_recent ON job_runs(job,started_at DESC);
CREATE TABLE briefs (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX briefs_owner ON briefs(user_id,created_at DESC);
