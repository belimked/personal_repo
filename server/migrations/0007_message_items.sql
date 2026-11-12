ALTER TABLE messages ADD COLUMN item_id TEXT;
CREATE INDEX messages_item ON messages(item_id);
