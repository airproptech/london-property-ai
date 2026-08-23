import { GoogleGenAI } from "@google/genai";
import type { AIProvider, AgentMessage, AgentResponse, ToolDefinition, ToolCallRequest } from "../provider.js";

/**
 * Gemini implementation of the AIProvider interface, using Google's
 * official @google/genai SDK. Gemini's function-calling format differs
 * from Anthropic's tool_use format, so this class translates between
 * our shared ToolDefinition/AgentResponse shapes and Gemini's
 * functionDeclarations/functionCall shapes -- nothing outside this file
 * needs to know the difference.
 *
 * Free tier: Google AI Studio keys get a generous free daily quota
 * (no billing required to start), which is why this is implemented
 * as a first-class option alongside Anthropic, not just Anthropic
 * with Gemini as an afterthought.
 */
export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;

  constructor(private readonly apiKey: string, private readonly model: string) {
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not configured.");
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<AgentResponse> {
    // Gemini has no separate "system" message slot in generateContent the
    // way Anthropic does -- it's passed via systemInstruction instead.
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const functionDeclarations = tools.map((t) => ({
      name: t.name,
      description: t.description,
      // Gemini expects JSON-schema-like objects with UPPERCASE type names
      // in some SDK versions and lowercase in others; the current
      // @google/genai SDK accepts standard lowercase JSON schema directly.
      parameters: t.inputSchema,
    }));

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
      },
    });

    let text: string | null = null;
    const toolCalls: ToolCallRequest[] = [];

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    for (const part of parts) {
      if (part.text) {
        text = (text ?? "") + part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          toolName: part.functionCall.name ?? "unknown",
          input: (part.functionCall.args as Record<string, unknown>) ?? {},
          // Gemini doesn't issue a stable call ID the way Anthropic does;
          // synthesize one so downstream code (which expects an id) works
          // identically regardless of provider.
          id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
      }
    }

    return { text, toolCalls, raw: response };
  }
}
