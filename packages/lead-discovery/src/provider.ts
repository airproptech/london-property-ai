export interface LeadSearchParams {
  jobTitles?: string[];
  countries?: string[];
  industries?: string[];
  companySize?: string;
  keywords?: string[];
  limit?: number;
}

export interface RawProspect {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  companyName?: string;
  companyDomain?: string;
  companyLinkedinUrl?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  country?: string;
  linkedinUrl?: string;
  // Raw provider-specific identifier, useful for dedup/debugging.
  providerRef?: string;
}

export interface EmailEnrichmentResult {
  email: string | null;
  emailStatus: "verified" | "guessed" | "not_found";
  requestId?: string;
}

export interface CreditStatus {
  remaining: number;
  limit: number;
  renewalDate: string | null;
}

/**
 * Every lead-discovery provider (Prospeo now, others later) implements
 * this. The discovery pipeline depends only on this interface — adding
 * a new provider is one new class, not a rewrite of the pipeline.
 */
export interface LeadProvider {
  readonly name: string;
  search(params: LeadSearchParams): Promise<RawProspect[]>;
  enrichEmail(prospect: RawProspect): Promise<EmailEnrichmentResult>;
  checkCredits(): Promise<CreditStatus>;
}
