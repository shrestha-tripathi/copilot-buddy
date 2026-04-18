// Package sse provides a tiny helper for writing Server-Sent Events to
// an http.ResponseWriter. Stdlib only.
//
// The wire format is the standard SSE protocol:
//
//	event: <name>
//	data: <line 1>
//	data: <line 2>
//
//	event: <name2>
//	data: ...
//
// A blank line terminates an event. Multi-line data values are split on
// "\n" and emitted as separate `data:` lines, as required by the spec.
package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Writer wraps an http.ResponseWriter for SSE output. All writes lock so
// concurrent goroutines (e.g., heartbeat ticker + event sender) don't
// interleave bytes mid-event.
type Writer struct {
	w       http.ResponseWriter
	flusher http.Flusher

	mu sync.Mutex
}

// New configures the response for SSE and returns a Writer. Returns an
// error if the underlying ResponseWriter doesn't support flushing —
// without flushing, SSE just buffers forever.
func New(w http.ResponseWriter) (*Writer, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("response writer does not support flushing")
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("Connection", "keep-alive")
	// Disable nginx-style buffering proxies in case anyone proxies us.
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	return &Writer{w: w, flusher: flusher}, nil
}

// Event sends one named event with a JSON-marshaled data payload.
func (w *Writer) Event(name string, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return w.raw(name, string(b))
}

// Comment writes a `: comment` heartbeat line. Useful to keep proxies
// from reaping the connection during long idle periods.
func (w *Writer) Comment(s string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if _, err := fmt.Fprintf(w.w, ": %s\n\n", s); err != nil {
		return err
	}
	w.flusher.Flush()
	return nil
}

func (w *Writer) raw(name, data string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	var sb strings.Builder
	if name != "" {
		sb.WriteString("event: ")
		sb.WriteString(name)
		sb.WriteByte('\n')
	}
	for _, line := range strings.Split(data, "\n") {
		sb.WriteString("data: ")
		sb.WriteString(line)
		sb.WriteByte('\n')
	}
	sb.WriteByte('\n')
	if _, err := w.w.Write([]byte(sb.String())); err != nil {
		return err
	}
	w.flusher.Flush()
	return nil
}

// Heartbeat starts a goroutine that writes a comment every interval until
// done is closed (typically the request context's Done channel).
func (w *Writer) Heartbeat(done <-chan struct{}, interval time.Duration) {
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-t.C:
				if err := w.Comment("ping"); err != nil {
					return
				}
			}
		}
	}()
}
