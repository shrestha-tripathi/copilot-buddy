// Package models contains domain types shared across services and routers.
package models

import "time"

// Session is the persisted metadata for one chat session.
//
// The SDK owns the actual conversation history; we own the human-facing
// metadata (display name, working directory, model preference, etc.) so we
// can show the session list and re-create the SDK session with the right
// configuration.
type Session struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	NameSet       bool      `json:"name_set"`
	Model         string    `json:"model"`
	CWD           string    `json:"cwd"`
	SystemMessage string    `json:"system_message,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Step represents a tool call or reasoning chunk surfaced to the UI as a
// collapsible "thought" element. Title is short ("Tool: bash"), Detail is
// optional verbose content (rendered as a code block).
type Step struct {
	Title  string `json:"title"`
	Detail string `json:"detail,omitempty"`
}

// UsageInfo mirrors the Copilot SDK's session.usage_info — used to render
// the context-window meter. Floats because the SDK uses float64 (JSON
// numbers); we keep them as float64 to round-trip cleanly.
type UsageInfo struct {
	TokenLimit     float64 `json:"tokenLimit"`
	CurrentTokens  float64 `json:"currentTokens"`
	MessagesLength float64 `json:"messagesLength"`
}

// Event is a single SSE event accumulated by ResponseBuffer.
//
// Name uses the byte-compatible vocabulary from copilot-console:
//   delta, step, usage_info, turn_done, done, error,
//   title_changed, mode_changed, elicitation, ask_user, pending_messages
//
// Data is whatever JSON-marshalable payload matches Name.
type Event struct {
	Name string `json:"event"`
	Data any    `json:"data"`
}

// SSE event-name constants (single source of truth).
const (
	EventDelta            = "delta"
	EventStep             = "step"
	EventUsageInfo        = "usage_info"
	EventTurnDone         = "turn_done"
	EventDone             = "done"
	EventError            = "error"
	EventTitleChanged     = "title_changed"
	EventModeChanged      = "mode_changed"
	EventElicitation      = "elicitation"
	EventAskUser          = "ask_user"
	EventPendingMessages  = "pending_messages"
)

// DeltaPayload is the data shape of an `EventDelta`.
type DeltaPayload struct {
	Content string `json:"content"`
}

// DonePayload is the data shape of the final `EventDone`.
type DonePayload struct {
	ContentLength int    `json:"content_length"`
	SessionName   string `json:"session_name,omitempty"`
	UpdatedAt     string `json:"updated_at,omitempty"`
}

// ErrorPayload is the data shape of `EventError`.
type ErrorPayload struct {
	Error string `json:"error"`
}
