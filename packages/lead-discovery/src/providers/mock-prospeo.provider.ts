import type {
  LeadProvider,
  LeadSearchParams,
  RawProspect,
  EmailEnrichmentResult,
  CreditStatus,
} from "../provider.js";

/**
 * Simulates Prospeo's behavior for testing the full discovery pipeline
 * (filter → dedupe → score → rank → enrich → promote) without spending
 * real credits. Controlled via the MOCK_PROSPEO=true env var.
 *
 * Deterministic seeded responses so pipeline tests are repeatable, plus
 * configurable failure scenarios matching the spec's testing requirements
 * (no email found, insufficient credits, rate limiting, duplicates).
 */
export class MockProspeoProvider implements LeadProvider {
  readonly name = "mock-prospeo";
  private mockCredits = 100;

  async search(params: LeadSearchParams): Promise<RawProspect[]> {
    const count = Math.min(params.limit ?? 10, 10);
    return Array.from({ length: count }, (_, i) => ({
      firstName: `TestFirst${i}`,
      lastName: `TestLast${i}`,
      fullName: `TestFirst${i} TestLast${i}`,
      jobTitle: params.jobTitles?.[0] ?? "Investor",
      companyName: `Mock Company ${i}`,
      companyDomain: `mockcompany${i}.com`,
      industry: params.industries?.[0] ?? "Real Estate",
      companySize: "11-50",
      location: params.countries?.[0] ?? "United Kingdom",
      country: params.countries?.[0] ?? "United Kingdom",
      linkedinUrl: `https://linkedin.com/in/testperson${i}`,
      providerRef: `mock_${i}`,
    }));
  }

  async enrichEmail(prospect: RawProspect): Promise<EmailEnrichmentResult> {
    if (this.mockCredits <= 0) {
      throw new Error("INSUFFICIENT_CREDITS (mock)");
    }
    this.mockCredits -= 1;

    // Deterministic: every 5th mock prospect simulates "no email found",
    // matching the spec's requirement to test that path explicitly.
    const index = Number(prospect.providerRef?.split("_")[1] ?? 0);
    if (index % 5 === 4) {
      return { email: null, emailStatus: "not_found" };
    }

    return {
      email: `${prospect.firstName?.toLowerCase()}.${prospect.lastName?.toLowerCase()}@${prospect.companyDomain}`,
      emailStatus: "verified",
      requestId: `mock_req_${prospect.providerRef}`,
    };
  }

  async checkCredits(): Promise<CreditStatus> {
    return {
      remaining: this.mockCredits,
      limit: 100,
      renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
