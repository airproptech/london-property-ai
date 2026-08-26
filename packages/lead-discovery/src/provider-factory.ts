import type { LeadProvider } from "./provider.js";
import { ProspeoProvider } from "./providers/prospeo.provider.js";
import { MockProspeoProvider } from "./providers/mock-prospeo.provider.js";

/**
 * Creates a LeadProvider instance for a specific Prospeo account's API key.
 * MOCK_PROSPEO=true bypasses real Prospeo entirely — safe for testing the
 * full pipeline without spending credits.
 */
export function createLeadProvider(apiKey: string): LeadProvider {
  if (process.env.MOCK_PROSPEO === "true") {
    return new MockProspeoProvider();
  }
  return new ProspeoProvider(apiKey);
}
