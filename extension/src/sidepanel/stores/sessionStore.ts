/**
 * Session store — list of sessions + currently selected session id.
 *
 * The active session id is mirrored to chrome.storage.session so the panel
 * remembers the current session across close/open within a browser session.
 */

import { create } from "zustand";
import type { Session } from "@/shared/api/sessions";

interface SessionState {
  sessions: Session[];
  activeId: string | null;
  setSessions: (s: Session[]) => void;
  upsert: (s: Session) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  hydrateActive: () => Promise<void>;
}

const ACTIVE_KEY = "copilotBuddyActiveSessionId";

function safeSession(): chrome.storage.StorageArea | null {
  try {
    return typeof chrome !== "undefined" ? chrome.storage?.session ?? null : null;
  } catch {
    return null;
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,
  setSessions: (sessions) => set({ sessions }),
  upsert: (s) =>
    set((st) => {
      const idx = st.sessions.findIndex((x) => x.id === s.id);
      if (idx === -1) return { sessions: [s, ...st.sessions] };
      const next = st.sessions.slice();
      next[idx] = s;
      return { sessions: next };
    }),
  remove: (id) =>
    set((st) => ({
      sessions: st.sessions.filter((x) => x.id !== id),
      activeId: st.activeId === id ? null : st.activeId,
    })),
  setActive: (activeId) => {
    set({ activeId });
    const storage = safeSession();
    if (storage) {
      void storage.set({ [ACTIVE_KEY]: activeId });
    }
  },
  hydrateActive: async () => {
    const storage = safeSession();
    if (!storage) return;
    const out = await storage.get(ACTIVE_KEY);
    const stored = out?.[ACTIVE_KEY];
    if (typeof stored === "string" && !get().activeId) {
      set({ activeId: stored });
    }
  },
}));
