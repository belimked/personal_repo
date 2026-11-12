package api

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fakeMaps(t *testing.T) *int {
	t.Helper()
	key, e := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	der, e := x509.MarshalPKCS8PrivateKey(key)
	if e != nil {
		t.Fatal(e)
	}
	path := filepath.Join(t.TempDir(), "maps.p8")
	if e = os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0600); e != nil {
		t.Fatal(e)
	}
	hits := new(int)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/token":
			parts := strings.Split(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), ".")
			if len(parts) != 3 {
				t.Errorf("JWT: %s", r.Header.Get("Authorization"))
				return
			}
			sig, e := base64.RawURLEncoding.DecodeString(parts[2])
			if e != nil || len(sig) != 64 {
				t.Errorf("invalid ES256 signature: %v %d", e, len(sig))
			}
			io.WriteString(w, `{"accessToken":"fake","expiresInSeconds":1800}`)
		case "/v1/geocode":
			*hits++
			io.WriteString(w, `{"results":[{"name":"台北101","formattedAddressLines":["台北市"],"coordinate":{"latitude":25.03,"longitude":121.56}}]}`)
		case "/v1/etas":
			if r.URL.Query().Get("transportType") == "Transit" {
				io.WriteString(w, `{"etas":[{"expectedTravelTimeSeconds":1800}]}`)
			} else {
				io.WriteString(w, `{"etas":[{"expectedTravelTimeSeconds":600}]}`)
			}
		default:
			t.Errorf("unexpected maps path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)
	t.Setenv("XIAOHE_APPLE_MAPS_BASE", server.URL)
	t.Setenv("XIAOHE_APPLE_MAPS_TEAM_ID", "team")
	t.Setenv("XIAOHE_APPLE_MAPS_KEY_ID", "key")
	t.Setenv("XIAOHE_APPLE_MAPS_KEY", path)
	return hits
}
func TestRouteAndLocation(t *testing.T) {
	a, c := setup(t, "")
	token := login(t, c, "lily@demo.com")
	uid := loginID(t, c, token)
	hits := fakeMaps(t)
	code, v := c("POST", "/api/route", `{"to":"台北101"}`, token)
	if code != 400 || v["error"] != "no_location" {
		t.Fatal(code, v)
	}
	code, v = c("PUT", "/api/me/location", `{"lat":25,"lng":121,"accuracy":10}`, token)
	if code != 200 || v["stored"] != true {
		t.Fatal(code, v)
	}
	for _, body := range []string{`{"to":"台北101"}`, `{"to":"台北101","lat":25,"lng":121}`} {
		code, v = c("POST", "/api/route", body, token)
		if code != 200 || v["driving_min"] != float64(10) || v["transit_min"] != float64(30) {
			t.Fatal(code, v)
		}
	}
	if *hits != 2 {
		t.Fatal(*hits)
	}
	a.DB.Exec("INSERT INTO items(id,user_id,kind,data,created_at,updated_at,deleted) VALUES(?,?,?,?,?,?,0)", "setting-sensitive", uid, "setting", `{"value":{"location":false}}`, Now(), Now())
	code, v = c("PUT", "/api/me/location", `{"lat":25,"lng":121,"accuracy":10}`, token)
	if code != 200 || v["stored"] != false {
		t.Fatal(code, v)
	}
	code, v = c("POST", "/api/route", `{"to":"台北101"}`, token)
	if code != 400 {
		t.Fatal(code, v)
	}
	code, _ = c("DELETE", "/api/me/location", "", token)
	if code != 200 {
		t.Fatal(code)
	}
	t.Setenv("XIAOHE_APPLE_MAPS_TEAM_ID", "")
	code, v = c("POST", "/api/route", `{"to":"台北101","lat":25,"lng":121}`, token)
	if code != 503 || v["error"] != "maps_not_configured" {
		t.Fatal(code, v)
	}
}
func TestDepartureOnce(t *testing.T) {
	a, c := setup(t, "")
	token := login(t, c, "lily@demo.com")
	uid := loginID(t, c, token)
	fakeMaps(t)
	now := time.Now().In(taipei)
	due := now.Add(20 * time.Minute).Format("2006-01-02T15:04")
	a.DB.Exec("INSERT INTO user_locations(user_id,lat,lng,accuracy,at) VALUES(?,?,?,?,?)", uid, 25.0, 121.0, 10.0, Now())
	raw, _ := json.Marshal(map[string]any{"title": "开会", "place": "台北101", "due": due})
	a.DB.Exec("INSERT INTO items(id,user_id,kind,data,created_at,updated_at,deleted) VALUES(?,?,?,?,?,?,0)", "depart-test", uid, "todo", string(raw), Now(), Now())
	if e := a.departureReminders(uid, now); e != nil {
		t.Fatal(e)
	}
	row, _ := a.DB.One("SELECT data FROM items WHERE id='depart-test'")
	if !strings.Contains(str(row["data"]), "depart_pushed") {
		t.Fatal(row)
	}
	var first map[string]any
	json.Unmarshal([]byte(str(row["data"])), &first)
	if e := a.departureReminders(uid, now); e != nil {
		t.Fatal(e)
	}
	row, _ = a.DB.One("SELECT data FROM items WHERE id='depart-test'")
	var second map[string]any
	json.Unmarshal([]byte(str(row["data"])), &second)
	if first["depart_pushed"] != second["depart_pushed"] {
		t.Fatal("pushed twice", row)
	}
}
func TestVoiceActions(t *testing.T) {
	a, c := setup(t, "")
	token := login(t, c, "lily@demo.com")
	uid := loginID(t, c, token)
	fakeMaps(t)
	a.DB.Exec("INSERT INTO user_locations(user_id,lat,lng,accuracy,at) VALUES(?,?,?,?,?)", uid, 25.0, 121.0, 10.0, Now())
	q := "事情"
	answer, meta, ok := a.voiceAction(context.Background(), uid, "recording", q, "work", voiceIntent{Intent: "search", Query: &q})
	if !ok || answer == "" || meta == nil {
		t.Fatal(answer, meta)
	}
	at := time.Now().In(taipei).Add(time.Hour).Format("2006-01-02T15:04")
	title := "交周报"
	answer, _, ok = a.voiceAction(context.Background(), uid, "recording", q, "work", voiceIntent{Intent: "remind", Title: &title, RemindAt: &at})
	if !ok || !strings.Contains(answer, title) {
		t.Fatal(answer)
	}
	place := "台北101"
	answer, meta, ok = a.voiceAction(context.Background(), uid, "recording", q, "work", voiceIntent{Intent: "route", Place: &place})
	if !ok || meta == nil || !strings.Contains(answer, "10 分钟") {
		t.Fatal(answer, meta)
	}
	_, _, ok = a.voiceAction(context.Background(), uid, "recording", q, "work", voiceIntent{Intent: "other"})
	if ok {
		t.Fatal("other should use ordinary reply")
	}
}
