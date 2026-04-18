/**
 * useApi — bridges the settings store with the API client. Returns a fresh
 * Api instance whenever the daemon URL or token changes.
 */

import { useMemo } from "react";
import { makeApi, type Api } from "@/shared/api/client";
import { useSettingsStore } from "../stores/settingsStore";

export function useApi(): Api {
  const settings = useSettingsStore((s) => s.settings);
  return useMemo(
    () => makeApi({ baseUrl: settings.baseUrl, token: settings.token }),
    [settings.baseUrl, settings.token],
  );
}
