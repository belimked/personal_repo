package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"xiaohe/server/internal/api"
	"xiaohe/server/internal/llm"
	"xiaohe/server/internal/store"
)

var version = "go-dev"

func main() {
	if e := run(os.Args[1:]); e != nil {
		log.Fatal(e)
	}
}
func run(args []string) error {
	command := "serve"
	if len(args) > 0 {
		command = args[0]
	}
	d, e := store.Open(os.Getenv("XIAOHE_DB"))
	if e != nil {
		return e
	}
	defer d.Close()
	if e = d.Migrate(); e != nil {
		return e
	}
	switch command {
	case "migrate":
		return nil
	case "backup":
		if len(args) != 2 {
			return fmt.Errorf("usage: xiaohe backup <path>")
		}
		return d.Backup(args[1])
	case "import-d1":
		replace := false
		path := ""
		for _, arg := range args[1:] {
			if arg == "--replace" && !replace {
				replace = true
			} else if !strings.HasPrefix(arg, "-") && path == "" {
				path = arg
			} else {
				return fmt.Errorf("usage: xiaohe import-d1 [--replace] <sql file>")
			}
		}
		if path == "" {
			return fmt.Errorf("usage: xiaohe import-d1 [--replace] <sql file>")
		}
		counts, e := d.ImportD1(path, replace)
		if e != nil {
			return e
		}
		keys := make([]string, 0, len(counts))
		for k := range counts {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("%s: %d\n", k, counts[k])
		}
		return nil
	case "serve":
		addr := os.Getenv("XIAOHE_ADDR")
		if addr == "" {
			addr = "127.0.0.1:8080"
		}
		v := version
		if !strings.HasPrefix(v, "go-") {
			v = "go-" + v
		}
		push, e := api.LoadPush()
		if e != nil {
			log.Print("push disabled reason=invalid_configuration")
			return e
		}
		if push == nil {
			log.Print("push disabled reason=APNS_KEY_FILE not configured")
		} else {
			env := os.Getenv("APNS_ENV")
			if env == "" {
				env = "production"
			}
			log.Printf("push enabled team=%s key_id=%s env=%s", push.Team, push.KeyID, env)
		}
		a := &api.API{DB: d, Version: v, Origins: strings.Split(os.Getenv("CORS_ORIGINS"), ","), LLM: llm.Client{Key: os.Getenv("LLM_API_KEY"), Base: os.Getenv("LLM_BASE_URL")}, AudioDir: os.Getenv("XIAOHE_AUDIO_DIR"), ASRURL: os.Getenv("ASR_URL"), ASRToken: os.Getenv("ASR_TOKEN"), OCRURL: os.Getenv("OCR_URL"), Push: push, Jev: api.Jev{Key: os.Getenv("TYPESAFE_API_KEY"), Base: os.Getenv("TYPESAFE_BASE_URL")}}
		if os.Getenv("TYPESAFE_API_KEY") == "" {
			log.Print("scene classification disabled reason=TYPESAFE_API_KEY not configured")
		}
		if e = a.Start(context.Background()); e != nil {
			return e
		}
		log.Printf("listening on %s", addr)
		return http.ListenAndServe(addr, a.Handler())
	default:
		return fmt.Errorf("unknown command: %s", command)
	}
}
