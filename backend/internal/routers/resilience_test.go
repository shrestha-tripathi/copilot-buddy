// HTTP-level resilience test for P7.
//
// Verifies the contract that lets the side panel close and reopen without
// losing work:
//
//  1. POST /api/sessions/{id}/messages starts streaming SSE.
//  2. Client disconnects mid-stream; daemon keeps running the agent
//     because CopilotService.SendMessageBackground uses
//     context.WithoutCancel.
//  3. GET /api/sessions/{id}/response-status returns active=true while the
//     turn is in flight (or completed=true once it ended) plus a usable
//     event cursor.
//  4. GET /api/sessions/{id}/response-stream?from=N replays everything
//     from index N including the final `done`, allowing the panel to
//     reassemble the full assistant message.
//
// Run with:
//   go test ./internal/routers -run TestResume -v -tags=integration
//
//go:build integration

package routers_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sanchar10/copilot-buddy/backend/internal/routers"
	"github.com/sanchar10/copilot-buddy/backend/internal/services"
	"github.com/sanchar10/copilot-buddy/backend/internal/storage"
)

// startTestServer spins up the real router stack — no auth/CORS middleware
// because this test talks to the mux directly.
func startTestServer(t *testing.T) (*httptest.Server, *services.CopilotService, func()) {
	t.Helper()

	dir := t.TempDir()
	t.Setenv("COPILOT_BUDDY_HOME", dir)
	store, err := storage.New()
	if err != nil {
		t.Fatalf("storage.New: %v", err)
	}

	agents, _ := storage.NewAgentStore()
	mcp, _ := storage.NewMCPStore()
	svc := services.NewCopilotService(agents, mcp)
	if err := svc.Start(context.Background()); err != nil {
		t.Fatalf("svc.Start: %v", err)
	}

	mux := http.NewServeMux()
	routers.Register(mux, svc, store, agents, mcp)
	srv := httptest.NewServer(mux)

	cleanup := func() {
		srv.Close()
		svc.Shutdown()
	}
	return srv, svc, cleanup
}

func TestResumeAfterClientDisconnect(t *testing.T) {
	srv, _, cleanup := startTestServer(t)
	defer cleanup()

	// 1. create a session
	sess := createSession(t, srv.URL)

	// 2. start streaming /messages — but disconnect after we see the first
	// real (non-comment) event block.
	sendCtx, cancelSend := context.WithCancel(context.Background())
	body := strings.NewReader(`{"content":"Reply with just the word OK."}`)
	req, _ := http.NewRequestWithContext(
		sendCtx, "POST", srv.URL+"/api/sessions/"+sess.ID+"/messages", body,
	)
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /messages: %v", err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("POST /messages status: %d", res.StatusCode)
	}

	firstStream := readSSEUntilEvents(t, res.Body, 1, 20*time.Second)
	cancelSend()
	res.Body.Close()
	if len(firstStream) == 0 {
		t.Fatal("no events arrived before disconnect")
	}
	t.Logf("first stream got %d events before disconnect", len(firstStream))

	// 3. poll /response-status — should show active=true with a non-zero
	// event cursor (or completed=true if the turn was very fast).
	cursor, completed := pollResponseStatus(t, srv.URL, sess.ID, 30*time.Second)
	t.Logf("after disconnect: cursor=%d completed=%v", cursor, completed)

	// 4. resume from `cursor-1` to make sure we both replay-overlap-safely
	// AND get the final done event.
	from := cursor - 1
	if from < 0 {
		from = 0
	}
	resumeCtx, cancelResume := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancelResume()
	req2, _ := http.NewRequestWithContext(
		resumeCtx, "GET",
		srv.URL+"/api/sessions/"+sess.ID+"/response-stream?from="+itoa(from),
		nil,
	)
	res2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("GET /response-stream: %v", err)
	}
	defer res2.Body.Close()
	if res2.StatusCode != http.StatusOK {
		t.Fatalf("GET /response-stream status: %d", res2.StatusCode)
	}

	resumed := readSSEUntilEvent(t, res2.Body, "done", 90*time.Second)
	if len(resumed) == 0 {
		t.Fatal("resume stream produced zero events")
	}
	t.Logf("resume stream produced %d events (expecting trailing 'done')", len(resumed))

	if resumed[len(resumed)-1].name != "done" {
		t.Fatalf("expected last event to be 'done', got %q", resumed[len(resumed)-1].name)
	}

	// 5. assemble assistant content from the full event log via a third
	// fetch from index 0 and assert it isn't empty.
	full := fetchEntireStream(t, srv.URL, sess.ID)
	var content bytes.Buffer
	for _, e := range full {
		if e.name == "delta" {
			var d struct {
				Content string `json:"content"`
			}
			_ = json.Unmarshal(e.data, &d)
			content.WriteString(d.Content)
		}
	}
	if content.Len() == 0 {
		t.Fatal("no assistant content reconstructed from buffer after resume")
	}
	t.Logf("reconstructed assistant content: %q", strings.TrimSpace(content.String()))
}

