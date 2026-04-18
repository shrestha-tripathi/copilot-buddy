package services

import (
	"reflect"

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
}

// NewEventProcessor wires a fresh processor to the given buffer.
func NewEventProcessor(buf *ResponseBuffer) *EventProcessor {
	return &EventProcessor{buf: buf, terminate: make(chan struct{})}
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
	switch d := event.Data.(type) {

	// -------- streaming text --------
	// Prefer post-processed deltas over the raw provider stream.
	case *copilot.AssistantMessageDeltaData:
		if c := messageDeltaContent(d); c != "" {
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
		if p.buf.ContentLength() == 0 {
			if c := messageContent(d); c != "" {
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
		p.finish()
	case *copilot.SessionIdleData:
		// Fallback: if we somehow miss the turn-end, idle still terminates.
		p.finish()

	default:
		// Unknown / unmapped events are ignored — extension UI doesn't
		// need them. The full type list is in docs/sdk-events.md; add a
		// case here when a new one becomes useful.
		_ = reflect.TypeOf(d) // keep `reflect` import live for future use
	}
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
}// sessionUsage extracts the token-window snapshot from a SessionUsageInfoData
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
