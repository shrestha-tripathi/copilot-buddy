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
  cwd: string;
  system_message?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  name?: string;
  model?: string;
  cwd?: string;
  system_message?: string;
}

export interface UpdateSessionRequest {
  name?: string;
  model?: string;
  system_message?: string;
}

export interface SessionListResponse {
  sessions: Session[];
}

export interface ResponseStatus {
  active: boolean;
  events_count?: number;
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
  models: (api: Api) =>
    api.request<{ models: Array<{ id: string; name?: string }> }>("/api/models"),
};
