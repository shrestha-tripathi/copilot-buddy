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
	"github.com/sanchar10/copilot-buddy/backend/internal/storage"
)

// CopilotService is the top-level orchestrator. It owns:
//   - one main *copilot.Client used for catalogue calls (ListModels)
//     and any operation that doesn't need a CWD;
//   - a pool of SessionClient instances keyed by session id, evicted
//     after a configurable idle TTL;
//   - the BufferManager that holds in-flight ResponseBuffers;
//   - references to the persistent agent + MCP catalogues so that
//     session spin-up can merge global defaults.
type CopilotService struct {
	mu       sync.RWMutex
	clients  map[string]*SessionClient
	idleTTL  time.Duration

	mainMu     sync.Mutex
	mainClient *copilot.Client

	Buffers *BufferManager
	Agents  *storage.AgentStore
	MCP     *storage.MCPStore

	stop chan struct{}
}

// NewCopilotService constructs the service. Callers should defer Shutdown.
func NewCopilotService(agents *storage.AgentStore, mcp *storage.MCPStore) *CopilotService {
	return &CopilotService{
		clients: map[string]*SessionClient{},
		idleTTL: time.Duration(config.IdleSessionTTLMinutes) * time.Minute,
		Buffers: NewBufferManager(time.Duration(config.ResponseBufferTTLMinutes) * time.Minute),
		Agents:  agents,
		MCP:     mcp,
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

// GetOrCreateClient returns the SessionClient for sess. If any of the
// cacheable session fields (CWD, model, reasoning, agent) change, the
// existing client is torn down and replaced — SDK session config is
// fixed at create-time so we can't just mutate in place.
func (s *CopilotService) GetOrCreateClient(sess *models.Session) *SessionClient {
	cwd := sess.CWD
	if cwd == "" {
		cwd = config.DefaultCWD()
	}
	model := sess.Model
	if model == "" {
		model = config.DefaultModel
	}

	// Merge global MCP catalogue with session-level overrides.
	mcpMap := map[string]copilot.MCPServerConfig{}
	if s.MCP != nil {
		if all, err := s.MCP.All(); err == nil {
			for k, v := range all {
				mcpMap[k] = copilot.MCPServerConfig(v)
			}
		}
	}
	for k, v := range sess.MCPServers {
		if asMap, ok := v.(map[string]any); ok {
			mcpMap[k] = copilot.MCPServerConfig(asMap)
		}
	}

	// Pull all global agents so the session can Activate one by name.
	var customAgents []copilot.CustomAgentConfig
	if s.Agents != nil {
		if list, err := s.Agents.List(); err == nil {
			for _, a := range list {
				cfg := copilot.CustomAgentConfig{
					Name:        a.Name,
					Description: a.Description,
					Prompt:      a.Prompt,
					Tools:       a.Tools,
				}
				if a.Infer {
					v := true
					cfg.Infer = &v
				}
				if len(a.MCPServers) > 0 {
					cfg.MCPServers = map[string]copilot.MCPServerConfig{}
					for k, v := range a.MCPServers {
						if asMap, ok := v.(map[string]any); ok {
							cfg.MCPServers[k] = copilot.MCPServerConfig(asMap)
						}
					}
				}
				customAgents = append(customAgents, cfg)
			}
		}
	}

	opts := SessionClientOpts{
		CWD:             cwd,
		Model:           model,
		ReasoningEffort: sess.ReasoningEffort,
		Agent:           sess.Agent,
		MCPServers:      mcpMap,
		CustomAgents:    customAgents,
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.clients[sess.ID]; ok {
		if existing.CWD == cwd &&
			existing.model == model &&
			existing.reasoningEffort == sess.ReasoningEffort &&
			existing.agent == sess.Agent {
			return existing
		}
		// Config mutated — recycle.
		existing.Stop()
		delete(s.clients, sess.ID)
	}
	c := NewSessionClient(sess.ID, opts)
	s.clients[sess.ID] = c
	return c
}

// RecycleClient forcibly evicts the session's cached SDK client so the
// next message starts fresh with whatever opts GetOrCreateClient now
// computes. Used by PATCH /sessions/{id} when mcp/custom_agents change
// (those aren't part of the identity-equality check in GetOrCreate).
func (s *CopilotService) RecycleClient(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.clients[sessionID]; ok {
		c.Stop()
		delete(s.clients, sessionID)
	}
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

// RespondToElicitation forwards the user's modal response to the
// blocked SDK ElicitationHandler for the given session.
func (s *CopilotService) RespondToElicitation(sessionID, requestID string, res copilot.ElicitationResult) error {
	s.mu.RLock()
	c := s.clients[sessionID]
	s.mu.RUnlock()
	if c == nil {
		return fmt.Errorf("no active client for session %s", sessionID)
	}
	return c.Pending.ResolveElicitation(requestID, res)
}

// RespondToUserInput forwards the user's `ask_user` modal response.
func (s *CopilotService) RespondToUserInput(sessionID, requestID string, res copilot.UserInputResponse) error {
	s.mu.RLock()
	c := s.clients[sessionID]
	s.mu.RUnlock()
	if c == nil {
		return fmt.Errorf("no active client for session %s", sessionID)
	}
	return c.Pending.ResolveUserInput(requestID, res)
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
