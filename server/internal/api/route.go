package api

import (
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

var errMapsConfig = errors.New("maps_not_configured")
var errPlace = errors.New("place_not_found")
var mapsCache struct {
	sync.Mutex
	token, key string
	expires    time.Time
}
var mapsHTTP = &http.Client{Timeout: 10 * time.Second}

type routePlace struct {
	Name    string  `json:"name"`
	Address string  `json:"address"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
}
type routeResult struct {
	Place      routePlace `json:"place"`
	DrivingMin int        `json:"driving_min"`
	TransitMin *int       `json:"transit_min"`
	From       string     `json:"from"`
	MapsURL    string     `json:"maps_url"`
}

func mapsConfigured() bool {
	return os.Getenv("XIAOHE_APPLE_MAPS_TEAM_ID") != "" && os.Getenv("XIAOHE_APPLE_MAPS_KEY_ID") != "" && os.Getenv("XIAOHE_APPLE_MAPS_KEY") != ""
}
func mapsBase() string {
	if v := os.Getenv("XIAOHE_APPLE_MAPS_BASE"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "https://maps-api.apple.com"
}
func mapsToken(ctx context.Context) (string, error) {
	if !mapsConfigured() {
		return "", errMapsConfig
	}
	path := os.Getenv("XIAOHE_APPLE_MAPS_KEY")
	team := os.Getenv("XIAOHE_APPLE_MAPS_TEAM_ID")
	kid := os.Getenv("XIAOHE_APPLE_MAPS_KEY_ID")
	keyID := mapsBase() + "|" + path + "|" + team + "|" + kid
	mapsCache.Lock()
	defer mapsCache.Unlock()
	if mapsCache.key == keyID && time.Until(mapsCache.expires) > time.Minute {
		return mapsCache.token, nil
	}
	raw, e := os.ReadFile(path)
	if e != nil {
		return "", e
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return "", errors.New("invalid maps private key")
	}
	privAny, e := x509.ParsePKCS8PrivateKey(block.Bytes)
	if e != nil {
		return "", e
	}
	priv, ok := privAny.(*ecdsa.PrivateKey)
	if !ok || priv.Curve.Params().BitSize != 256 {
		return "", errors.New("invalid maps ES256 key")
	}
	now := time.Now()
	header, _ := json.Marshal(map[string]string{"alg": "ES256", "kid": kid, "typ": "JWT"})
	payload, _ := json.Marshal(map[string]any{"iss": team, "iat": now.Unix(), "exp": now.Add(30 * time.Minute).Unix()})
	enc := base64.RawURLEncoding
	unsigned := enc.EncodeToString(header) + "." + enc.EncodeToString(payload)
	digest := sha256.Sum256([]byte(unsigned))
	r, s, e := ecdsa.Sign(rand.Reader, priv, digest[:])
	if e != nil {
		return "", e
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	jwt := unsigned + "." + enc.EncodeToString(sig)
	req, e := http.NewRequestWithContext(ctx, "GET", mapsBase()+"/v1/token", nil)
	if e != nil {
		return "", e
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	resp, e := mapsHTTP.Do(req)
	if e != nil {
		return "", e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("maps token: %d", resp.StatusCode)
	}
	var v struct {
		AccessToken      string `json:"accessToken"`
		ExpiresInSeconds int64  `json:"expiresInSeconds"`
	}
	if e = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&v); e != nil {
		return "", e
	}
	if v.AccessToken == "" {
		return "", errors.New("empty maps token")
	}
	mapsCache.key = keyID
	mapsCache.token = v.AccessToken
	mapsCache.expires = now.Add(25 * time.Minute)
	if v.ExpiresInSeconds > 0 && v.ExpiresInSeconds < 1500 {
		mapsCache.expires = now.Add(time.Duration(v.ExpiresInSeconds) * time.Second)
	}
	return v.AccessToken, nil
}
func mapsGet(ctx context.Context, path string, params url.Values, dst any) error {
	token, e := mapsToken(ctx)
	if e != nil {
		return e
	}
	endpoint := mapsBase() + path
	if params != nil {
		endpoint += "?" + params.Encode()
	}
	req, e := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if e != nil {
		return e
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, e := mapsHTTP.Do(req)
	if e != nil {
		return e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("maps %s: %d", path, resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(dst)
}
func coords(lat, lng float64) string { return fmt.Sprintf("%g,%g", lat, lng) }
func validCoords(lat, lng float64) bool {
	return !math.IsNaN(lat) && !math.IsNaN(lng) && !math.IsInf(lat, 0) && !math.IsInf(lng, 0) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}
func mapsPlace(ctx context.Context, to string, lat, lng float64) (routePlace, error) {
	var data struct {
		Results []struct {
			Name                  string   `json:"name"`
			FormattedAddressLines []string `json:"formattedAddressLines"`
			Coordinate            struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
			} `json:"coordinate"`
		} `json:"results"`
	}
	p := url.Values{"q": {to}, "searchLocation": {coords(lat, lng)}, "lang": {"zh-CN"}}
	e := mapsGet(ctx, "/v1/geocode", p, &data)
	if e != nil {
		return routePlace{}, e
	}
	if len(data.Results) == 0 {
		e = mapsGet(ctx, "/v1/search", p, &data)
		if e != nil {
			return routePlace{}, e
		}
	}
	if len(data.Results) == 0 {
		return routePlace{}, errPlace
	}
	r := data.Results[0]
	return routePlace{r.Name, strings.Join(r.FormattedAddressLines, " "), r.Coordinate.Latitude, r.Coordinate.Longitude}, nil
}
func mapsETA(ctx context.Context, lat, lng float64, p routePlace, transport string) (int, error) {
	var data struct {
		Etas []struct {
			ExpectedTravelTimeSeconds float64 `json:"expectedTravelTimeSeconds"`
		} `json:"etas"`
	}
	params := url.Values{"origin": {coords(lat, lng)}, "destinations": {coords(p.Lat, p.Lng)}, "transportType": {transport}}
	if e := mapsGet(ctx, "/v1/etas", params, &data); e != nil {
		return 0, e
	}
	if len(data.Etas) == 0 || data.Etas[0].ExpectedTravelTimeSeconds <= 0 {
		return 0, errors.New("no ETA")
	}
	return int(math.Ceil(data.Etas[0].ExpectedTravelTimeSeconds / 60)), nil
}
func (a *API) lastLocation(uid string) (float64, float64, bool) {
	if !sensitiveSettings(a, uid)["location"] {
		return 0, 0, false
	}
	row, e := a.DB.One("SELECT lat,lng,at FROM user_locations WHERE user_id=?", uid)
	if e != nil || row == nil {
		return 0, 0, false
	}
	t, e := time.Parse(time.RFC3339Nano, str(row["at"]))
	if e != nil || time.Since(t) > 12*time.Hour || time.Since(t) < -time.Minute {
		return 0, 0, false
	}
	lat, ok := row["lat"].(float64)
	if !ok {
		return 0, 0, false
	}
	lng, ok := row["lng"].(float64)
	return lat, lng, ok
}
func (a *API) estimate(ctx context.Context, to string, lat, lng float64, from string) (routeResult, error) {
	p, e := mapsPlace(ctx, to, lat, lng)
	if e != nil {
		return routeResult{}, e
	}
	return a.estimatePlace(ctx, p, lat, lng, from)
}
func (a *API) estimatePlace(ctx context.Context, p routePlace, lat, lng float64, from string) (routeResult, error) {
	drive, e := mapsETA(ctx, lat, lng, p, "Automobile")
	if e != nil {
		return routeResult{}, e
	}
	result := routeResult{Place: p, DrivingMin: drive, From: from, MapsURL: "maps://?daddr=" + url.QueryEscape(coords(p.Lat, p.Lng)) + "&q=" + url.QueryEscape(p.Name)}
	if n, e := mapsETA(ctx, lat, lng, p, "Transit"); e == nil {
		result.TransitMin = &n
	}
	return result, nil
}
func (a *API) locationRoute(w http.ResponseWriter, r *http.Request, b map[string]any, uid string) {
	if r.URL.Path == "/api/me/location" {
		if r.Method == "DELETE" {
			if _, e := a.DB.Exec("DELETE FROM user_locations WHERE user_id=?", uid); e != nil {
				a.internal(w)
				return
			}
			send(w, 200, map[string]any{"ok": true})
			return
		}
		if r.Method == "PUT" {
			lat, ok1 := b["lat"].(float64)
			lng, ok2 := b["lng"].(float64)
			accuracy, ok3 := b["accuracy"].(float64)
			if !ok1 || !ok2 || !ok3 || !validCoords(lat, lng) || math.IsNaN(accuracy) || accuracy < 0 {
				fail(w, 400, "invalid_location", "位置无效")
				return
			}
			stored := sensitiveSettings(a, uid)["location"]
			var e error
			if stored {
				_, e = a.DB.Exec("INSERT INTO user_locations(user_id,lat,lng,accuracy,at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,at=excluded.at", uid, lat, lng, accuracy, Now())
			} else {
				_, e = a.DB.Exec("DELETE FROM user_locations WHERE user_id=?", uid)
			}
			if e != nil {
				a.internal(w)
				return
			}
			send(w, 200, map[string]any{"ok": true, "stored": stored})
			return
		}
	}
	if r.URL.Path == "/api/route" && r.Method == "POST" {
		if !mapsConfigured() {
			fail(w, 503, "maps_not_configured", "路线预估还没开通")
			return
		}
		to, ok := b["to"].(string)
		to = strings.TrimSpace(to)
		if !ok || to == "" || len([]rune(to)) > 100 {
			fail(w, 400, "invalid_place", "目的地无效")
			return
		}
		lat, lng := 0.0, 0.0
		from := "device"
		if b["lat"] != nil || b["lng"] != nil {
			var aok, bok bool
			lat, aok = b["lat"].(float64)
			lng, bok = b["lng"].(float64)
			if !aok || !bok || !validCoords(lat, lng) {
				fail(w, 400, "invalid_location", "位置无效")
				return
			}
		} else {
			var found bool
			lat, lng, found = a.lastLocation(uid)
			if !found {
				fail(w, 400, "no_location", "没有可用位置")
				return
			}
			from = "last"
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		result, e := a.estimate(ctx, to, lat, lng, from)
		if e == errPlace {
			fail(w, 404, "place_not_found", "没找到地点")
			return
		}
		if e != nil {
			a.internal(w)
			return
		}
		send(w, 200, result)
		return
	}
	fail(w, 404, "not_found", "接口不存在")
}
