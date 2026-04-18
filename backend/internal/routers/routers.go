// Package routers binds HTTP routes to service-layer calls. Stdlib
// net/http with Go 1.22+ pattern routing — no third-party router.
package routers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	copilot "github.com/github/copilot-sdk/go"
	"github.com/sanchar10/copilot-buddy/backend/internal/config"
	"github.com/sanchar10/copilot-buddy/backend/internal/models"
	"github.com/sanchar10/copilot-buddy/backend/internal/server/sse"
	"github.com/sanchar10/copilot-buddy/backend/internal/services"
	"github.com/sanchar10/copilot-buddy/backend/internal/storage"
)

// Register wires every route onto mux. Routes use Go 1.22 pattern syntax
// ("METHOD /path/{var}") and r.PathValue for parameters.
func Register(
	mux *http.ServeMux,
	svc *services.CopilotService,
	store *storage.Store,
	agents *storage.AgentStore,
	mcp *storage.MCPStore,
) {
	r := &router{svc: svc, store: store, agents: agents, mcp: mcp}

	mux.HandleFunc("GET "+config.APIPrefix+"/health", r.health)
	mux.HandleFunc("GET "+config.APIPrefix+"/models", r.listModels)

	mux.HandleFunc("GET "+config.APIPrefix+"/sessions", r.listSessions)
	mux.HandleFunc("POST "+config.APIPrefix+"/sessions", r.createSession)
	mux.HandleFunc("GET "+config.APIPrefix+"/sessions/{id}", r.getSession)
	mux.HandleFunc("PATCH "+config.APIPrefix+"/sessions/{id}", r.patchSession)
	mux.HandleFunc("DELETE "+config.APIPrefix+"/sessions/{id}", r.deleteSession)

	mux.HandleFunc("POST "+config.APIPrefix+"/sessions/{id}/messages", r.sendMessage)
	mux.HandleFunc("GET "+config.APIPrefix+"/sessions/{id}/response-stream", r.responseStream)
	mux.HandleFunc("GET "+config.APIPrefix+"/sessions/{id}/response-status", r.responseStatus)
	mux.HandleFunc("POST "+config.APIPrefix+"/sessions/{id}/elicitation-response", r.elicitationResponse)
	mux.HandleFunc("POST "+config.APIPrefix+"/sessions/{id}/user-input-response", r.userInputResponse)

	// Global catalogues — agents + MCP servers.
	mux.HandleFunc("GET "+config.APIPrefix+"/agents", r.listAgents)
	mux.HandleFunc("POST "+config.APIPrefix+"/agents", r.saveAgent)
	mux.HandleFunc("DELETE "+config.APIPrefix+"/agents/{name}", r.deleteAgent)

	mux.HandleFunc("GET "+config.APIPrefix+"/mcp-servers", r.listMCP)
	mux.HandleFunc("POST "+config.APIPrefix+"/mcp-servers", r.saveMCP)
	mux.HandleFunc("DELETE "+config.APIPrefix+"/mcp-servers/{name}", r.deleteMCP)
}

type router struct {
	svc    *services.CopilotService
	store  *storage.Store
	agents *storage.AgentStore
	mcp    *storage.MCPStore
}

// ----------------------------------------------------------------------
// trivial endpoints
// ----------------------------------------------------------------------

func (r *router) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (r *router) listModels(w http.ResponseWriter, req *http.Request) {
	models, err := r.svc.ListModels(req.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, models)
}

// ----------------------------------------------------------------------
// session CRUD
// ----------------------------------------------------------------------

type createSessionReq struct {
	Name            string         `json:"name"`
	Model           string         `json:"model"`
	ReasoningEffort string         `json:"reasoning_effort"`
	CWD             string         `json:"cwd"`
	SystemMessage   string         `json:"system_message"`
	Agent           string         `json:"agent"`
	MCPServers      map[string]any `json:"mcp_servers"`
}

