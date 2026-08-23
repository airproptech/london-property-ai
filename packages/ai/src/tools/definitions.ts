import type { ToolDefinition } from "../provider.js";

/**
 * The complete, fixed set of tools the AI agent may call. Every one of
 * these maps to a reviewed, permission-checked function in tools/handlers.ts —
 * the agent has NO other way to read or write data. Adding a capability
 * means adding a tool here AND a handler, deliberately, not opening up
 * raw database access.
 */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "get_lead",
    description: "Retrieve a lead's profile by ID, including status, score, and temperature.",
    inputSchema: {
      type: "object",
      properties: { leadId: { type: "string" } },
      required: ["leadId"],
    },
  },
  {
    name: "update_lead",
    description:
      "Update mutable fields on a lead (contact info, status, preferred contact method). Never invent values for fields the lead hasn't provided — omit them instead.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        preferredContactMethod: { type: "string", enum: ["email", "whatsapp", "sms", "phone"] },
        status: { type: "string" },
      },
      required: ["leadId"],
    },
  },
  {
    name: "get_lead_preferences",
    description: "Retrieve a lead's stated property preferences (budget, location, bedrooms, etc.).",
    inputSchema: {
      type: "object",
      properties: { leadId: { type: "string" } },
      required: ["leadId"],
    },
  },
  {
    name: "update_lead_preferences",
    description:
      "Update a lead's stated preferences. Only set fields the lead has explicitly stated. Leave everything else untouched — do not guess or infer values.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        budgetMin: { type: "number" },
        budgetMax: { type: "number" },
        preferredLocations: { type: "array", items: { type: "string" } },
        propertyTypes: { type: "array", items: { type: "string" } },
        bedroomsMin: { type: "number" },
        bedroomsMax: { type: "number" },
        investmentOrResidential: { type: "string", enum: ["investment", "residential", "unknown"] },
        cashOrMortgage: { type: "string", enum: ["cash", "mortgage", "unknown"] },
        depositAvailable: { type: "number" },
        desiredRoiPercent: { type: "number" },
        desiredCompletion: { type: "string" },
        minimumLeaseLength: { type: "number" },
      },
      required: ["leadId"],
    },
  },
  {
    name: "search_properties",
    description: "Search the property database by area, price range, bedrooms, or type.",
    inputSchema: {
      type: "object",
      properties: {
        londonArea: { type: "string" },
        priceMax: { type: "number" },
        priceMin: { type: "number" },
        bedrooms: { type: "number" },
        propertyType: { type: "string" },
      },
    },
  },
  {
    name: "match_properties",
    description: "Compute ranked property matches for a lead based on their stored preferences.",
    inputSchema: {
      type: "object",
      properties: { leadId: { type: "string" } },
      required: ["leadId"],
    },
  },
  {
    name: "create_followup",
    description: "Schedule a future follow-up message for a lead on a given channel and date.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        scheduledDate: { type: "string", description: "ISO 8601 datetime" },
        channel: { type: "string", enum: ["whatsapp", "email", "sms"] },
        purpose: { type: "string" },
        messageDraft: { type: "string" },
      },
      required: ["leadId", "scheduledDate", "channel", "purpose"],
    },
  },
  {
    name: "cancel_followup",
    description: "Cancel a previously scheduled follow-up (e.g. lead has opted out or already converted).",
    inputSchema: {
      type: "object",
      properties: { followupId: { type: "string" } },
      required: ["followupId"],
    },
  },
  {
    name: "get_conversation_history",
    description: "Retrieve recent conversation turns for a lead across all channels.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        limit: { type: "number", description: "Max messages to return, default 20" },
      },
      required: ["leadId"],
    },
  },
  {
    name: "create_appointment",
    description: "Book a call, viewing, or meeting for a lead.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        propertyId: { type: "string" },
        type: { type: "string", enum: ["call", "viewing", "meeting"] },
        scheduledAt: { type: "string", description: "ISO 8601 datetime" },
        notes: { type: "string" },
      },
      required: ["leadId", "type", "scheduledAt"],
    },
  },
  {
    name: "notify_human",
    description:
      "Escalate to the human operator. MUST be called when: lead is highly qualified, lead requests a human, lead wants to make an offer, a legal/tax/mortgage question arises, a complaint occurs, a sensitive situation arises, or AI confidence is low.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        reason: { type: "string" },
        recommendedNextAction: { type: "string" },
      },
      required: ["leadId", "reason", "recommendedNextAction"],
    },
  },
];
