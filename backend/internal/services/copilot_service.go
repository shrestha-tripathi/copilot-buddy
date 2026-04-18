package services

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	copilot "github.com/github/copilot-sdk/go"
	"github.com/sanchar10/copilot-buddy/backend/internal/config"
	"github.com/sanchar10/copilot-buddy/backend/internal/models"
)

// CopilotService is the top-level orchestrator. It owns:
//   - one main *copilot.Client used for catalogue calls (ListModels)
//     and any operation that doesn't need a CWD;
//   - a pool of SessionClient instances keyed by session id, evicted
//     after a configurable idle TTL;
//   - the BufferManager that holds in-flight ResponseBuffers.
//
// The split between main-client and per-session-clients mirrors
// copilot-console: the main client is cheap, always-on, and never tied
// to a working directory.
type CopilotService struct {
	mu       sync.RWMutex
	clients  map[string]*SessionClient
	idleTTL  time.Duration

	mainMu     sync.Mutex
	mainClient *copilot.Client

	Buffers *BufferManager

	stop chan struct{}
}

// NewCopilotService constructs the service. Callers should defer Shutdown.
func NewCopilotService() *CopilotService {
	return &CopilotService{
		clients: map[string]*SessionClient{},
		idleTTL: time.Duration(config.IdleSessionTTLMinutes) * time.Minute,
		Buffers: NewBufferManager(time.Duration(config.ResponseBufferTTLMinutes) * time.Minute),
		stop:    make(chan struct{}),
	}
}

// Start spins up the main client and the GC loops. ctx governs background
// goroutine lifetime.
func (s *CopilotService) Start(ctx context.Context) error {
	s.mainMu.Lock()
	defer s.mainMu.Unlock()
	if s.mainClient != nil {
		return nil
	}
	c := copilot.NewClient(nil)
	if err := c.Start(ctx); err != nil {
		return fmt.Errorf("main client start: %w", err)
	}
	s.mainClient = c

	s.Buffers.StartCleanupLoop(ctx)
	go s.gcLoop(ctx)
	return nil
}

// Shutdown stops the main client, all session clients, and the GC loop.
func (s *CopilotService) Shutdown() {
	close(s.stop)
	s.Buffers.Stop()

	s.mu.Lock()
	for id, c := range s.clients {
		c.Stop()
		delete(s.clients, id)
	}
	s.mu.Unlock()

	s.mainMu.Lock()
	if s.mainClient != nil {
		_ = s.mainClient.Stop()
		s.mainClient = nil
	}
	s.mainMu.Unlock()
}

// ListModels returns the catalogue of models available to the user.
func (s *CopilotService) ListModels(ctx context.Context) ([]copilot.ModelInfo, error) {
	s.mainMu.Lock()
	c := s.mainClient
	s.mainMu.Unlock()
	if c == nil {
		return nil, fmt.Errorf("main client not started")
	}
	return c.ListModels(ctx)
}

// GetOrCreateClient returns the SessionClient for sess. If one exists
// with a different CWD, it is torn down and replaced — the SDK session
// config is fixed at create-time so we cannot just mutate.
func (s *CopilotService) GetOrCreateClient(sess *models.Session) *SessionClient {
	cwd := sess.CWD
	if cwd == "" {
		cwd = config.DefaultCWD()
	}
	model := sess.Model
	if model == "" {
		model = config.DefaultModel
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.clients[sess.ID]; ok {
		if existing.CWD == cwd && existing.model == model {
			return existing
		}
		// CWD or model changed — recycle.
		existing.Stop()
		delete(s.clients, sess.ID)
	}
	c := NewSessionClient(sess.ID, cwd, model)
	s.clients[sess.ID] = c
	return c
}

// SendMessageBackground starts the agent turn in a goroutine and returns
// the ResponseBuffer immediately. The HTTP layer can attach to that
// buffer to stream SSE without blocking the request handler.
func (s *CopilotService) SendMessageBackground(
	ctx context.Context,
	sess *models.Session,
	prompt string,
) *ResponseBuffer {
	buf := s.Buffers.CreateOrReplace(sess.ID)
	client := s.GetOrCreateClient(sess)

	// Detached context: we want the agent to keep running even if the
	// HTTP request that initiated it is cancelled. We propagate values
	// (none today) but not cancellation.
	bgCtx := context.WithoutCancel(ctx)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				AppendError(buf, fmt.Errorf("panic: %v", r))
				return
			}
		}()
		if err := client.SendMessage(bgCtx, prompt, sess.SystemMessage, buf); err != nil {
			AppendError(buf, err)
			return
		}
		buf.Complete()
	}()
	return buf
}

// gcLoop reaps clients whose LastActivity is older than idleTTL.
func (s *CopilotService) gcLoop(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stop:
			return
		case now := <-t.C:
			s.gc(now)
		}
	}
}

func (s *CopilotService) gc(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, c := range s.clients {
		if now.Sub(c.LastActivity()) > s.idleTTL {
			log.Printf("idle GC: stopping session %s", id)
			c.Stop()
			delete(s.clients, id)
		}
	}
}
