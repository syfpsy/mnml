import { useEffect, useRef, useState } from "react";
import { bridge } from "../lib/bridge";
import type { AppSettings } from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const updateSeq = useRef(0);

  useEffect(() => {
    bridge.getSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const seq = ++updateSeq.current;
    try {
      const next = await bridge.updateSetting(key, value);
      if (seq !== updateSeq.current) return next;
      setSettings(next);
      return next;
    } catch {
      const current = await bridge.getSettings().catch(() => null);
      if (current && seq === updateSeq.current) setSettings(current);
      return null;
    }
  };

  return { settings, update };
}
