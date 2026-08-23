import type { AIProvider } from "./provider.js";
import { AnthropicProvider } from "./providers/anthropic.provider.js";
import { OpenAIProvider } from "./providers/openai.provider.js";
import { GeminiProvider } from "./providers/gemini.provider.js";

/**
 * Selects the AI backend purely from environment config (AI_PROVIDER, AI_MODEL).
 * No code changes needed to switch providers — only .env.
 */
export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "gemini";
  const model = process.env.AI_MODEL ?? "gemini-3.5-flash";

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY ?? "", model);
    case "openai":
      return new OpenAIProvider(process.env.OPENAI_API_KEY ?? "", model);
    case "gemini":
      return new GeminiProvider(process.env.GOOGLE_API_KEY ?? "", model);
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}
