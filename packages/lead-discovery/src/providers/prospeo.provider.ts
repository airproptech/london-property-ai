import type {
  LeadProvider,
  LeadSearchParams,
  RawProspect,
  EmailEnrichmentResult,
  CreditStatus,
} from "../provider.js";

interface ProspeoSearchResponse {
  error: boolean;
  error_code?: string;
  filter_error?: string;
  free?: boolean;
  results?: any[];
}

interface ProspeoEnrichResponse {
  error: boolean;
  error_code?: string;
  person?: {
    person_id?: string;
    email?: { revealed: boolean; email: string; status: string };
  };
}

interface ProspeoAccountResponse {
  error: boolean;
  error_code?: string;
  response?: {
    remaining_credits: number;
    used_credits: number;
    next_quota_renewal_date: string | null;
  };
}

/**
 * Real Prospeo integration, built against their current API (post the
 * March 2026 endpoint revamp — the old /email-finder, /social-url-enrichement
 * etc. endpoints are gone; this uses /search-person, /enrich-person, and
 * /account-information, verified directly against Prospeo's live docs).
 *
 * Search Person does NOT return email/mobile — those require a separate
 * Enrich Person call per result, which is exactly the credit-conscious
 * design this project wants: search costs 1 credit per page of up to 25
 * results, enrichment is a separate credit spent only on prospects that
 * make it through AI qualification.
 */
export class ProspeoProvider implements LeadProvider {
  readonly name = "prospeo";
  private readonly apiBase = "https://api.prospeo.io";

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("Prospeo API key is not configured for this account.");
    }
  }

  async search(params: LeadSearchParams): Promise<RawProspect[]> {
    const filters: Record<string, unknown> = {};

    if (params.jobTitles?.length) {
      filters.person_job_title = { include: params.jobTitles, match_mode: "CONTAINS" };
    }
    if (params.countries?.length) {
      // Prospeo requires exact location strings from their own dashboard/
      // Search Suggestions API — arbitrary strings like "UK" are rejected.
      // Callers should pass values already validated against Search
      // Suggestions (see docs/prospeo-architecture.md).
      filters.person_location_search = { include: params.countries };
    }
    if (params.industries?.length) {
      filters.company_industry = { include: params.industries };
    }

    const response = await fetch(`${this.apiBase}/search-person`, {
      method: "POST",
      headers: {
        "X-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page: 1, filters }),
    });

    const data = (await response.json()) as ProspeoSearchResponse;

    if (data.error) {
      if (data.error_code === "NO_RESULTS") return [];
      throw new Error(`Prospeo search failed: ${data.error_code}${data.filter_error ? ` — ${data.filter_error}` : ""}`);
    }

    return (data.results ?? []).map((r) => mapSearchResultToRawProspect(r));
  }

  async enrichEmail(prospect: RawProspect): Promise<EmailEnrichmentResult> {
    if (!prospect.companyDomain && !prospect.companyName) {
      return { email: null, emailStatus: "not_found" };
    }

    const response = await fetch(`${this.apiBase}/enrich-person`, {
      method: "POST",
      headers: {
        "X-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        only_verified_email: true,
        enrich_mobile: false,
        data: {
          first_name: prospect.firstName,
          last_name: prospect.lastName,
          company_website: prospect.companyDomain ?? prospect.companyName,
        },
      }),
    });

    const data = (await response.json()) as ProspeoEnrichResponse;

    if (data.error) {
      // NO_MATCH and similar are expected outcomes, not exceptions —
      // the caller records this as 'no_email' and moves on, per the
      // spec's "do not endlessly retry" requirement.
      return { email: null, emailStatus: "not_found" };
    }

    const email = data.person?.email;
    if (!email?.revealed || !email?.email) {
      return { email: null, emailStatus: "not_found" };
    }

    return {
      email: email.email,
      emailStatus: email.status === "VERIFIED" ? "verified" : "guessed",
      requestId: data.person?.person_id,
    };
  }

  async checkCredits(): Promise<CreditStatus> {
    const response = await fetch(`${this.apiBase}/account-information`, {
      method: "GET",
      headers: { "X-KEY": this.apiKey },
    });

    const data = (await response.json()) as ProspeoAccountResponse;

    if (data.error || !data.response) {
      throw new Error(`Prospeo account-information failed: ${data.error_code}`);
    }

    return {
      remaining: data.response.remaining_credits,
      limit: data.response.remaining_credits + data.response.used_credits,
      renewalDate: data.response.next_quota_renewal_date ?? null,
    };
  }
}

function mapSearchResultToRawProspect(result: any): RawProspect {
  const person = result.person ?? {};
  const company = result.company ?? {};

  return {
    firstName: person.first_name,
    lastName: person.last_name,
    fullName: person.full_name,
    jobTitle: person.current_job_title,
    companyName: company.name,
    companyDomain: company.domain,
    companyLinkedinUrl: company.linkedin_url,
    industry: company.industry,
    companySize: company.employee_range,
    location: person.location
      ? [person.location.city, person.location.state, person.location.country].filter(Boolean).join(", ")
      : undefined,
    country: person.location?.country,
    linkedinUrl: person.linkedin_url,
    providerRef: person.person_id,
  };
}
