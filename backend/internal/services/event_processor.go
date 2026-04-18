package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"reflect"
	"strings"

	copilot "github.com/github/copilot-sdk/go"
	"github.com/sanchar10/copilot-buddy/backend/internal/models"
)

// EventProcessor translates copilot-sdk/go events into our SSE-friendly
// models.Event vocabulary and pushes them into a ResponseBuffer.
//
// One processor per message turn; create with NewEventProcessor and
// register Handle as the session.On callback before calling session.Send.
//
// Mapping rationale documented in backend/docs/sdk-events.md.
type EventProcessor struct {
	buf *ResponseBuffer
	// terminate tells the SessionClient that a turn has ended; it
	// closes after the first AssistantTurnEndData (or SessionIdleData
	// fallback). Re-using channel close as broadcast.
	terminate chan struct{}
	closed    bool

	// Tool-call tracking so we can surface shell/edit/search results as
	// visible steps AND, if the model declines to produce a narrative
	// assistant message, fall back to rendering the tool output as the
	// reply (otherwise the user sees a blank turn).
	toolsInFlight map[string]*toolState
	toolOrder     []string
	// hasAssistantText tracks whether we've already emitted any delta
	// content for this turn. If not — and tools ran — the turn_end
	// handler synthesises a reply from the tool outputs.
	hasAssistantText bool
}

type toolState struct {
	name    string
	args    string
	success bool
	result  string
	errMsg  string
	done    bool
}

// NewEventProcessor wires a fresh processor to the given buffer.
func NewEventProcessor(buf *ResponseBuffer) *EventProcessor {
	return &EventProcessor{
		buf:           buf,
		terminate:     make(chan struct{}),
		toolsInFlight: map[string]*toolState{},
	}
}

// Done returns a channel that closes when the turn ends.
func (p *EventProcessor) Done() <-chan struct{} { return p.terminate }

// finish is idempotent — the SDK fires both AssistantTurnEndData and
// SessionIdleData, and we treat the first as authoritative.
func (p *EventProcessor) finish() {
	if p.closed {
		return
	}
	p.closed = true
	close(p.terminate)
}

// Handle is the function passed to session.On. We use a type switch over
// the event payload to map it to the SSE event vocabulary.
func (p *EventProcessor) Handle(event copilot.SessionEvent) {
	if dbg := os.Getenv("COPILOT_BUDDY_DEBUG_EVENTS"); dbg != "" {
		logEvent(event)
	}
	switch d := event.Data.(type) {

	// -------- streaming text --------
	// Prefer post-processed deltas over the raw provider stream.
	case *copilot.AssistantMessageDeltaData:
		if c := messageDeltaContent(d); c != "" {
			p.hasAssistantText = true
			p.buf.Append(models.Event{Name: models.EventDelta, Data: models.DeltaPayload{Content: c}})
		}

	case *copilot.AssistantStreamingDeltaData:
		// Skip — AssistantMessageDeltaData carries the same text in a
		// cleaner shape. Kept here as an explicit no-op so future
		// maintainers know it was considered.

	case *copilot.AssistantMessageData:
		// Whole message. We don't always know whether deltas were
		// emitted; only flush if the buffer has zero deltas so far.
		// (Streaming sessions get deltas; non-streaming get only this.)
		if c := messageContent(d); c != "" {
			if !p.hasAssistantText {
				p.hasAssistantText = true
				p.buf.Append(models.Event{Name: models.EventDelta, Data: models.DeltaPayload{Content: c}})
			}
		}

	// -------- reasoning --------
	case *copilot.AssistantReasoningData:
		if c := reasoningContent(d); c != "" {
			p.buf.Append(models.Event{
				Name: models.EventStep,
				Data: models.Step{Title: "Reasoning", Detail: c},
			})
		}
	case *copilot.AssistantReasoningDeltaData:
		// Currently dropped (reasoning is summarised on AssistantReasoningData).
		// Future: buffer per-turn deltas if we want live reasoning streaming.

	// -------- tool execution --------
	case *copilot.ToolExecutionStartData:
		args := stringifyToolArgs(d.Arguments)
		ts := &toolState{name: d.ToolName, args: args}
		p.toolsInFlight[d.ToolCallID] = ts
		p.toolOrder = append(p.toolOrder, d.ToolCallID)
		p.buf.Append(models.Event{
			Name: models.EventStep,
			Data: models.Step{
				Title:  "Running " + d.ToolName,
				Detail: args,
			},
		})

	case *copilot.ToolExecutionCompleteData:
		ts, ok := p.toolsInFlight[d.ToolCallID]
		if !ok {
			ts = &toolState{name: "tool"}
			p.toolsInFlight[d.ToolCallID] = ts
			p.toolOrder = append(p.toolOrder, d.ToolCallID)
		}
		ts.done = true
		ts.success = d.Success
		if d.Result != nil {
			ts.result = pickToolResult(d.Result)
		}
		if d.Error != nil {
			ts.errMsg = d.Error.Message
		}
		var detail string
		switch {
		case ts.errMsg != "":
			detail = "error: " + ts.errMsg
		case ts.result != "":
			detail = ts.result
		default:
			detail = "(no output)"
		}
		title := "✓ " + ts.name
		if !ts.success {
			title = "✗ " + ts.name
		}
		p.buf.Append(models.Event{
			Name: models.EventStep,
			Data: models.Step{Title: title, Detail: detail},
		})

	// -------- usage / context window --------
	// AssistantUsageData carries per-request cost (TokenDetails,
	// TotalNanoAiu) but NOT context-window state, so we ignore it for
	// now. SessionUsageInfoData is what feeds the context meter.
	case *copilot.AssistantUsageData:
		// no-op; reserved for future cost/billing UI

	case *copilot.SessionUsageInfoData:
		if u := sessionUsage(d); u != nil {
			p.buf.Append(models.Event{Name: models.EventUsageInfo, Data: u})
		}

	// -------- pending messages (queued sends) --------
	case *copilot.PendingMessagesModifiedData:
		p.buf.Append(models.Event{Name: models.EventPendingMessages, Data: struct{}{}})

	// -------- end of turn --------
	case *copilot.AssistantTurnEndData:
		p.flushFallbackReply()
		p.buf.Append(models.Event{
			Name: models.EventTurnDone,
			Data: map[string]any{"message_id": ""},
		})
		p.finish()
	case *copilot.SessionIdleData:
		if !p.closed {
			p.flushFallbackReply()
			p.buf.Append(models.Event{
				Name: models.EventTurnDone,
				Data: map[string]any{"message_id": ""},
			})
		}
		p.finish()

	default:
		// Unknown / unmapped events are ignored — extension UI doesn't
		// need them. The full type list is in docs/sdk-events.md; add a
		// case here when a new one becomes useful.
		_ = reflect.TypeOf(d) // keep `reflect` import live for future use
	}
}

