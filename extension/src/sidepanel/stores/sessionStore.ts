/**
 * Session store — list of sessions + currently selected session id.
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
}

export const useSessionStore = create<SessionState>((set) => ({
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
  setActive: (activeId) => set({ activeId }),
}));
