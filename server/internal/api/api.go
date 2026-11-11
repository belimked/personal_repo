package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"crypto/sha256"
	"golang.org/x/crypto/pbkdf2"
	"xiaohe/server/internal/llm"
	"xiaohe/server/internal/store"
)

type API struct {
	DB               *store.DB
	LLM              llm.Client
	Version          string
	Origins          []string
	AudioDir         string
	ASRURL, ASRToken string
	OCRURL           string
	Push             *Push
	Jev              Jev
}

func Now() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }
func ID() string {
	var b [16]byte
	rand.Read(b[:])
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func random(n int) string { b := make([]byte, n); rand.Read(b); return hex.EncodeToString(b) }
func Hash(password, salt string) string {
	b, e := hex.DecodeString(salt)
	if e != nil {
		return ""
	}
	return hex.EncodeToString(pbkdf2.Key([]byte(password), b, 100000, 32, sha256.New))
}
func str(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}
func value(v any, def string) string {
	if v == nil || v == "" || v == false {
		return def
	}
	return str(v)
}
func object(v any) bool { _, ok := v.(map[string]any); return ok }
func pub(u map[string]any) map[string]any {
	return map[string]any{"id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"]}
}
func send(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, code, msg string) {
	send(w, status, map[string]any{"error": code, "message": msg})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status != 0 {
		return
	}
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}
func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}

