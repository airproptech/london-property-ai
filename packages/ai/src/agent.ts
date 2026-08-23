import type { AIProvider, AgentMessage } from "./provider.js";
import { AGENT_TOOLS } from "./tools/definitions.js";
import * as handlers from "./tools/handlers.js";

const SYSTEM_PROMPT = `You are a lead-qualification and property-matching assistant for a London leasehold property business.

Rules you must follow at all times:
- Never invent information. If a fact is unknown, record it as unknown rather than guessing.
- Ask one or two intelligent follow-up questions at a time — never interrogate the lead with a long list at once.
- Never present AI-generated commentary, calculated estimates (e.g. yield), or your own inferences as guaranteed facts. Distinguish clearly between actual data, calculated estimates, and your own commentary.
- Never give legal, tax, or regulated financial advice. Direct the lead to a qualified professional for those topics.
- Call notify_human whenever: the lead is highly qualified, requests a human, wants to make an offer, asks a complex legal/tax/financial question, complains, raises a sensitive situation, or when your own confidence is low.
- Respect opt-outs and stated communication preferences absolutely.`;

/** Maps a tool name to its handler. Deliberately explicit, no dynamic dispatch by string reflection. */
async function dispatchToolCall(toolName: string, input: Record<string, unknown>) {
  switch (toolName) {
    case "get_lead":
      return handlers.getLead(input.leadId as string);
    case "update_lead":
      return handlers.updateLead(input.leadId as string, input as any);
    case "get_lead_preferences":
      return handlers.getLeadPreferences(input.leadId as string);
    case "update_lead_preferences":
      return handlers.updateLeadPreferences(input.leadId as string, input);
    case "search_properties":
      return handlers.searchProperties(input as any);
    case "match_properties":
      return handlers.matchProperties(input.leadId as string);
    case "create_followup":
      return handlers.createFollowup(input as any);
    case "cancel_followup":
      return handlers.cancelFollowup(input.followupId as string);
    case "get_conversation_history":
      return handlers.getConversationHistory(input.leadId as string, input.limit as number | undefined);
    case "create_appointment":
      return handlers.createAppointment(input as any);
    case "notify_human":
      return handlers.notifyHuman(input as any);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export class LeadQualificationAgent {
  constructor(private readonly provider: AIProvider) {}

  /**
   * Runs one turn of the agent loop: sends the conversation + tool
   * definitions to the provider, executes any requested tool calls via
   * the permission-checked handlers, and returns the assistant's reply.
   * Multi-step tool use (tool result fed back for a follow-up call) is
   * left for Phase 5 implementation once this scaffold is validated
   * against a real Anthropic account.
   */
  async runTurn(messages: AgentMessage[]) {
    const response = await this.provider.complete(messages, AGENT_TOOLS, SYSTEM_PROMPT);

    const toolResults = [];
    for (const call of response.toolCalls) {
      try {
        const result = await dispatchToolCall(call.toolName, call.input);
        toolResults.push({ toolName: call.toolName, id: call.id, result });
      } catch (err) {
        toolResults.push({
          toolName: call.toolName,
          id: call.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { text: response.text, toolResults };
  }
}
