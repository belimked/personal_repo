CREATE TABLE search_uses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE INDEX search_uses_user_month ON search_uses(user_id,created_at);
ALTER TABLE recordings ADD COLUMN source_url TEXT;
