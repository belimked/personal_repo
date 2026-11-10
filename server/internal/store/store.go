package store

import (
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	"xiaohe/server/migrations"
)

type DB struct{ *sql.DB }

func Open(path string) (*DB, error) {
	if path == "" {
		path = "xiaohe.db"
	}
	d, e := sql.Open("sqlite", path)
	if e != nil {
		return nil, e
	}
	d.SetMaxOpenConns(1)
	for _, p := range []string{"journal_mode=WAL", "busy_timeout=5000", "foreign_keys=ON", "synchronous=NORMAL"} {
		if _, e = d.Exec("PRAGMA " + p); e != nil {
			d.Close()
			return nil, e
		}
	}
	return &DB{d}, nil
}
func (d *DB) Migrate() error {
	if _, e := d.Exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"); e != nil {
		return e
	}
	var n int
	if e := d.QueryRow("SELECT count(*) FROM schema_migrations WHERE version='0001_init'").Scan(&n); e != nil {
		return e
	}
	if n != 0 {
		return nil
	}
	tx, e := d.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.Exec(migrations.Init); e != nil {
		return e
	}
	if _, e = tx.Exec("INSERT INTO schema_migrations VALUES(?,?)", "0001_init", time.Now().UTC().Format("2006-01-02T15:04:05.000Z")); e != nil {
		return e
	}
	return tx.Commit()
}
func (d *DB) Rows(q string, args ...any) ([]map[string]any, error) {
	rs, e := d.Query(q, args...)
	if e != nil {
		return nil, e
	}
	defer rs.Close()
	cols, e := rs.Columns()
	if e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for rs.Next() {
		v := make([]any, len(cols))
		ptr := make([]any, len(cols))
		for i := range v {
			ptr[i] = &v[i]
		}
		if e = rs.Scan(ptr...); e != nil {
			return nil, e
		}
		m := map[string]any{}
		for i, k := range cols {
			if b, ok := v[i].([]byte); ok {
				m[k] = string(b)
			} else {
				m[k] = v[i]
			}
		}
		out = append(out, m)
	}
	return out, rs.Err()
}
func (d *DB) One(q string, args ...any) (map[string]any, error) {
	v, e := d.Rows(q, args...)
	if e != nil || len(v) == 0 {
		return nil, e
	}
	return v[0], nil
}
func (d *DB) Backup(path string) error { _, e := d.Exec("VACUUM INTO ?", path); return e }

// Statements separates SQL on semicolons outside quoted strings and comments.
func Statements(s string) []string {
	var out []string
	start := 0
	quote := byte(0)
	line := false
	block := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if line {
			if c == '\n' {
				line = false
			}
			continue
		}
		if block {
			if c == '*' && i+1 < len(s) && s[i+1] == '/' {
				block = false
				i++
			}
			continue
		}
		if quote != 0 {
			if c == quote {
				if i+1 < len(s) && s[i+1] == quote {
					i++
				} else {
					quote = 0
				}
			}
			continue
		}
		if c == '-' && i+1 < len(s) && s[i+1] == '-' {
			line = true
			i++
			continue
		}
		if c == '/' && i+1 < len(s) && s[i+1] == '*' {
			block = true
			i++
			continue
		}
		if c == '\'' || c == '"' {
			quote = c
			continue
		}
		if c == ';' {
			out = append(out, strings.TrimSpace(s[start:i]))
			start = i + 1
		}
	}
	if v := strings.TrimSpace(s[start:]); v != "" {
		out = append(out, v)
	}
	return out
}

var applicationTables = []string{"users", "sessions", "items", "messages", "audit", "settings"}

func (d *DB) ImportD1(path string, replace bool) (map[string]int, error) {
	b, e := os.ReadFile(path)
	if e != nil {
		return nil, e
	}
	tx, e := d.Begin()
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	for _, table := range applicationTables {
		var count int
		if e = tx.QueryRow("SELECT count(*) FROM " + table).Scan(&count); e != nil {
			return nil, e
		}
		if count > 0 && !replace {
			return nil, fmt.Errorf("target application table %s already contains data; use --replace", table)
		}
	}
	if replace {
		for _, table := range applicationTables {
			if _, e = tx.Exec("DELETE FROM " + table); e != nil {
				return nil, e
			}
		}
	}
	for _, stmt := range Statements(string(b)) { // Strip leading SQL comments before checking the statement.
		for {
			t := strings.TrimSpace(stmt)
			if strings.HasPrefix(t, "--") {
				if i := strings.IndexByte(t, '\n'); i >= 0 {
					stmt = t[i+1:]
					continue
				}
				stmt = ""
			}
			break
		}
		s := strings.TrimSpace(stmt)
		upper := strings.ToUpper(s)
		if !strings.HasPrefix(upper, "INSERT INTO ") && !strings.HasPrefix(upper, "REPLACE INTO ") {
			continue
		}
		rest := strings.TrimSpace(s[strings.Index(upper, "INTO ")+5:])
		if rest == "" {
			continue
		}
		name := strings.Fields(rest)[0]
		// D1 exports can put a column list directly after an unquoted table name.
		table := strings.ToLower(strings.Trim(strings.SplitN(name, "(", 2)[0], "`\"[]"))
		allowed := false
		for _, application := range applicationTables {
			if table == application {
				allowed = true
				break
			}
		}
		if !allowed { // Includes sqlite_*, _cf_*, d1_migrations and unknown tables.
			continue
		}
		if _, e = tx.Exec(s); e != nil {
			return nil, fmt.Errorf("import %s: %w", table, e)
		}
	}
	counts := map[string]int{}
	for _, t := range applicationTables {
		var n int
		if e = tx.QueryRow("SELECT count(*) FROM " + t).Scan(&n); e != nil {
			return nil, e
		}
		counts[t] = n
	}
	if e = tx.Commit(); e != nil {
		return nil, e
	}
	return counts, nil
}
