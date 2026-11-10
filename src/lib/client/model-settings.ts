import { useCallback, useEffect, useState } from "react";
import type { OpenRouterModelItem } from "./api";

/**
 * Per-browser AI model preferences. The OpenRouter key lives only in this
 * browser's storage and is sent with each chat request to be forwarded to
 * OpenRouter; Scout never saves it on the server.
 */
export interface ModelSettings {
  provider: "lovable" | "openrouter";
  lovableModel: string;
  openRouterModel: string;
  openRouterKey: string;
  openRouterModels: OpenRouterModelItem[];
  chatMode: "auto" | "search" | "chat";
}

export const BUILT_IN_MODELS = [
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { id: "openai/gpt-5.4", label: "GPT-5.4" },
] as const;

const STORAGE_KEY = "scout.model-settings.v1";
const CHANGE_EVENT = "scout:model-settings";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: "lovable",
  lovableModel: "google/gemini-3-flash-preview",
  openRouterModel: "openrouter/free",
  openRouterKey: "",
  openRouterModels: [],
  chatMode: "auto",
};

function readSettings(): ModelSettings {
  if (typeof window === "undefined") return DEFAULT_MODEL_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ModelSettings>;
    return {
      ...DEFAULT_MODEL_SETTINGS,
      ...parsed,
      openRouterModels: Array.isArray(parsed.openRouterModels) ? parsed.openRouterModels : [],
    };
  } catch {
    return DEFAULT_MODEL_SETTINGS;
  }
}

export function useModelSettings() {
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);

  useEffect(() => {
    setSettings(readSettings());
    const sync = () => setSettings(readSettings());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<ModelSettings>) => {
    const next = { ...readSettings(), ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSettings(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const activeModelLabel =
    settings.provider === "openrouter"
      ? (settings.openRouterModels.find((m) => m.id === settings.openRouterModel)?.name ??
        settings.openRouterModel)
      : (BUILT_IN_MODELS.find((m) => m.id === settings.lovableModel)?.label ??
        settings.lovableModel);

  const openRouterReady = settings.openRouterKey.startsWith("sk-or-");

  return { settings, update, activeModelLabel, openRouterReady };
}

export function maskKey(key: string): string {
  if (key.length < 12) return "••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}
