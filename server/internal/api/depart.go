package api

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func (a *API) departureReminders(uid string, now time.Time) error {
	if !mapsConfigured() || !sensitiveSettings(a, uid)["location"] {
		return nil
	}
	lat, lng, ok := a.lastLocation(uid)
	if !ok {
		return nil
	}
	rows, e := a.DB.Rows("SELECT id,data FROM items WHERE user_id=? AND kind='todo' AND deleted=0 AND coalesce(json_extract(data,'$.place'),'')<>'' AND coalesce(json_extract(data,'$.done'),0)=0 AND coalesce(json_extract(data,'$.status'),'')<>'done'", uid)
	if e != nil {
		return e
	}
	computed := 0
	for _, row := range rows {
		var d map[string]any
		if json.Unmarshal([]byte(str(row["data"])), &d) != nil {
			continue
		}
		due := str(d["due"])
		if !strings.Contains(due, "T") || len(due) < 16 || due[:10] != now.Format("2006-01-02") {
			continue
		}
		at, e := time.ParseInLocation("2006-01-02T15:04", due[:16], taipei)
		if e != nil {
			continue
		}
		eta, _ := d["eta"].(map[string]any)
		last, _ := time.Parse(time.RFC3339Nano, str(eta["at"]))
		refresh := eta == nil || time.Since(last) > 30*time.Minute
		if refresh && computed >= 5 {
			continue
		}
		if refresh && at.Sub(now) < 3*time.Hour {
			computed++
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			var p routePlace
			if geo, ok := d["place_geo"].(map[string]any); ok {
				p.Name = str(geo["name"])
				p.Address = str(geo["address"])
				p.Lat, _ = geo["lat"].(float64)
				p.Lng, _ = geo["lng"].(float64)
			}
			if !validCoords(p.Lat, p.Lng) || p.Name == "" {
				p, e = mapsPlace(ctx, str(d["place"]), lat, lng)
				if e == nil {
					d["place_geo"] = p
				}
			}
			if e == nil {
				var result routeResult
				result, e = a.estimatePlace(ctx, p, lat, lng, "last")
				if e == nil {
					eta = map[string]any{"minutes": result.DrivingMin, "transit_minutes": result.TransitMin, "at": Now()}
					d["eta"] = eta
				}
			}
			cancel()
		}
		if refresh && at.Sub(now) < 3*time.Hour && eta == nil {
			continue
		}
		minutes, has := eta["minutes"].(float64)
		if !has {
			if n, ok := eta["minutes"].(int); ok {
				minutes = float64(n)
				has = true
			}
		}
		if has && d["depart_pushed"] == nil && !now.Before(at.Add(-time.Duration(minutes+15)*time.Minute)) {
			title := value(d["title"], str(d["text"]))
			a.pushUser(uid, "该出发了："+title, fmt.Sprintf("去%s开车约 %d 分钟（预估）", str(d["place"]), int(minutes)), map[string]string{"type": "remind", "item_id": str(row["id"])})
			d["depart_pushed"] = Now()
		}
		raw, _ := json.Marshal(d)
		if str(row["data"]) != string(raw) {
			if _, e := a.DB.Exec("UPDATE items SET data=?,updated_at=? WHERE id=? AND user_id=?", string(raw), Now(), row["id"], uid); e != nil {
				return e
			}
		}
	}
	return nil
}
