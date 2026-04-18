package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	copilot "github.com/github/copilot-sdk/go"
	"github.com/sanchar10/copilot-buddy/backend/internal/models"
)

// SessionClient owns one *copilot.Client + *copilot.Session pair, scoped
// to a single (sessionID, cwd) tuple. It is the unit that CopilotService
// pools and idle-evicts.
//
// One client per session is heavier than sharing a single client across
// sessions, but it cleanly enforces per-session working directories
// (which the SDK applies on session creation, not per-message), and
// lets the GC reclaim subprocess memory for cold sessions.
type SessionClient struct {
	SessionID string
	CWD       string

	client       *copilot.Client
	session      *copilot.Session
	model        string

	mu           sync.Mutex
	lastActivity time.Time
	started      bool

	// One in-flight turn at a time; serialise sends so the SSE event
	// stream doesn't interleave between turns from the same session.
	sendMu sync.Mutex
}

// NewSessionClient does NOT contact the SDK — that happens lazily in
// ensureStarted.
func NewSessionClient(sessionID, cwd, model string) *SessionClient {
	return &SessionClient{
		SessionID:    sessionID,
		CWD:          cwd,
		model:        model,
		lastActivity: time.Now(),
	}
}

// LastActivity is read by the idle GC.
func (c *SessionClient) LastActivity() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastActivity
}

func (c *SessionClient) touch() {
	c.mu.Lock()
	c.lastActivity = time.Now()
	c.mu.Unlock()
}

// ensureStarted starts the SDK client and creates (or resumes) a session.
//
// Resume strategy: if `c.SessionID` already exists in the SDK's session
// store, ResumeSession returns the existing session — otherwise we
// CreateSession with the same id so future calls resume cleanly.
func (c *SessionClient) ensureStarted(ctx context.Context, systemMessage string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.started {
		return nil
	}

	c.client = copilot.NewClient(nil)
	if err := c.client.Start(ctx); err != nil {
		return fmt.Errorf("client.Start: %w", err)
	}

	cfg := &copilot.SessionConfig{
		SessionID:           c.SessionID,
		Model:               c.model,
		Streaming:           true,
		WorkingDirectory:    c.CWD,
		OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
	}
	if systemMessage != "" {
		cfg.SystemMessage = &copilot.SystemMessageConfig{
			Mode:    "append",
			Content: systemMessage,
		}
	}

	// Try resume first; fall back to create. ResumeSession returns an
	// error if the SDK doesn't know the id, so we just attempt create.
	if sess, err := c.client.ResumeSession(ctx, c.SessionID, nil); err == nil && sess != nil {
		c.session = sess
	} else {
		sess, err := c.client.CreateSession(ctx, cfg)
		if err != nil {
			_ = c.client.Stop()
			c.client = nil
			return fmt.Errorf("CreateSession: %w", err)
		}
		c.session = sess
	}

	c.started = true
	return nil
}

// SendMessage runs one user-prompt → assistant-turn cycle.
//
// It blocks on the EventProcessor's Done channel (turn end) so that the
// caller — typically a background goroutine spawned by the HTTP router —
// can know when to mark the ResponseBuffer Complete. The response buffer
// is updated incrementally as events arrive; closing the HTTP connection
// does not affect this method.
func (c *SessionClient) SendMessage(
	ctx context.Context,
	prompt string,
	systemMessage string,
	buf *ResponseBuffer,
) error {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()

	if err := c.ensureStarted(ctx, systemMessage); err != nil {
		return err
	}
	c.touch()

	proc := NewEventProcessor(buf)
	unsub := c.session.On(proc.Handle)
	defer unsub()

	if _, err := c.session.Send(ctx, copilot.MessageOptions{Prompt: prompt}); err != nil {
		return fmt.Errorf("session.Send: %w", err)
	}

	// Wait for AssistantTurnEndData (or context cancel).
	select {
	case <-proc.Done():
	case <-ctx.Done():
		return ctx.Err()
	}
	c.touch()
	return nil
}

// Stop tears down the SDK session + client. Safe to call multiple times.
func (c *SessionClient) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.started {
		return
	}
	// session.Destroy is best-effort — worst case the GC reaps it.
	_ = c.client.Stop()
	c.client = nil
	c.session = nil
	c.started = false
}

// Errs ----------------------------------------------------------------

// AppendError records err on the buffer as a synthetic error event and
// fails the buffer.
func AppendError(buf *ResponseBuffer, err error) {
	buf.Append(models.Event{Name: models.EventError, Data: models.ErrorPayload{Error: err.Error()}})
	buf.Fail(err.Error())
}
