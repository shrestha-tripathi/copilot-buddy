// Spike: exercise github.com/github/copilot-sdk/go and dump every event
// type seen, so we can write the EventProcessor against ground truth.
//
// Usage:
//   COPILOT_BUDDY_PROMPT="What is 2+2?" go run ./cmd/spike
//
// Writes a one-line summary per event to stdout and a verbose JSON dump to
// backend/docs/sdk-events.log.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"reflect"
	"sync"
	"syscall"
	"time"

	copilot "github.com/github/copilot-sdk/go"
)

func main() {
	prompt := os.Getenv("COPILOT_BUDDY_PROMPT")
	if prompt == "" {
		prompt = "Reply with just the word OK."
	}

	logFile, err := os.Create("docs/sdk-events.log")
	if err != nil {
		log.Fatalf("open log: %v", err)
	}
	defer logFile.Close()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	client := copilot.NewClient(nil)
	if err := client.Start(ctx); err != nil {
		log.Fatalf("client.Start: %v", err)
	}
	defer client.Stop()

	models, err := client.ListModels(ctx)
	if err != nil {
		log.Printf("ListModels: %v", err)
	} else {
		fmt.Printf("models available: %d\n", len(models))
		for _, m := range models {
			b, _ := json.Marshal(m)
			fmt.Printf("  %s\n", b)
		}
	}

	session, err := client.CreateSession(ctx, &copilot.SessionConfig{
		Model:               "gpt-4.1",
		Streaming:           true,
		OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
	})
	if err != nil {
		log.Fatalf("CreateSession: %v", err)
	}

	var (
		mu       sync.Mutex
		seen     = map[string]int{}
		doneOnce sync.Once
		done     = make(chan struct{})
	)

	session.On(func(event copilot.SessionEvent) {
		t := reflect.TypeOf(event.Data).String()

		mu.Lock()
		seen[t]++
		count := seen[t]
		mu.Unlock()

		// terse stdout
		fmt.Printf("[evt #%d] %s\n", count, t)

		// verbose JSON to log
		enc, _ := json.MarshalIndent(event, "", "  ")
		fmt.Fprintf(logFile, "=== %s ===\n%s\n\n", t, enc)

		// Treat AssistantTurnEndData (or any *TurnEnd*) as completion
		if t == "*copilot.AssistantTurnEndData" {
			doneOnce.Do(func() { close(done) })
		}
	})

	fmt.Printf("\nSending prompt: %q\n\n", prompt)
	msgID, err := session.Send(ctx, copilot.MessageOptions{Prompt: prompt})
	if err != nil {
		log.Fatalf("Send: %v", err)
	}
	fmt.Printf("(message id: %s)\n", msgID)

	select {
	case <-done:
		fmt.Println("\n✓ turn ended")
	case <-time.After(120 * time.Second):
		fmt.Println("\n⚠ timeout (no AssistantTurnEndData in 120s)")
	case <-ctx.Done():
		fmt.Println("\n✗ interrupted")
	}

	mu.Lock()
	defer mu.Unlock()
	fmt.Println("\nEvent type histogram:")
	for k, v := range seen {
		fmt.Printf("  %4d × %s\n", v, k)
	}
	fmt.Println("\nFull JSON dumps in docs/sdk-events.log")
}