// ----------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------

type sseEvent struct {
	name string
	data json.RawMessage
}

func createSession(t *testing.T, base string) struct {
	ID string `json:"id"`
} {
	t.Helper()
	res, err := http.Post(
		base+"/api/sessions", "application/json",
		strings.NewReader(`{"model":"gpt-4.1"}`),
	)
	if err != nil {
		t.Fatalf("POST /sessions: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /sessions status: %d", res.StatusCode)
	}
	var sess struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(res.Body).Decode(&sess); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	return sess
}

// readSSEUntilEvents reads SSE blocks until at least `n` parsed events are
// collected or the deadline is hit. Returns whatever it has at that point.
func readSSEUntilEvents(t *testing.T, body io.Reader, n int, timeout time.Duration) []sseEvent {
	t.Helper()
	deadline := time.Now().Add(timeout)
	out := []sseEvent{}
	r := bufio.NewReader(body)
	var name string
	var data bytes.Buffer
	for time.Now().Before(deadline) {
		line, err := r.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if name != "" || data.Len() > 0 {
				out = append(out, sseEvent{name: name, data: append([]byte(nil), data.Bytes()...)})
				name = ""
				data.Reset()
				if len(out) >= n {
					return out
				}
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if v, ok := strings.CutPrefix(line, "event:"); ok {
			name = strings.TrimSpace(v)
		} else if v, ok := strings.CutPrefix(line, "data:"); ok {
			if data.Len() > 0 {
				data.WriteByte('\n')
			}
			data.WriteString(strings.TrimPrefix(v, " "))
		}
	}
	return out
}

// readSSEUntilEvent reads SSE blocks until an event with the given name is
// encountered or deadline expires. Returns all collected events including
// the terminating one.
func readSSEUntilEvent(t *testing.T, body io.Reader, terminator string, timeout time.Duration) []sseEvent {
	t.Helper()
	deadline := time.Now().Add(timeout)
	out := []sseEvent{}
	r := bufio.NewReader(body)
	var name string
	var data bytes.Buffer
	for time.Now().Before(deadline) {
		line, err := r.ReadString('\n')
		if err != nil {
			return out
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if name != "" || data.Len() > 0 {
				out = append(out, sseEvent{name: name, data: append([]byte(nil), data.Bytes()...)})
				if name == terminator {
					return out
				}
				name = ""
				data.Reset()
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if v, ok := strings.CutPrefix(line, "event:"); ok {
			name = strings.TrimSpace(v)
		} else if v, ok := strings.CutPrefix(line, "data:"); ok {
			if data.Len() > 0 {
				data.WriteByte('\n')
			}
			data.WriteString(strings.TrimPrefix(v, " "))
		}
	}
	return out
}

// pollResponseStatus polls /response-status until either we have a usable
// cursor (events>0) or status indicates the turn finished.
func pollResponseStatus(t *testing.T, base, id string, timeout time.Duration) (cursor int, completed bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		res, err := http.Get(base + "/api/sessions/" + id + "/response-status")
		if err != nil {
			t.Fatalf("GET /response-status: %v", err)
		}
		var st struct {
			Active bool   `json:"active"`
			Status string `json:"status"`
			Events int    `json:"events"`
		}
		_ = json.NewDecoder(res.Body).Decode(&st)
		res.Body.Close()
		if !st.Active {
			t.Fatalf("buffer disappeared before resume")
		}
		if st.Status == "completed" {
			return st.Events, true
		}
		if st.Events > 0 {
			return st.Events, false
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatal("timed out waiting for buffer cursor")
	return 0, false
}

func fetchEntireStream(t *testing.T, base, id string) []sseEvent {
	t.Helper()
	res, err := http.Get(base + "/api/sessions/" + id + "/response-stream?from=0")
	if err != nil {
		t.Fatalf("GET /response-stream: %v", err)
	}
	defer res.Body.Close()
	return readSSEUntilEvent(t, res.Body, "done", 30*time.Second)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
