import type { AIProvider, AgentMessage, AgentResponse, ToolDefinition } from "../provider.js";

/**
 * Scaffold only — not wired up until AI_PROVIDER=openai is actually needed.
 * Implementing this without a real OpenAI key to test against would risk
 * shipping an untested integration, which the project rules explicitly
 * disallow ("do not claim an integration works without testing it").
 */
export class OpenAIProvider implements AIProvider {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async complete(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<AgentResponse> {
    throw new Error("OpenAIProvider is not yet implemented.");
  }
}