func safeLogPath(path string) string {
	if strings.HasPrefix(path, "/api/devices/") {
		return "/api/devices/{token}"
	}
	return path
}
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/", a.handle)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		logged := &statusWriter{ResponseWriter: w}
		defer func() {
			if recover() != nil {
				log.Printf("request panic method=%s path=%s", r.Method, safeLogPath(r.URL.Path))
				if logged.status == 0 {
					fail(logged, 500, "internal_error", "服务暂时不可用")
				}
			}
			if logged.status == 0 {
				logged.WriteHeader(200)
			}
			log.Printf("request method=%s path=%s status=%d duration=%s", r.Method, safeLogPath(r.URL.Path), logged.status, time.Since(start))
		}()
		w = logged
		origin := r.Header.Get("Origin")
		for _, o := range a.Origins {
			if origin != "" && origin == strings.TrimSpace(o) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
				break
			}
		}
		if r.Method == "OPTIONS" && strings.HasPrefix(r.URL.Path, "/api/") {
			send(w, 200, map[string]any{"ok": true})
			return
		}
		mux.ServeHTTP(w, r)
	})
}
func (a *API) seed() error {
	var n int
	if e := a.DB.QueryRow("SELECT count(*) FROM users").Scan(&n); e != nil {
		return e
	}
	if n > 0 {
		return nil
	}
	for _, v := range [][]string{{"lily@demo.com", "苏晴", "user"}, {"admin@demo.com", "管理员", "admin"}} {
		salt := random(16)
		if _, e := a.DB.Exec("INSERT OR IGNORE INTO users(id,email,name,role,pw_hash,pw_salt,created_at) VALUES(?,?,?,?,?,?,?)", ID(), v[0], v[1], v[2], Hash("demo1234", salt), salt, Now()); e != nil {
			return e
		}
	}
	return nil
}
func (a *API) audit(u map[string]any, action, target string) {
	a.DB.Exec("INSERT INTO audit VALUES(?,?,?,?,?)", ID(), u["email"], action, target, Now())
}
func (a *API) handle(w http.ResponseWriter, r *http.Request) {
	if e := a.seed(); e != nil {
		fail(w, 500, "internal_error", "服务暂时不可用")
		return
	}
	path, method := r.URL.Path, r.Method
	if path == "/api/health" && method == "GET" {
		var n int
		if a.DB.QueryRow("SELECT 1").Scan(&n) != nil {
			fail(w, 500, "internal_error", "服务暂时不可用")
			return
		}
		var queue int
		a.DB.QueryRow("SELECT count(*) FROM recordings WHERE status IN ('queued','transcribing','summarizing')").Scan(&queue)
		asr := "down"
		if a.asrOnline() {
			asr = "ok"
		}
		send(w, 200, map[string]any{"ok": true, "version": a.Version, "db": "ok", "asr": asr, "queue": queue})
		return
	}
	body := map[string]any{}
	if (method == "POST" || method == "PUT" || method == "PATCH") && !(path == "/api/recordings" && method == "POST") {
		if e := json.NewDecoder(r.Body).Decode(&body); e != nil || body == nil {
			fail(w, 400, "invalid_body", "请求内容不是有效 JSON")
			return
		}
	}
	if path == "/api/auth/login" && method == "POST" {
		email := strings.ToLower(strings.TrimSpace(str(body["email"])))
		u, e := a.DB.One("SELECT * FROM users WHERE email=?", email)
		if e != nil {
			a.internal(w)
			return
		}
		if u == nil {
			fail(w, 401, "invalid_credentials", "邮箱或密码不正确")
			return
		}
		if u["disabled"] != int64(0) || u["deleted_at"] != nil {
			fail(w, 403, "account_disabled", "账号已停用或删除")
			return
		}
		if subtle.ConstantTimeCompare([]byte(Hash(str(body["password"]), str(u["pw_salt"]))), []byte(str(u["pw_hash"]))) != 1 {
			fail(w, 401, "invalid_credentials", "邮箱或密码不正确")
			return
		}
		token := random(32)
		_, e = a.DB.Exec("INSERT INTO sessions VALUES(?,?,?,?)", token, u["id"], Now(), time.Now().UTC().Add(30*24*time.Hour).Format("2006-01-02T15:04:05.000Z"))
		if e != nil {
			a.internal(w)
			return
		}
		send(w, 200, map[string]any{"token": token, "user": pub(u)})
		return
	}
	auth := r.Header.Get("Authorization")
	token := ""
	if strings.HasPrefix(auth, "Bearer ") && !strings.ContainsAny(auth[7:], " \t\r\n") {
		token = auth[7:]
	}
	u, e := a.DB.One("SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.token=? AND sessions.expires_at>? AND users.disabled=0 AND users.deleted_at IS NULL", token, Now())
	if e != nil {
		a.internal(w)
		return
	}
	if u == nil {
		fail(w, 401, "unauthorized", "请先登录")
		return
	}
	if path == "/api/auth/logout" && method == "POST" {
		a.DB.Exec("DELETE FROM sessions WHERE token=?", token)
		send(w, 200, map[string]any{"ok": true})
		return
	}
	if path == "/api/me" && method == "GET" {
		send(w, 200, map[string]any{"user": pub(u)})
		return
	}
	if strings.HasPrefix(path, "/api/admin/") {
		if u["role"] != "admin" {
			fail(w, 403, "forbidden", "仅管理员可操作")
			return
		}
		if path == "/api/admin/asr" && method == "GET" {
			a.adminASR(w)
			return
		}
		a.admin(w, r, body, u)
		return
	}
	if u["role"] == "admin" {
		fail(w, 403, "forbidden", "管理员不能访问用户内容")
		return
	}
	a.user(w, r, body, u)
}
func (a *API) internal(w http.ResponseWriter) {
	fail(w, 500, "internal_error", "服务暂时不可用")
}
func (a *API) rows(w http.ResponseWriter, q string, args ...any) []map[string]any {
	v, e := a.DB.Rows(q, args...)
	if e != nil {
		a.internal(w)
	}
	return v
}
func limit(q url.Values) int {
	n, _ := strconv.Atoi(q.Get("limit"))
	if n == 0 {
		n = 50
	}
	if n < 1 {
		n = 1
	}
	if n > 100 {
		n = 100
	}
	return n
}

var emailRE = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
var sensitive = regexp.MustCompile(`(?i)key|secret|token|password|credential`)
var kinds = map[string]bool{"todo": true, "idea": true, "stash": true, "watch": true, "file": true, "fact": true, "setting": true}
