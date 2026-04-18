/**
 * Session-related API calls.
 *
 * Endpoint contract is defined in `backend/internal/routers/routers.go`.
 */

import type { Api } from "./client";

export interface Session {
  id: string;
  name: string;
  name_set: boolean;
  model: string;
  reasoning_effort?: string;
  cwd: string;
  system_message?: string;
  agent?: string;
  mcp_servers?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  name?: string;
  model?: string;
  reasoning_effort?: string;
  cwd?: string;
  system_message?: string;
  agent?: string;
  mcp_servers?: Record<string, unknown>;
}

export interface UpdateSessionRequest {
  name?: string;
  model?: string;
  reasoning_effort?: string;
  system_message?: string;
  agent?: string;
  mcp_servers?: Record<string, unknown>;
}

export interface SessionListResponse {
  sessions: Session[];
}

export interface ResponseStatus {
  active: boolean;
  status?: string;
  events?: number;
  error?: string | null;
  completed_at?: string | null;
  content_length?: number;
}

export interface ModelCapabilities {
  supports?: { reasoningEffort?: boolean };
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  vendor?: string;
  capabilities?: ModelCapabilities;
}

export interface CustomAgent {
  name: string;
  description?: string;
  prompt: string;
  tools?: string[];
  mcp_servers?: Record<string, unknown>;
  infer?: boolean;
}

export interface MCPServerEntry {
  name: string;
  config: Record<string, unknown>;
}

export const sessionsApi = {
  list: (api: Api) => api.request<SessionListResponse>("/api/sessions"),
  get: (api: Api, id: string) => api.request<Session>(`/api/sessions/${id}`),
  create: (api: Api, body: CreateSessionRequest) =>
    api.request<Session>("/api/sessions", { method: "POST", body }),
  update: (api: Api, id: string, body: UpdateSessionRequest) =>
    api.request<Session>(`/api/sessions/${id}`, { method: "PATCH", body }),
  delete: (api: Api, id: string) =>
    api.request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
  responseStatus: (api: Api, id: string) =>
    api.request<ResponseStatus>(`/api/sessions/${id}/response-status`),
  models: (api: Api) => api.request<ModelInfo[]>("/api/models"),
  respondElicitation: (
    api: Api,
    id: string,
    body: {
      request_id: string;
      action: "accept" | "decline" | "cancel";
      content?: Record<string, unknown>;
    },
  ) =>
    api.request<{ ok: boolean }>(`/api/sessions/${id}/elicitation-response`, {
      method: "POST",
      body,
    }),
  respondUserInput: (
    api: Api,
    id: string,
    body: { request_id: string; answer: string; was_freeform: boolean },
  ) =>
    api.request<{ ok: boolean }>(`/api/sessions/${id}/user-input-response`, {
      method: "POST",
      body,
    }),
};

export const agentsApi = {
  list: (api: Api) => api.request<{ agents: CustomAgent[] }>("/api/agents"),
  save: (api: Api, body: CustomAgent) =>
    api.request<CustomAgent>("/api/agents", { method: "POST", body }),
  delete: (api: Api, name: string) =>
    api.request<void>(`/api/agents/${encodeURIComponent(name)}`, { method: "DELETE" }),
};

export const mcpApi = {
  list: (api: Api) =>
    api.request<{ servers: Record<string, Record<string, unknown>> }>("/api/mcp-servers"),
  save: (api: Api, body: MCPServerEntry) =>
    api.request<{ ok: boolean }>("/api/mcp-servers", { method: "POST", body }),
  delete: (api: Api, name: string) =>
    api.request<void>(`/api/mcp-servers/${encodeURIComponent(name)}`, { method: "DELETE" }),
};
