// Package server wires routers, services, and middleware into an
// http.Server. main() should construct this once and call Run.
package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/sanchar10/copilot-buddy/backend/internal/config"
	"github.com/sanchar10/copilot-buddy/backend/internal/routers"
	"github.com/sanchar10/copilot-buddy/backend/internal/server/middleware"
	"github.com/sanchar10/copilot-buddy/backend/internal/services"
	"github.com/sanchar10/copilot-buddy/backend/internal/storage"
)

// Server bundles everything the HTTP listener needs.
type Server struct {
	Addr            string
	Token           string
	AllowedOrigins  []string

	Service *services.CopilotService
	Store   *storage.Store
	HTTP    *http.Server
}

// New constructs a Server with all dependencies wired. It does NOT start
// the listener — call Run for that.
//
// On first run it generates a 32-byte hex token and prints it to stdout
// so the user can paste it into the extension.
func New(addr string, allowedOrigins []string) (*Server, error) {
	if err := config.EnsureDirs(); err != nil {
		return nil, err
	}

	store, err := storage.New()
	if err != nil {
		return nil, err
	}
	agents, err := storage.NewAgentStore()
	if err != nil {
		return nil, err
	}
	mcp, err := storage.NewMCPStore()
	if err != nil {
		return nil, err
	}

	token, isNew, err := loadOrCreateToken()
	if err != nil {
		return nil, fmt.Errorf("token: %w", err)
	}
	if isNew {
		fmt.Println()
		fmt.Println("──── copilot-buddy: paste this token into the extension ────")
		fmt.Println(token)
		fmt.Println("─────────────────────────────────────────────────────────────")
		fmt.Println()
	}

	svc := services.NewCopilotService(agents, mcp)

	mux := http.NewServeMux()
	routers.Register(mux, svc, store, agents, mcp)

	// Middleware chain: AccessLog → Recover → CORS → Bearer → mux
	var handler http.Handler = mux
	handler = middleware.Bearer(token, config.APIPrefix+"/health")(handler)
	handler = middleware.CORS(allowedOrigins)(handler)
	handler = middleware.Recover(handler)
	handler = middleware.AccessLog(handler)

	return &Server{
		Addr:           addr,
		Token:          token,
		AllowedOrigins: allowedOrigins,
		Service:        svc,
		Store:          store,
		HTTP: &http.Server{
			Addr:              addr,
			Handler:           handler,
			ReadHeaderTimeout: 10 * time.Second,
			// No write timeout: SSE responses are long-lived.
		},
	}, nil
}

// Run starts the SDK service and the HTTP listener. Blocks until ctx is
// cancelled, then performs graceful shutdown.
func (s *Server) Run(ctx context.Context) error {
	if err := s.Service.Start(ctx); err != nil {
		return fmt.Errorf("service start: %w", err)
	}
	defer s.Service.Shutdown()

	errCh := make(chan error, 1)
	go func() {
		errCh <- s.HTTP.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			return err
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.HTTP.Shutdown(shutdownCtx)
}

// ----------------------------------------------------------------------
// Token
// ----------------------------------------------------------------------

type configFile struct {
	Token string `json:"token"`
}

func tokenPath() string {
	return filepath.Join(config.AppHome(), "config.json")
}

func loadOrCreateToken() (string, bool, error) {
	p := tokenPath()
	if b, err := os.ReadFile(p); err == nil {
		var cf configFile
		if err := json.Unmarshal(b, &cf); err == nil && cf.Token != "" {
			return cf.Token, false, nil
		}
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", false, err
	}
	tok := hex.EncodeToString(buf)
	b, _ := json.MarshalIndent(configFile{Token: tok}, "", "  ")
	if err := os.WriteFile(p, b, 0o600); err != nil {
		return "", false, err
	}
	return tok, true, nil
}
