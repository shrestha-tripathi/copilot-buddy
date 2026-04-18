/**
 * Chat store — messages, streaming state, and SSE delta batching.
 *
 * Mirrors copilot-console's chatStore: deltas are coalesced per-session in
 * module-level buffers and flushed every DELTA_BATCH_MS to avoid React
 * re-rendering per token.
 */

import { create } from "zustand";

export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  steps?: Step[];
}

export interface Step {
  title: string;
  detail?: string;
}

export interface UsageInfo {
  tokenLimit: number;
  currentTokens: number;
  messagesLength: number;
}

export interface ElicitationRequest {
  requestId: string;
  message: string;
  requestedSchema?: Record<string, unknown> | null;
  mode?: string;
  source?: string;
  url?: string;
}

export interface AskUserRequest {
  requestId: string;
  question: string;
  choices: string[];
  allowFreeform: boolean;
}

interface StreamingState {
  content: string;
  steps: Step[];
  isStreaming: boolean;
}

const EMPTY_STREAM: StreamingState = {
  content: "",
  steps: [],
  isStreaming: false,
};

export const DELTA_BATCH_MS = 50;

const deltaBuffers: Record<string, string[]> = {};
const flushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

interface ChatState {
  messagesPerSession: Record<string, Message[]>;
  streamingPerSession: Record<string, StreamingState>;
  usagePerSession: Record<string, UsageInfo | null>;
  pendingElicitation: Record<string, ElicitationRequest | null>;
  pendingAskUser: Record<string, AskUserRequest | null>;

  getStreaming: (sessionId: string | null) => StreamingState;
  setMessages: (sessionId: string, messages: Message[]) => void;
  addMessage: (sessionId: string, message: Message) => void;
  appendDelta: (sessionId: string, content: string) => void;
  addStep: (sessionId: string, step: Step) => void;
  setUsage: (sessionId: string, usage: UsageInfo) => void;
  setStreaming: (sessionId: string, isStreaming: boolean) => void;
  finalizeAssistantMessage: (sessionId: string, messageId: string) => void;
  clearSession: (sessionId: string) => void;
  setPendingElicitation: (sessionId: string, req: ElicitationRequest | null) => void;
  setPendingAskUser: (sessionId: string, req: AskUserRequest | null) => void;
}

function flushBuffer(sessionId: string) {
  if (flushTimers[sessionId]) {
    clearTimeout(flushTimers[sessionId]);
    delete flushTimers[sessionId];
  }
  const buf = deltaBuffers[sessionId];
  if (!buf || buf.length === 0) return;
  const flushed = buf.join("");
  deltaBuffers[sessionId] = [];
  useChatStore.setState((s) => {
    const cur = s.streamingPerSession[sessionId] ?? EMPTY_STREAM;
    return {
      streamingPerSession: {
        ...s.streamingPerSession,
        [sessionId]: { ...cur, content: cur.content + flushed, isStreaming: true },
      },
    };
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesPerSession: {},
  streamingPerSession: {},
  usagePerSession: {},
  pendingElicitation: {},
  pendingAskUser: {},

  getStreaming: (sessionId) => {
    if (!sessionId) return EMPTY_STREAM;
    const stored = get().streamingPerSession[sessionId] ?? EMPTY_STREAM;
    const buf = deltaBuffers[sessionId];
    if (buf && buf.length > 0) {
      return { ...stored, content: stored.content + buf.join("") };
    }
    return stored;
  },

  setMessages: (sessionId, messages) =>
    set((s) => ({
      messagesPerSession: { ...s.messagesPerSession, [sessionId]: messages },
    })),

  addMessage: (sessionId, message) =>
    set((s) => ({
      messagesPerSession: {
        ...s.messagesPerSession,
        [sessionId]: [...(s.messagesPerSession[sessionId] ?? []), message],
      },
    })),

  appendDelta: (sessionId, content) => {
    if (!deltaBuffers[sessionId]) deltaBuffers[sessionId] = [];
    deltaBuffers[sessionId].push(content);
    if (!flushTimers[sessionId]) {
      flushTimers[sessionId] = setTimeout(
        () => flushBuffer(sessionId),
        DELTA_BATCH_MS,
      );
    }
  },

  addStep: (sessionId, step) =>
    set((s) => {
      const cur = s.streamingPerSession[sessionId] ?? EMPTY_STREAM;
      return {
        streamingPerSession: {
          ...s.streamingPerSession,
          [sessionId]: { ...cur, steps: [...cur.steps, step] },
        },
      };
    }),

  setUsage: (sessionId, usage) =>
    set((s) => ({ usagePerSession: { ...s.usagePerSession, [sessionId]: usage } })),

  setStreaming: (sessionId, isStreaming) =>
    set((s) => {
      const cur = s.streamingPerSession[sessionId] ?? EMPTY_STREAM;
      return {
        streamingPerSession: {
          ...s.streamingPerSession,
          [sessionId]: { ...cur, isStreaming },
        },
      };
    }),

  finalizeAssistantMessage: (sessionId, messageId) => {
    flushBuffer(sessionId);
    const cur = get().streamingPerSession[sessionId] ?? EMPTY_STREAM;
    const message: Message = {
      id: messageId || crypto.randomUUID(),
      role: "assistant",
      content: cur.content,
      steps: cur.steps,
      createdAt: Date.now(),
    };
    set((s) => ({
      messagesPerSession: {
        ...s.messagesPerSession,
        [sessionId]: [...(s.messagesPerSession[sessionId] ?? []), message],
      },
      streamingPerSession: { ...s.streamingPerSession, [sessionId]: EMPTY_STREAM },
    }));
  },

  clearSession: (sessionId) => {
    flushBuffer(sessionId);
    delete deltaBuffers[sessionId];
    if (flushTimers[sessionId]) {
      clearTimeout(flushTimers[sessionId]);
      delete flushTimers[sessionId];
    }
    set((s) => {
      const m = { ...s.messagesPerSession };
      const st = { ...s.streamingPerSession };
      const u = { ...s.usagePerSession };
      const pe = { ...s.pendingElicitation };
      const pa = { ...s.pendingAskUser };
      delete m[sessionId];
      delete st[sessionId];
      delete u[sessionId];
      delete pe[sessionId];
      delete pa[sessionId];
      return {
        messagesPerSession: m,
        streamingPerSession: st,
        usagePerSession: u,
        pendingElicitation: pe,
        pendingAskUser: pa,
      };
    });
  },

  setPendingElicitation: (sessionId, req) =>
    set((s) => ({
      pendingElicitation: { ...s.pendingElicitation, [sessionId]: req },
    })),

  setPendingAskUser: (sessionId, req) =>
    set((s) => ({
      pendingAskUser: { ...s.pendingAskUser, [sessionId]: req },
    })),
}));
