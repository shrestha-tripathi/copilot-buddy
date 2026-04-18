// copilot-buddy: local daemon that bridges the Chrome extension to the
// GitHub Copilot CLI via github.com/github/copilot-sdk/go.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os/signal"
	"strings"
	"syscall"

	"github.com/sanchar10/copilot-buddy/backend/internal/config"
	"github.com/sanchar10/copilot-buddy/backend/internal/server"
)

var version = "0.0.1-dev"

func main() {
	var (
		port    = flag.Int("port", config.DefaultPort, "HTTP listen port")
		host    = flag.String("host", "127.0.0.1", "HTTP listen host")
		origins = flag.String("origins", "",
			"Comma-separated list of allowed CORS origins. "+
				"Typically chrome-extension://<id>")
	)
	flag.Parse()

	allowed := splitNonEmpty(*origins)
	if len(allowed) == 0 {
		log.Println("warning: --origins not set; CORS will reject all browser requests")
	}

	addr := fmt.Sprintf("%s:%d", *host, *port)
	srv, err := server.New(addr, allowed)
	if err != nil {
		log.Fatalf("server.New: %v", err)
	}

	fmt.Printf("copilot-buddy v%s — listening on http://%s%s\n", version, addr, config.APIPrefix)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := srv.Run(ctx); err != nil {
		log.Fatalf("server.Run: %v", err)
	}
	log.Println("copilot-buddy shut down cleanly")
}

func splitNonEmpty(csv string) []string {
	out := []string{}
	for _, s := range strings.Split(csv, ",") {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}
