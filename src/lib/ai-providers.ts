import type { AiProvider } from "@/bindings";

/** Providers the app can talk to, with the model each one starts on. `local` providers run on this machine. */
export const PROVIDERS: { value: AiProvider; label: string; model: string; needsKey: boolean; local?: boolean }[] = [
  { value: "anthropic", label: "Anthropic", model: "claude-haiku-4-5-20251001", needsKey: true },
  { value: "openai", label: "OpenAI", model: "gpt-5-mini", needsKey: true },
  { value: "gemini", label: "Google Gemini", model: "gemini-2.5-flash", needsKey: true },
  { value: "openrouter", label: "OpenRouter", model: "anthropic/claude-haiku-4.5", needsKey: true },
  { value: "ollama", label: "Ollama (local)", model: "qwen3:8b", needsKey: false, local: true },
];
