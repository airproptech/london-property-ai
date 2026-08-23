export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON schema
}

export interface ToolCallRequest {
  toolName: string;
  input: Record<string, unknown>;
  id: string;
}

export interface AgentResponse {
  text: string | null;
  toolCalls: ToolCallRequest[];
  raw?: unknown;
}

/**
 * Every AI backend (Anthropic, OpenAI, Gemini) implements this interface.
 * The agent orchestrator (see agent.ts) depends only on this — swapping
 * providers is an env var change (AI_PROVIDER), not a code change.
 */
export interface AIProvider {
  complete(messages: AgentMessage[], tools: ToolDefinition[], systemPrompt: string): Promise<AgentResponse>;
}
