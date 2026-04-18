// Integration test for P2 services. Spawns a real Copilot CLI subprocess
// via the SDK, sends a tiny prompt, drains the ResponseBuffer, and
// asserts we received delta + done events.
//
// Run with:
//   go test ./internal/services -run TestRoundTrip -v -tags=integration
//
// Tagged so `go test ./...` in CI doesn't hit the network / require an
// authenticated Copilot CLI.
//go:build integration

package services_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/sanchar10/copilot-buddy/backend/internal/models"
	"github.com/sanchar10/copilot-buddy/backend/internal/services"
)

func TestRoundTrip(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	svc := services.NewCopilotService(nil, nil)
	if err := svc.Start(ctx); err != nil {
		t.Fatalf("svc.Start: %v", err)
	}
	defer svc.Shutdown()

	sess := &models.Session{
		ID:    "test-roundtrip-" + time.Now().Format("150405"),
		Model: "gpt-4.1",
	}
	buf := svc.SendMessageBackground(ctx, sess, "Reply with just the word OK.")

	// Drain by polling Wait every 5s until status != Running.
	from := 0
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		_ = buf.Wait(ctx, from, 5*time.Second)
		evts, n := buf.EventsFrom(from)
		from = n
		for _, e := range evts {
			t.Logf("event: %s %+v", e.Name, e.Data)
		}
		status, _, _, _ := buf.Snapshot()
		if status != services.StatusRunning {
			break
		}
	}

	status, total, errMsg, _ := buf.Snapshot()
	if status == services.StatusRunning {
		t.Fatal("buffer still running after deadline")
	}
	if status == services.StatusFailed {
		t.Fatalf("turn failed: %s", errMsg)
	}

	all, _ := buf.EventsFrom(0)
	if len(all) == 0 {
		t.Fatal("no events received")
	}

	var sawDelta bool
	var content strings.Builder
	for _, e := range all {
		if e.Name == models.EventDelta {
			sawDelta = true
			if d, ok := e.Data.(models.DeltaPayload); ok {
				content.WriteString(d.Content)
			}
		}
	}
	if !sawDelta {
		t.Fatalf("expected at least one delta event in %d events", total)
	}
	t.Logf("assembled assistant content: %q", content.String())
}
