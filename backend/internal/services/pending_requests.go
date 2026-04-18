// Pending elicitation / user-input request bookkeeping.
//
// SDK semantics: ElicitationHandler and UserInputHandler are *synchronous*
// — the SDK blocks until they return. To bridge that to an asynchronous
// HTTP/UI flow we register a one-shot result channel per request, emit
// the request payload as an SSE event so the side panel can render a
// modal, and block on the channel until the panel POSTs the response.

package services

import (
	"context"
	"errors"
	"fmt"
	"sync"

	copilot "github.com/github/copilot-sdk/go"
)

var (
	// ErrUnknownRequest is returned by Resolve* when the request id is
	// either expired or never existed (e.g. duplicate POST).
	ErrUnknownRequest = errors.New("unknown pending request")
)

// pendingRequests holds in-flight elicitation/user-input handler waits.
// A SessionClient owns one of these.
type pendingRequests struct {
	mu          sync.Mutex
	elicitation map[string]chan copilot.ElicitationResult
	userInput   map[string]chan copilot.UserInputResponse
}

func newPendingRequests() *pendingRequests {
	return &pendingRequests{
		elicitation: map[string]chan copilot.ElicitationResult{},
		userInput:   map[string]chan copilot.UserInputResponse{},
	}
}

// awaitElicitation registers a one-shot channel for `id` and blocks
// until the channel receives a value, the context is cancelled, or the
// request is cancelled by another goroutine.
func (p *pendingRequests) awaitElicitation(ctx context.Context, id string) (copilot.ElicitationResult, error) {
	ch := make(chan copilot.ElicitationResult, 1)
	p.mu.Lock()
	p.elicitation[id] = ch
	p.mu.Unlock()
	defer p.dropElicitation(id)

	select {
	case res := <-ch:
		return res, nil
	case <-ctx.Done():
		return copilot.ElicitationResult{Action: "cancel"},
			fmt.Errorf("elicitation %s cancelled: %w", id, ctx.Err())
	}
}

func (p *pendingRequests) awaitUserInput(ctx context.Context, id string) (copilot.UserInputResponse, error) {
	ch := make(chan copilot.UserInputResponse, 1)
	p.mu.Lock()
	p.userInput[id] = ch
	p.mu.Unlock()
	defer p.dropUserInput(id)

	select {
	case res := <-ch:
		return res, nil
	case <-ctx.Done():
		return copilot.UserInputResponse{},
			fmt.Errorf("user-input %s cancelled: %w", id, ctx.Err())
	}
}

// ResolveElicitation delivers `res` to whichever goroutine is awaiting
// `id`. Returns ErrUnknownRequest if no waiter exists.
func (p *pendingRequests) ResolveElicitation(id string, res copilot.ElicitationResult) error {
	p.mu.Lock()
	ch, ok := p.elicitation[id]
	if ok {
		delete(p.elicitation, id)
	}
	p.mu.Unlock()
	if !ok {
		return ErrUnknownRequest
	}
	ch <- res
	return nil
}

func (p *pendingRequests) ResolveUserInput(id string, res copilot.UserInputResponse) error {
	p.mu.Lock()
	ch, ok := p.userInput[id]
	if ok {
		delete(p.userInput, id)
	}
	p.mu.Unlock()
	if !ok {
		return ErrUnknownRequest
	}
	ch <- res
	return nil
}

func (p *pendingRequests) dropElicitation(id string) {
	p.mu.Lock()
	delete(p.elicitation, id)
	p.mu.Unlock()
}

func (p *pendingRequests) dropUserInput(id string) {
	p.mu.Lock()
	delete(p.userInput, id)
	p.mu.Unlock()
}
