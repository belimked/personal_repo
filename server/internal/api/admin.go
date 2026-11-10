package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func (a *API) admin(w http.ResponseWriter, r *http.Request, b, u map[string]any) {
	p, m := r.URL.Path, r.Method
	if p == "/api/admin/users" && m == "GET" {
		v := a.rows(w, "SELECT id,email,name,role,disabled,deleted_at,created_at,(SELECT MAX(created_at) FROM sessions WHERE user_id=users.id) last_login FROM users ORDER BY created_at")
		if v != nil {
			send(w, 200, map[string]any{"users": v})
		}
		return
	}
	if p == "/api/admin/users" && m == "POST" {
		email := strings.ToLower(strings.TrimSpace(str(b["email"])))
		name := strings.TrimSpace(str(b["name"]))
		role := value(b["role"], "user")
		if !emailRE.MatchString(email) || name == "" || role != "user" && role != "admin" {
			fail(w, 400, "invalid_user", "邮箱、姓名或角色无效")
			return
		}
		old, e := a.DB.One("SELECT id FROM users WHERE email=?", email)
		if e != nil {
			a.internal(w)
			return
		}
		if old != nil {
			fail(w, 400, "duplicate_email", "邮箱已存在")
			return
		}
		password := random(6)
		salt := random(16)
		user := map[string]any{"id": ID(), "email": email, "name": name, "role": role}
		if _, e = a.DB.Exec("INSERT INTO users(id,email,name,role,pw_hash,pw_salt,created_at) VALUES(?,?,?,?,?,?,?)", user["id"], email, name, role, Hash(password, salt), salt, Now()); e != nil {
			a.internal(w)
			return
		}
		a.audit(u, "create_user", email)
		send(w, 200, map[string]any{"user": user, "temp_password": password})
		return
	}
	if strings.HasPrefix(p, "/api/admin/users/") {
		rest := strings.TrimPrefix(p, "/api/admin/users/")
		parts := strings.Split(rest, "/")
		if len(parts) <= 2 && parts[0] != "" {
			target, e := a.DB.One("SELECT * FROM users WHERE id=?", parts[0])
			if e != nil {
				a.internal(w)
				return
			}
			if target == nil {
				fail(w, 404, "not_found", "账号不存在")
				return
			}
			suffix := ""
			if len(parts) == 2 {
				suffix = parts[1]
			}
			if suffix == "" && m == "PATCH" {
				name := str(target["name"])
				if v, ok := b["name"]; ok {
					name = strings.TrimSpace(str(v))
				}
				role := value(b["role"], str(target["role"]))
				disabled := target["disabled"].(int64)
				if v, ok := b["disabled"]; ok {
					switch v.(type) {
					case bool:
						if v == true {
							disabled = 1
						} else {
							disabled = 0
						}
					case float64:
						disabled = int64(v.(float64))
					default:
						disabled = -1
					}
				}
				if name == "" || role != "user" && role != "admin" || disabled != 0 && disabled != 1 {
					fail(w, 400, "invalid_user", "账号信息无效")
					return
				}
				if _, e = a.DB.Exec("UPDATE users SET name=?,role=?,disabled=? WHERE id=?", name, role, disabled, target["id"]); e != nil {
					a.internal(w)
					return
				}
				if disabled == 1 {
					a.DB.Exec("DELETE FROM sessions WHERE user_id=?", target["id"])
				}
				a.audit(u, "update_user", str(target["email"]))
				user := pub(target)
				user["name"] = name
				user["role"] = role
				user["disabled"] = disabled
				send(w, 200, map[string]any{"user": user})
				return
			}
			if suffix == "reset-password" && m == "POST" {
				password, salt := random(6), random(16)
				a.DB.Exec("UPDATE users SET pw_hash=?,pw_salt=? WHERE id=?", Hash(password, salt), salt, target["id"])
				a.DB.Exec("DELETE FROM sessions WHERE user_id=?", target["id"])
				a.audit(u, "reset_password", str(target["email"]))
				send(w, 200, map[string]any{"temp_password": password})
				return
			}
			if suffix == "" && m == "DELETE" {
				if target["id"] == u["id"] {
					fail(w, 400, "self_delete", "不能删除当前账号")
					return
				}
				a.DB.Exec("UPDATE users SET deleted_at=? WHERE id=?", Now(), target["id"])
				a.DB.Exec("DELETE FROM sessions WHERE user_id=?", target["id"])
				a.audit(u, "delete_user", str(target["email"]))
				send(w, 200, map[string]any{"ok": true})
				return
			}
			if suffix == "restore" && m == "POST" {
				deleted := str(target["deleted_at"])
				t, e := time.Parse("2006-01-02T15:04:05.000Z", deleted)
				if e != nil || time.Since(t) > 30*24*time.Hour {
					fail(w, 400, "restore_expired", "账号未删除或已超过 30 天")
					return
				}
				a.DB.Exec("UPDATE users SET deleted_at=NULL WHERE id=?", target["id"])
				a.audit(u, "restore_user", str(target["email"]))
				send(w, 200, map[string]any{"ok": true})
				return
			}
		}
	}
	if p == "/api/admin/test-model" && m == "POST" {
		model := value(b["model"], "deepseek-v4-flash")
		if model != "deepseek-v4-flash" && model != "deepseek-v4-pro" {
			fail(w, 400, "invalid_model", "模型无效")
			return
		}
		start := time.Now()
		_, e := a.LLM.Call(model, []map[string]string{{"role": "user", "content": "只回答：你好"}})
		msg := "连接正常"
		if e != nil {
			msg = "连接失败"
		}
		send(w, 200, map[string]any{"ok": e == nil, "latency_ms": time.Since(start).Milliseconds(), "model": model, "message": msg})
		return
	}
	if p == "/api/admin/settings" && m == "GET" {
		rows := a.rows(w, "SELECT key,value FROM settings")
		if rows == nil {
			return
		}
		settings := map[string]any{}
		for _, row := range rows {
			var v any
			json.Unmarshal([]byte(str(row["value"])), &v)
			settings[str(row["key"])] = v
		}
		send(w, 200, map[string]any{"settings": settings})
		return
	}
	if p == "/api/admin/settings" && m == "PUT" {
		values := b
		if v, ok := b["settings"]; ok {
			var valid bool
			values, valid = v.(map[string]any)
			if !valid {
				fail(w, 400, "sensitive_setting", "不能保存密钥类配置")
				return
			}
		}
		for k, v := range values {
			raw, _ := json.Marshal(v)
			if sensitive.MatchString(k) || sensitive.Match(raw) {
				fail(w, 400, "sensitive_setting", "不能保存密钥类配置")
				return
			}
		}
		keys := []string{}
		for k, v := range values {
			raw, _ := json.Marshal(v)
			if _, e := a.DB.Exec("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, string(raw)); e != nil {
				a.internal(w)
				return
			}
			keys = append(keys, k)
		}
		a.audit(u, "update_settings", strings.Join(keys, ","))
		send(w, 200, map[string]any{"ok": true})
		return
	}
	if p == "/api/admin/audit" && m == "GET" {
		rows := a.rows(w, "SELECT * FROM audit ORDER BY created_at DESC LIMIT ?", limit(r.URL.Query()))
		if rows != nil {
			send(w, 200, map[string]any{"audit": rows})
		}
		return
	}
	fail(w, 404, "not_found", "接口不存在")
}
