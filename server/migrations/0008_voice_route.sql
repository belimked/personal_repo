ALTER TABLE recordings ADD COLUMN intent TEXT;
ALTER TABLE recordings ADD COLUMN step TEXT;
ALTER TABLE messages ADD COLUMN meta TEXT;
CREATE TABLE user_locations(user_id TEXT PRIMARY KEY, lat REAL, lng REAL, accuracy REAL, at TEXT);