func (r *router) createSession(w http.ResponseWriter, req *http.Request) {
	var body createSessionReq
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil && !errors.Is(err, errEOFLike(err)) {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	now := time.Now().UTC()
	sess := &models.Session{
		ID:              uuid.NewString(),
		Name:            firstNonEmpty(body.Name, "New chat"),
		NameSet:         body.Name != "",
		Model:           firstNonEmpty(body.Model, config.DefaultModel),
		ReasoningEffort: body.ReasoningEffort,
		CWD:             firstNonEmpty(body.CWD, config.DefaultCWD()),
		SystemMessage:   body.SystemMessage,
		Agent:           body.Agent,
		MCPServers:      body.MCPServers,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := r.store.Save(sess); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, sess)
}

func (r *router) listSessions(w http.ResponseWriter, _ *http.Request) {
	sessions, err := r.store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if sessions == nil {
		sessions = []*models.Session{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (r *router) getSession(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	sess, err := r.store.Get(id)
	if errors.Is(err, storage.ErrNotFound) {
		http.NotFound(w, req)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

func (r *router) deleteSession(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	if err := r.store.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// patchSession mutates a subset of session fields. Any field that can
// trigger a live SDK-session reconfiguration (model, reasoning, agent,
// system message, mcp_servers) causes the cached SessionClient to be
// recycled so the next message re-creates with the new config.
func (r *router) patchSession(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	sess, err := r.store.Get(id)
	if errors.Is(err, storage.ErrNotFound) {
		http.NotFound(w, req)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	var body struct {
		Name            *string         `json:"name"`
		Model           *string         `json:"model"`
		ReasoningEffort *string         `json:"reasoning_effort"`
		SystemMessage   *string         `json:"system_message"`
		Agent           *string         `json:"agent"`
		MCPServers      *map[string]any `json:"mcp_servers"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	needRecycle := false
	if body.Name != nil {
		sess.Name = *body.Name
		sess.NameSet = *body.Name != ""
	}
	if body.Model != nil && *body.Model != sess.Model {
		sess.Model = *body.Model
		needRecycle = true
	}
	if body.ReasoningEffort != nil && *body.ReasoningEffort != sess.ReasoningEffort {
		sess.ReasoningEffort = *body.ReasoningEffort
		needRecycle = true
	}
	if body.SystemMessage != nil && *body.SystemMessage != sess.SystemMessage {
		sess.SystemMessage = *body.SystemMessage
		needRecycle = true
	}
	if body.Agent != nil && *body.Agent != sess.Agent {
		sess.Agent = *body.Agent
		needRecycle = true
	}
	if body.MCPServers != nil {
		sess.MCPServers = *body.MCPServers
		needRecycle = true
	}
	sess.UpdatedAt = time.Now().UTC()
	if err := r.store.Save(sess); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if needRecycle {
		r.svc.RecycleClient(sess.ID)
	}
	writeJSON(w, http.StatusOK, sess)
}

// ----------------------------------------------------------------------
// messaging — the SSE-streaming hot path
// ----------------------------------------------------------------------

type sendMessageAttachment struct {
	Kind        string `json:"kind"`        // "blob" | "text"
	Name        string `json:"name"`
	MIMEType    string `json:"mime_type,omitempty"`
	Data        string `json:"data,omitempty"`        // base64 for blobs
	Text        string `json:"text,omitempty"`        // inline text content
}

type sendMessageReq struct {
	Content     string                   `json:"content"`
	Attachments []sendMessageAttachment  `json:"attachments,omitempty"`
}

func (a sendMessageAttachment) toSDK() copilot.Attachment {
	name := a.Name
	switch a.Kind {
	case "text":
		txt := a.Text
		return copilot.Attachment{
			Type:        copilot.AttachmentTypeSelection,
			DisplayName: &name,
			Text:        &txt,
		}
	default:
		mime := a.MIMEType
		data := a.Data
		return copilot.Attachment{
			Type:        copilot.AttachmentTypeBlob,
			DisplayName: &name,
			MIMEType:    &mime,
			Data:        &data,
		}
	}
}

// sendMessage starts the agent turn AND streams events back on the same
// HTTP response. If the client disconnects, the agent keeps running
// (CopilotService.SendMessageBackground uses a detached context). The
// client can reconnect via response-stream to pick up where it left off.
func (r *router) sendMessage(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	sess, err := r.store.Get(id)
	if errors.Is(err, storage.ErrNotFound) {
		http.NotFound(w, req)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	var body sendMessageReq
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if body.Content == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("content required"))
		return
	}

	// Update timestamp; persist updated_at so the sidebar sorts correctly.
	sess.UpdatedAt = time.Now().UTC()
	_ = r.store.Save(sess)

	buf := r.svc.SendMessageBackground(req.Context(), sess, body.Content, toSDKAttachments(body.Attachments))
	streamBuffer(w, req.Context(), buf, 0)
}

func toSDKAttachments(in []sendMessageAttachment) []copilot.Attachment {
	if len(in) == 0 {
		return nil
	}
	out := make([]copilot.Attachment, 0, len(in))
	for _, a := range in {
		out = append(out, a.toSDK())
	}
	return out
}

// responseStream resumes streaming from `?from=N` (default 0) for an
// already-started turn. Used by the extension on reconnect after the
// side panel was closed.
func (r *router) responseStream(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	buf := r.svc.Buffers.Get(id)
	if buf == nil {
		http.Error(w, "no active or recent buffer for session", http.StatusNotFound)
		return
	}
	from, _ := strconv.Atoi(req.URL.Query().Get("from"))
	streamBuffer(w, req.Context(), buf, from)
}

// responseStatus is a cheap JSON snapshot of a buffer's state, used by
// the extension to decide whether to attempt a resume.
func (r *router) responseStatus(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	buf := r.svc.Buffers.Get(id)
	if buf == nil {
		writeJSON(w, http.StatusOK, map[string]any{"active": false})
		return
	}
	status, length, errMsg, completedAt := buf.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"active":         true,
		"status":         status.String(),
		"events":         length,
		"error":          errMsg,
		"completed_at":   completedAt,
		"content_length": buf.ContentLength(),
	})
}

// elicitationResponse delivers the user's modal answer to the SDK
// handler that's blocked inside an active turn.
func (r *router) elicitationResponse(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	var body struct {
		RequestID string         `json:"request_id"`
		Action    string         `json:"action"`
		Content   map[string]any `json:"content"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if body.RequestID == "" || body.Action == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("request_id and action required"))
		return
	}
	res := copilot.ElicitationResult{Action: body.Action, Content: body.Content}
	if err := r.svc.RespondToElicitation(id, body.RequestID, res); err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// userInputResponse delivers the user's `ask_user` modal answer.
func (r *router) userInputResponse(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	var body struct {
		RequestID   string `json:"request_id"`
		Answer      string `json:"answer"`
		WasFreeform bool   `json:"was_freeform"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if body.RequestID == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("request_id required"))
		return
	}
	res := copilot.UserInputResponse{Answer: body.Answer, WasFreeform: body.WasFreeform}
	if err := r.svc.RespondToUserInput(id, body.RequestID, res); err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// streamBuffer is the shared SSE driver used by both sendMessage and
// responseStream. It pumps every new event from `from` onward to the
// client, then sends a final `done` (or `error`) and returns.
func streamBuffer(w http.ResponseWriter, ctx context.Context, buf *services.ResponseBuffer, from int) {
	sw, err := sse.New(w)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	sw.Heartbeat(ctx.Done(), 25*time.Second)

	cursor := from
	for {
		// Wait on the buffer; bounded by the request context so client
		// disconnect frees the goroutine quickly.
		_ = buf.Wait(ctx, cursor, 30*time.Second)
		evts, n := buf.EventsFrom(cursor)
		cursor = n
		for _, e := range evts {
			if err := sw.Event(e.Name, e.Data); err != nil {
				return // client gone
			}
		}
		status, _, errMsg, _ := buf.Snapshot()
		if status == services.StatusCompleted {
			_ = sw.Event(models.EventDone, models.DonePayload{
				ContentLength: buf.ContentLength(),
				SessionName:   buf.UpdatedSessionName,
				UpdatedAt:     time.Now().UTC().Format(time.RFC3339),
			})
			return
		}
		if status == services.StatusFailed {
			_ = sw.Event(models.EventError, models.ErrorPayload{Error: errMsg})
			return
		}
		if ctx.Err() != nil {
			return
		}
	}
}

// ----------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, code int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("writeJSON: %v", err)
	}
}

func writeError(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// errEOFLike is a tiny adaptor so we can silently accept empty bodies on
// optional-body POSTs.
func errEOFLike(err error) error {
	if err != nil && err.Error() == "EOF" {
		return err
	}
	return nil
}

// ----------------------------------------------------------------------
// agents CRUD (global catalogue)
// ----------------------------------------------------------------------

func (r *router) listAgents(w http.ResponseWriter, _ *http.Request) {
list, err := r.agents.List()
if err != nil {
writeError(w, http.StatusInternalServerError, err)
return
}
if list == nil {
list = []models.CustomAgent{}
}
writeJSON(w, http.StatusOK, map[string]any{"agents": list})
}

func (r *router) saveAgent(w http.ResponseWriter, req *http.Request) {
var body models.CustomAgent
if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
writeError(w, http.StatusBadRequest, err)
return
}
if body.Name == "" {
writeError(w, http.StatusBadRequest, fmt.Errorf("name required"))
return
}
if err := r.agents.Save(body); err != nil {
writeError(w, http.StatusInternalServerError, err)
return
}
writeJSON(w, http.StatusOK, body)
}

func (r *router) deleteAgent(w http.ResponseWriter, req *http.Request) {
name := req.PathValue("name")
if err := r.agents.Delete(name); err != nil {
if errors.Is(err, storage.ErrAgentNotFound) {
http.NotFound(w, req)
return
}
writeError(w, http.StatusInternalServerError, err)
return
}
w.WriteHeader(http.StatusNoContent)
}

// ----------------------------------------------------------------------
// mcp-servers CRUD (global catalogue)
// ----------------------------------------------------------------------

func (r *router) listMCP(w http.ResponseWriter, _ *http.Request) {
all, err := r.mcp.All()
if err != nil {
writeError(w, http.StatusInternalServerError, err)
return
}
if all == nil {
all = map[string]map[string]any{}
}
writeJSON(w, http.StatusOK, map[string]any{"servers": all})
}

func (r *router) saveMCP(w http.ResponseWriter, req *http.Request) {
var body struct {
Name   string         `json:"name"`
Config map[string]any `json:"config"`
}
if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
writeError(w, http.StatusBadRequest, err)
return
}
if body.Name == "" || body.Config == nil {
writeError(w, http.StatusBadRequest, fmt.Errorf("name and config required"))
return
}
if err := r.mcp.Save(body.Name, body.Config); err != nil {
writeError(w, http.StatusInternalServerError, err)
return
}
writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (r *router) deleteMCP(w http.ResponseWriter, req *http.Request) {
name := req.PathValue("name")
if err := r.mcp.Delete(name); err != nil {
if errors.Is(err, storage.ErrMCPNotFound) {
http.NotFound(w, req)
return
}
writeError(w, http.StatusInternalServerError, err)
return
}
w.WriteHeader(http.StatusNoContent)
}
