// Package services contains the orchestration layer: ResponseBuffer,
// EventProcessor, SessionClient and CopilotService. The split mirrors
// copilot-console's Python services package.
package services

import (
	"context"
	"sync"
	"time"

	"github.com/sanchar10/copilot-buddy/backend/internal/models"
)

// ResponseStatus is the lifecycle state of a single message turn.
type ResponseStatus int

const (
	StatusRunning ResponseStatus = iota
	StatusCompleted
	StatusFailed
)

func (s ResponseStatus) String() string {
	switch s {
	case StatusRunning:
		return "running"
	case StatusCompleted:
		return "completed"
	case StatusFailed:
		return "failed"
	default:
		return "unknown"
	}
}

// ResponseBuffer accumulates SSE events for one in-flight (or recently
// completed) message turn. It is the linchpin that makes side-panel
// disconnect/reconnect non-destructive: closing the panel does NOT cancel
// the agent — the goroutine keeps appending events here, and the next SSE
// reader picks up from where it left off.
//
// Ordering & visibility are enforced by mu; consumers that want to block
// waiting for new data use Wait, which is a thin wrapper over sync.Cond.
type ResponseBuffer struct {
	SessionID string

	mu          sync.Mutex
	cond        *sync.Cond
	status      ResponseStatus
	events      []models.Event
	contentLen  int
	errMessage  string
	completedAt time.Time

	// Set by SessionClient when an auto-name change should ride along on
	// the final `done` event.
	UpdatedSessionName string
}

// NewResponseBuffer constructs an empty, RUNNING buffer.
func NewResponseBuffer(sessionID string) *ResponseBuffer {
	b := &ResponseBuffer{SessionID: sessionID, status: StatusRunning}
	b.cond = sync.NewCond(&b.mu)
	return b
}

// Append records a new event and wakes any Wait callers.
//
// Delta payloads also bump contentLen so we can include the full content
// length in the final `done` event without scanning the slice.
func (b *ResponseBuffer) Append(evt models.Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.status != StatusRunning {
		// Late events after Complete/Fail are silently dropped to keep
		// reader semantics simple.
		return
	}
	if d, ok := evt.Data.(models.DeltaPayload); ok {
		b.contentLen += len(d.Content)
	}
	b.events = append(b.events, evt)
	b.cond.Broadcast()
}

// Complete transitions to COMPLETED and wakes all waiters; subsequent
// Append calls become no-ops.
func (b *ResponseBuffer) Complete() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.status != StatusRunning {
		return
	}
	b.status = StatusCompleted
	b.completedAt = time.Now()
	b.cond.Broadcast()
}

// Fail transitions to FAILED with an explanation. Like Complete it wakes
// all waiters and freezes the buffer.
func (b *ResponseBuffer) Fail(err string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.status != StatusRunning {
		return
	}
	b.status = StatusFailed
	b.errMessage = err
	b.completedAt = time.Now()
	b.cond.Broadcast()
}

// Snapshot returns a copy of state for status endpoints. Length is
// returned separately so callers can size their next read.
func (b *ResponseBuffer) Snapshot() (status ResponseStatus, length int, errMsg string, completedAt time.Time) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.status, len(b.events), b.errMessage, b.completedAt
}

// EventsFrom returns events with index >= from, plus the new tail length.
// Cheap because it only copies the unread suffix.
func (b *ResponseBuffer) EventsFrom(from int) ([]models.Event, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if from < 0 {
		from = 0
	}
	if from >= len(b.events) {
		return nil, len(b.events)
	}
	out := make([]models.Event, len(b.events)-from)
	copy(out, b.events[from:])
	return out, len(b.events)
}

// ContentLength returns the cumulative size of all delta payloads. Used
// for the final `done` event.
func (b *ResponseBuffer) ContentLength() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.contentLen
}

// Wait blocks until at least one new event arrives after `from`, the
// buffer terminates, the context is cancelled, or `timeout` elapses
// (whichever comes first). It returns the (possibly unchanged) length of
// the events slice.
//
// We back the condition variable with a side goroutine so that the
// timeout/context channels can race the cond.Broadcast — sync.Cond doesn't
// natively support cancellation.
func (b *ResponseBuffer) Wait(ctx context.Context, from int, timeout time.Duration) int {
	b.mu.Lock()
	if len(b.events) > from || b.status != StatusRunning {
		n := len(b.events)
		b.mu.Unlock()
		return n
	}
	b.mu.Unlock()

	woken := make(chan struct{}, 1)
	stop := make(chan struct{})
	go func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		for len(b.events) <= from && b.status == StatusRunning {
			select {
			case <-stop:
				return
			default:
			}
			b.cond.Wait()
		}
		select {
		case woken <- struct{}{}:
		default:
		}
	}()

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-woken:
	case <-ctx.Done():
	case <-timer.C:
	}

	close(stop)
	// Kick the cond so the helper goroutine can exit if it's still parked.
	b.mu.Lock()
	b.cond.Broadcast()
	n := len(b.events)
	b.mu.Unlock()
	return n
}

// ----------------------------------------------------------------------
// Manager
// ----------------------------------------------------------------------

// BufferManager tracks active buffers per session id and tears them down
// after their TTL has elapsed past Complete/Fail.
type BufferManager struct {
	mu       sync.Mutex
	buffers  map[string]*ResponseBuffer
	ttl      time.Duration
	stopChan chan struct{}
}

// NewBufferManager constructs an empty manager. Call StartCleanupLoop to
// begin the background GC.
func NewBufferManager(ttl time.Duration) *BufferManager {
	return &BufferManager{
		buffers:  map[string]*ResponseBuffer{},
		ttl:      ttl,
		stopChan: make(chan struct{}),
	}
}

// CreateOrReplace installs a fresh buffer for a session, evicting any
// previous one. Returns the new buffer.
func (m *BufferManager) CreateOrReplace(sessionID string) *ResponseBuffer {
	b := NewResponseBuffer(sessionID)
	m.mu.Lock()
	m.buffers[sessionID] = b
	m.mu.Unlock()
	return b
}

// Get returns the current buffer or nil.
func (m *BufferManager) Get(sessionID string) *ResponseBuffer {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.buffers[sessionID]
}

// StartCleanupLoop runs until ctx is cancelled or Stop is called.
func (m *BufferManager) StartCleanupLoop(ctx context.Context) {
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-m.stopChan:
				return
			case now := <-t.C:
				m.gc(now)
			}
		}
	}()
}

// Stop halts the cleanup loop.
func (m *BufferManager) Stop() { close(m.stopChan) }

func (m *BufferManager) gc(now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, b := range m.buffers {
		status, _, _, completedAt := b.Snapshot()
		if status == StatusRunning {
			continue
		}
		if !completedAt.IsZero() && now.Sub(completedAt) > m.ttl {
			delete(m.buffers, id)
		}
	}
}
