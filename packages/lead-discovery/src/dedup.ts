import { eq, ilike } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import type { RawProspect } from "./provider.js";

function normalizeLinkedin(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, "");
}

/**
 * Checks whether a raw prospect (pre-enrichment, so usually no email yet)
 * already exists in prospeo_prospects. Checked BEFORE any credit is
 * spent, per the project's core cost-efficiency rule.
 *
 * At search time, LinkedIn URL is the only reliably unique identifier
 * available (email doesn't exist until after enrichment). Post-enrichment
 * email-based dedup is handled separately by checkEmailDuplicate below,
 * called before a prospect is promoted into the real leads table.
 */
export async function isDuplicateProspect(prospect: RawProspect): Promise<boolean> {
  if (!prospect.linkedinUrl) {
    return false; // Not enough identifying info at search time — treated as new.
  }

  const db = getDb();
  const normalized = normalizeLinkedin(prospect.linkedinUrl);

  const [existing] = await db
    .select({ id: schema.prospeoProspects.id })
    .from(schema.prospeoProspects)
    .where(ilike(schema.prospeoProspects.linkedinUrl, normalized))
    .limit(1);

  return !!existing;
}

/**
 * Checks an enriched email against both the prospecting pipeline and the
 * real leads table — called just before promoting a prospect to a lead,
 * so we never create a duplicate real lead even if the prospect itself
 * was new.
 */
export async function isDuplicateEmail(email: string): Promise<boolean> {
  const db = getDb();
  const normalized = email.trim().toLowerCase();

  const [existingLead] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(eq(schema.leads.email, normalized))
    .limit(1);

  if (existingLead) return true;

  const [existingProspect] = await db
    .select({ id: schema.prospeoProspects.id })
    .from(schema.prospeoProspects)
    .where(eq(schema.prospeoProspects.email, normalized))
    .limit(1);

  return !!existingProspect;
}
