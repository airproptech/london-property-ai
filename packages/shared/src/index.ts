import { z } from "zod";

// ---------- Enums (kept as literal unions + zod, matching DB CHECK constraints) ----------

export const LeadStatus = z.enum([
  "new",
  "contacted",
  "qualifying",
  "qualified",
  "nurture",
  "appointment_booked",
  "converted",
  "lost",
  "opted_out",
]);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const LeadTemperature = z.enum(["cold", "nurture", "warm", "hot"]);
export type LeadTemperature = z.infer<typeof LeadTemperature>;

export const ContactMethod = z.enum(["email", "whatsapp", "sms", "phone"]);
export type ContactMethod = z.infer<typeof ContactMethod>;

export const Channel = z.enum(["whatsapp", "email", "sms", "web_chat"]);
export type Channel = z.infer<typeof Channel>;

// ---------- Input validation for creating a lead (e.g. from a webhook or form) ----------

export const CreateLeadInput = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  country: z.string().optional(),
  preferredContactMethod: ContactMethod.optional(),
  source: z.string().min(1),
  campaign: z.string().optional(),
  landingPage: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  referralInfo: z.string().optional(),
  marketingOptIn: z.boolean().default(false),
});
export type CreateLeadInput = z.infer<typeof CreateLeadInput>;

// ---------- Lead preferences input — every field optional & nullable by design ----------
// The AI qualification engine must be able to write "unknown" rather than guess,
// so nothing here is required.

export const LeadPreferencesInput = z.object({
  budgetMin: z.number().nonnegative().nullable().optional(),
  budgetMax: z.number().nonnegative().nullable().optional(),
  preferredLocations: z.array(z.string()).nullable().optional(),
  propertyTypes: z.array(z.string()).nullable().optional(),
  bedroomsMin: z.number().int().nonnegative().nullable().optional(),
  bedroomsMax: z.number().int().nonnegative().nullable().optional(),
  investmentOrResidential: z.enum(["investment", "residential", "unknown"]).nullable().optional(),
  cashOrMortgage: z.enum(["cash", "mortgage", "unknown"]).nullable().optional(),
  depositAvailable: z.number().nonnegative().nullable().optional(),
  desiredRoiPercent: z.number().nullable().optional(),
  desiredCompletion: z.string().nullable().optional(),
  minimumLeaseLength: z.number().int().nonnegative().nullable().optional(),
  acceptableServiceCharge: z.number().nonnegative().nullable().optional(),
  acceptableGroundRent: z.number().nonnegative().nullable().optional(),
  otherRequirements: z.record(z.unknown()).nullable().optional(),
});
export type LeadPreferencesInput = z.infer<typeof LeadPreferencesInput>;

// ---------- Property match reasoning (structured, for explainability) ----------

export const MatchCriterion = z.object({
  criterion: z.string(),
  matched: z.boolean(),
  weight: z.number(),
  detail: z.string().optional(),
});
export type MatchCriterion = z.infer<typeof MatchCriterion>;

export const MatchExplanation = z.object({
  criteria: z.array(MatchCriterion),
  dataProvenance: z.object({
    actualDataFields: z.array(z.string()),
    calculatedEstimateFields: z.array(z.string()),
    aiGeneratedCommentary: z.string().optional(),
  }),
});
export type MatchExplanation = z.infer<typeof MatchExplanation>;

// ---------- Lead score event (explainability log entry) ----------

export const ScoreEvent = z.object({
  delta: z.number().int(),
  reason: z.string().min(1),
});
export type ScoreEvent = z.infer<typeof ScoreEvent>;