// flushFallbackReply synthesises an assistant reply from the tool
// outputs of this turn when the model itself didn't produce one. This
// happens e.g. with gpt-4.1 + shell: the model issues a tool call and
// then ends the turn without narrating the result, leaving the user
// staring at an empty bubble. We surface the tool output so they can
// actually see what ran.
func (p *EventProcessor) flushFallbackReply() {
	if p.hasAssistantText || len(p.toolOrder) == 0 {
		return
	}
	var b strings.Builder
	for _, id := range p.toolOrder {
		ts := p.toolsInFlight[id]
		if ts == nil || !ts.done {
			continue
		}
		if ts.result != "" || ts.errMsg != "" {
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			fmt.Fprintf(&b, "**%s**", ts.name)
			if ts.args != "" && ts.args != "{}" {
				fmt.Fprintf(&b, " · `%s`", truncate(ts.args, 120))
			}
			if ts.errMsg != "" {
				fmt.Fprintf(&b, "\n\n```\n%s\n```", ts.errMsg)
			} else {
				fmt.Fprintf(&b, "\n\n```\n%s\n```", strings.TrimSpace(ts.result))
			}
		}
	}
	if b.Len() == 0 {
		return
	}
	p.hasAssistantText = true
	p.buf.Append(models.Event{
		Name: models.EventDelta,
		Data: models.DeltaPayload{Content: b.String()},
	})
}

// ----------------------------------------------------------------------
// Field accessors
//
// The Copilot Go SDK is internal-shape stable but exposes nested struct
// fields whose names may shift between versions. We isolate every field
// access in a tiny helper so that one place breaks (with a compile error)
// when a field name changes — instead of N places in the type switch.
// ----------------------------------------------------------------------

func messageDeltaContent(d *copilot.AssistantMessageDeltaData) string {
	if d == nil {
		return ""
	}
	return d.DeltaContent
}

func messageContent(d *copilot.AssistantMessageData) string {
	if d == nil {
		return ""
	}
	return d.Content
}

func reasoningContent(d *copilot.AssistantReasoningData) string {
	if d == nil {
		return ""
	}
	return d.Content
}

// sessionUsage extracts the token-window snapshot from a SessionUsageInfoData
// event. AssistantUsageData carries cost/billing only (TokenDetails,
// TotalNanoAiu) so it's not used here.
func sessionUsage(d *copilot.SessionUsageInfoData) *models.UsageInfo {
	if d == nil {
		return nil
	}
	if d.TokenLimit == 0 && d.CurrentTokens == 0 {
		return nil
	}
	return &models.UsageInfo{
		TokenLimit:     d.TokenLimit,
		CurrentTokens:  d.CurrentTokens,
		MessagesLength: d.MessagesLength,
	}
}

// stringifyToolArgs renders a tool's `arguments` field as a compact
// JSON-ish string. The SDK types it as `any` so we can't inspect
// without reflection; json.Marshal handles maps, slices and primitives.
func stringifyToolArgs(a any) string {
	if a == nil {
		return ""
	}
	b, err := json.Marshal(a)
	if err != nil {
		return ""
	}
	return string(b)
}

// pickToolResult returns the best string representation of a tool
// result for display: DetailedContent first (full output), falling
// back to Content (concise).
func pickToolResult(r *copilot.ToolExecutionCompleteDataResult) string {
	if r == nil {
		return ""
	}
	if r.DetailedContent != nil && *r.DetailedContent != "" {
		return *r.DetailedContent
	}
	return r.Content
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func logEvent(event copilot.SessionEvent) {
	switch d := event.Data.(type) {
	case *copilot.AssistantMessageData:
		log.Printf("[evt] %s : content=%q tool_requests=%d", event.Type, d.Content, len(d.ToolRequests))
	case *copilot.AssistantMessageDeltaData:
		log.Printf("[evt] %s : delta=%q", event.Type, d.DeltaContent)
	case *copilot.ToolExecutionStartData:
		log.Printf("[evt] %s : id=%s name=%s args=%v", event.Type, d.ToolCallID, d.ToolName, d.Arguments)
	case *copilot.ToolExecutionCompleteData:
		log.Printf("[evt] %s : id=%s success=%v result=%v", event.Type, d.ToolCallID, d.Success, d.Result != nil)
	default:
		log.Printf("[evt] %s : %T", event.Type, event.Data)
	}
}
