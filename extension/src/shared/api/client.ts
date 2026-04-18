/**
 * Typed HTTP client for the Copilot Buddy daemon.
 *
 * The daemon enforces a bearer token on every route except /api/health.
 * Both daemon URL and token live in chrome.storage.local (managed via the
 * settings store). See ../../sidepanel/stores/settingsStore.ts.
 */

import { parseSSEStream, type SSEEventHandler } from "./sse";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface DaemonConfig {
  baseUrl: string;
  token: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(res.status, data.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function makeApi(cfg: DaemonConfig) {
  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { ...authHeaders(cfg.token) };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleJson<T>(res);
  }

  /**
   * Stream an SSE endpoint. Caller passes an `onEvent` handler dispatched
   * for every parsed event block. Resolves when the stream ends or the
   * AbortSignal fires.
   */
  async function stream(
    path: string,
    onEvent: SSEEventHandler,
    opts: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<void> {
    const headers: Record<string, string> = {
      ...authHeaders(cfg.token),
      Accept: "text/event-stream",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string });
      throw new ApiError(res.status, data.error || res.statusText);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new ApiError(0, "Response had no body to stream");

    await parseSSEStream(reader, onEvent);
  }

  return { request, stream, cfg };
}

export type Api = ReturnType<typeof makeApi>;
