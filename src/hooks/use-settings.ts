import { useEffect, useState } from "react";
import { bridge } from "../lib/bridge";
import type { AppSettings } from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    bridge.getSettings().then(setSettings);
  }, []);

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = await bridge.updateSetting(key, value);
    setSettings(next);
    return next;
  };

  return { settings, update };
}
