import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AgentMessage, AgentResponse, ToolDefinition, ToolCallRequest } from "../provider.js";

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }
    this.client = new Anthropic({ apiKey });
  }

  async complete(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<AgentResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
      })),
    });

    let text: string | null = null;
    const toolCalls: ToolCallRequest[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        text = (text ?? "") + block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          toolName: block.name,
          input: block.input as Record<string, unknown>,
          id: block.id,
        });
      }
    }

    return { text, toolCalls, raw: response };
  }
}
