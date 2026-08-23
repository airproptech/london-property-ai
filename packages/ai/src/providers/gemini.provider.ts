import type { AIProvider, AgentMessage, AgentResponse, ToolDefinition } from "../provider.js";

/** Scaffold only — see openai.provider.ts for rationale. */
export class GeminiProvider implements AIProvider {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async complete(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<AgentResponse> {
    throw new Error("GeminiProvider is not yet implemented.");
  }
}
