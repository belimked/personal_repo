package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestImportD1(t *testing.T) {
	dir := t.TempDir()
	d, e := Open(filepath.Join(dir, "data.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer d.Close()
	if e = d.Migrate(); e != nil {
		t.Fatal(e)
	}
	sql := `-- Wrangler export
CREATE TABLE users (id TEXT);
INSERT INTO users (id,email,name,role,pw_hash,pw_salt,created_at) VALUES ('legacy','legacy@example.com','A','user','hash','salt','2020-01-01T00:00:00.000Z');
CREATE TABLE _cf_internal (id TEXT);
INSERT INTO _cf_KV VALUES ('skip');
INSERT INTO sqlite_sequence VALUES ('users',1);
INSERT INTO d1_migrations VALUES ('skip');
INSERT INTO settings VALUES ('note','"semi;colon
line with ''quote''"');`
	file := filepath.Join(dir, "export.sql")
	if e = os.WriteFile(file, []byte(sql), 0600); e != nil {
		t.Fatal(e)
	}
	counts, e := d.ImportD1(file, false)
	if e != nil {
		t.Fatal(e)
	}
	if counts["users"] != 1 || counts["settings"] != 1 {
		t.Fatal(counts)
	}
	t.Run("reject nonempty", func(t *testing.T) {
		if _, e := d.ImportD1(file, false); e == nil {
			t.Fatal("expected refusal")
		}
	})
	t.Run("replace", func(t *testing.T) {
		counts, e := d.ImportD1(file, true)
		if e != nil || counts["users"] != 1 {
			t.Fatalf("%v %v", counts, e)
		}
	})
	t.Run("rollback on bad statement", func(t *testing.T) {
		bad := filepath.Join(dir, "bad.sql")
		if e := os.WriteFile(bad, []byte("INSERT INTO settings VALUES ('new','1'); INSERT INTO users(id) VALUES ('legacy');"), 0600); e != nil {
			t.Fatal(e)
		}
		if _, e := d.ImportD1(bad, true); e == nil {
			t.Fatal("expected failure")
		}
		var count int
		if e := d.QueryRow("SELECT count(*) FROM users").Scan(&count); e != nil || count != 1 {
			t.Fatalf("rollback: %d %v", count, e)
		}
	})
	var note string
	if e := d.QueryRow("SELECT value FROM settings WHERE key='note'").Scan(&note); e != nil || !strings.Contains(note, "'quote'") || !strings.Contains(note, "semi;colon") {
		t.Fatalf("escaped value: %q %v", note, e)
	}
	if e = d.Migrate(); e != nil {
		t.Fatal(e)
	}
	var n int
	d.QueryRow("SELECT count(*) FROM schema_migrations").Scan(&n)
	if n != 4 {
		t.Fatal(n)
	}
}
func TestBackup(t *testing.T) {
	dir := t.TempDir()
	d, e := Open(filepath.Join(dir, "data.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer d.Close()
	if e = d.Migrate(); e != nil {
		t.Fatal(e)
	}
	path := filepath.Join(dir, "backup.db")
	if e = d.Backup(path); e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(path); e != nil {
		t.Fatal(e)
	}
}
