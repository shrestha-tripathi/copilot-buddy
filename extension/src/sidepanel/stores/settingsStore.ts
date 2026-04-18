/**
 * Settings store — daemon URL + bearer token, persisted to chrome.storage.local.
 *
 * Defaults to the Go daemon's first-run port (8770). Token is empty until
 * the user pastes it in via the panel onboarding (added in P6).
 */

import { create } from "zustand";

export interface DaemonSettings {
  baseUrl: string;
  token: string;
}

interface SettingsState {
  loaded: boolean;
  settings: DaemonSettings;
  load: () => Promise<void>;
  save: (s: Partial<DaemonSettings>) => Promise<void>;
}

const STORAGE_KEY = "copilotBuddySettings";

const DEFAULT_SETTINGS: DaemonSettings = {
  baseUrl: "http://127.0.0.1:8770",
  token: "",
};

function safeStorage(): chrome.storage.LocalStorageArea | null {
  try {
    return typeof chrome !== "undefined" ? chrome.storage?.local ?? null : null;
  } catch {
    return null;
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  settings: DEFAULT_SETTINGS,

  load: async () => {
    const storage = safeStorage();
    if (!storage) {
      set({ loaded: true });
      return;
    }
    const out = await storage.get(STORAGE_KEY);
    const stored = (out?.[STORAGE_KEY] ?? {}) as Partial<DaemonSettings>;
    set({
      loaded: true,
      settings: { ...DEFAULT_SETTINGS, ...stored },
    });
  },

  save: async (partial) => {
    const next = { ...get().settings, ...partial };
    set({ settings: next });
    const storage = safeStorage();
    if (storage) {
      await storage.set({ [STORAGE_KEY]: next });
    }
  },
}));
