import type { AiProvider } from "@/bindings";
import i18n from "@/i18n";

/** Providers the app can talk to, with the model each one starts on. `local` providers run on this machine. */
export const PROVIDERS: { value: AiProvider; label: string; model: string; needsKey: boolean; local?: boolean }[] = [
  { value: "anthropic", label: "Anthropic", model: "claude-haiku-4-5-20251001", needsKey: true },
  { value: "openai", label: "OpenAI", model: "gpt-5-mini", needsKey: true },
  { value: "gemini", label: "Google Gemini", model: "gemini-2.5-flash", needsKey: true },
  { value: "openrouter", label: "OpenRouter", model: "anthropic/claude-haiku-4.5", needsKey: true },
  { value: "ollama", label: "Ollama", model: "qwen3:8b", needsKey: false, local: true },
];

/** Provider name for display; local ones get a translated "(local)" suffix. */
export const providerLabel = (p: (typeof PROVIDERS)[number]) =>
  p.local ? i18n.t("settings.ai.localProvider", { name: p.label }) : p.label;
