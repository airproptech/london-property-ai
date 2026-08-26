import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------- LEADS ----------
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    whatsappNumber: text("whatsapp_number"),
    country: text("country"),
    preferredContactMethod: text("preferred_contact_method"), // 'email' | 'whatsapp' | 'sms' | 'phone'
    source: text("source").notNull(),
    campaign: text("campaign"),
    landingPage: text("landing_page"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    referralInfo: text("referral_info"),
    status: text("status").notNull().default("new"),
    // 'new' | 'contacted' | 'qualifying' | 'qualified' | 'nurture' |
    // 'appointment_booked' | 'converted' | 'lost' | 'opted_out'
    leadScore: integer("lead_score").notNull().default(0),
    temperature: text("temperature").notNull().default("cold"),
    // 'cold' | 'nurture' | 'warm' | 'hot'
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
    aiConfidence: numeric("ai_confidence", { precision: 3, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("leads_status_idx").on(table.status),
    temperatureIdx: index("leads_temperature_idx").on(table.temperature),
    nextFollowupIdx: index("leads_next_followup_idx").on(table.nextFollowupAt),
  })
);

// ---------- LEAD PREFERENCES ----------
export const leadPreferences = pgTable("lead_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  budgetMin: numeric("budget_min", { precision: 12, scale: 2 }),
  budgetMax: numeric("budget_max", { precision: 12, scale: 2 }),
  preferredLocations: text("preferred_locations").array(),
  propertyTypes: text("property_types").array(),
  bedroomsMin: integer("bedrooms_min"),
  bedroomsMax: integer("bedrooms_max"),
  investmentOrResidential: text("investment_or_residential"), // 'investment' | 'residential' | 'unknown'
  cashOrMortgage: text("cash_or_mortgage"), // 'cash' | 'mortgage' | 'unknown'
  depositAvailable: numeric("deposit_available", { precision: 12, scale: 2 }),
  desiredRoiPercent: numeric("desired_roi_percent", { precision: 5, scale: 2 }),
  desiredCompletion: text("desired_completion"),
  minimumLeaseLength: integer("minimum_lease_length"),
  acceptableServiceCharge: numeric("acceptable_service_charge", { precision: 10, scale: 2 }),
  acceptableGroundRent: numeric("acceptable_ground_rent", { precision: 10, scale: 2 }),
  otherRequirements: jsonb("other_requirements"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- PROPERTIES ----------
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull(),
  postcode: text("postcode"),
  londonArea: text("london_area"),
  propertyType: text("property_type"),
  price: numeric("price", { precision: 12, scale: 2 }),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  leaseLengthYears: integer("lease_length_years"),
  serviceCharge: numeric("service_charge", { precision: 10, scale: 2 }),
  groundRent: numeric("ground_rent", { precision: 10, scale: 2 }),
  annualRentalIncome: numeric("annual_rental_income", { precision: 12, scale: 2 }),
  // Calculated, not authoritative — always flagged as an estimate downstream.
  estimatedYieldPercent: numeric("estimated_yield_percent", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("available"),
  // 'available' | 'under_offer' | 'sold' | 'withdrawn'
  source: text("source").notNull(), // 'csv_import' | 'manual' | 'api:<provider>'
  sourceUrl: text("source_url"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  areaPriceIdx: index("properties_area_price_idx").on(table.londonArea, table.price),
}));

export const propertyImages = pgTable("property_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  r2ObjectKey: text("r2_object_key").notNull(),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- LEAD-PROPERTY MATCHES ----------
export const leadPropertyMatches = pgTable(
  "lead_property_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    matchScore: integer("match_score").notNull(),
    reasonsForMatch: jsonb("reasons_for_match").notNull(),
    dateMatched: timestamp("date_matched", { withTimezone: true }).notNull().defaultNow(),
    presentedToLead: boolean("presented_to_lead").notNull().default(false),
    presentedAt: timestamp("presented_at", { withTimezone: true }),
    leadResponse: text("lead_response"),
    // 'interested' | 'not_interested' | 'no_response' | 'requested_more_info'
    interestLevel: text("interest_level"), // 'low' | 'medium' | 'high'
  },
  (table) => ({
    leadPropertyUnique: uniqueIndex("lead_property_unique_idx").on(table.leadId, table.propertyId),
    leadIdx: index("matches_lead_idx").on(table.leadId),
  })
);

// ---------- CONVERSATIONS ----------
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // 'whatsapp' | 'email' | 'sms' | 'web_chat'
    direction: text("direction").notNull(), // 'inbound' | 'outbound'
    sender: text("sender").notNull(), // 'lead' | 'ai' | 'human'
    messageText: text("message_text"),
    messageMeta: jsonb("message_meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadCreatedIdx: index("conversations_lead_created_idx").on(table.leadId, table.createdAt),
  })
);

// ---------- FOLLOW-UPS ----------
export const followups = pgTable("followups", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
  channel: text("channel").notNull(), // 'whatsapp' | 'email' | 'sms'
  purpose: text("purpose").notNull(),
  // 'initial_qualification' | 'send_property' | 'check_in' | 'nurture'
  messageDraft: text("message_draft"),
  status: text("status").notNull().default("pending"),
  // 'pending' | 'sent' | 'skipped' | 'cancelled' | 'failed'
  response: text("response"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- ACTIVITIES (timeline) ----------
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  activityType: text("activity_type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- APPOINTMENTS ----------
export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").references(() => properties.id),
  type: text("type").notNull(), // 'call' | 'viewing' | 'meeting'
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  // 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- SCORING LOG (explainability) ----------
export const leadScoreEvents = pgTable("lead_score_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  resultingScore: integer("resulting_score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- CONSENT / COMPLIANCE ----------
export const consentRecords = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  consentType: text("consent_type").notNull(),
  // 'marketing_opt_in' | 'marketing_opt_out' | 'data_deletion_request' | 'data_export_request'
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

// ---------- USERS (admin/dashboard auth) ----------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- AUDIT LOG ----------
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(), // user id, 'ai_agent', or 'system'
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ========== EMAIL MARKETING (Phase 10) ==========

// Separate from leads.email so unsubscribe/suppression state doesn't get
// conflated with core CRM data. A lead can exist without an email_contact
// row (e.g. a WhatsApp-only inbound lead).
export const emailContacts = pgTable("email_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  subscribed: boolean("subscribed").notNull().default(true),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  suppressed: boolean("suppressed").notNull().default(false), // hard bounce / complaint / manual
  suppressedReason: text("suppressed_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailLists = pgTable("email_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailListMembers = pgTable(
  "email_list_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailListId: uuid("email_list_id")
      .notNull()
      .references(() => emailLists.id, { onDelete: "cascade" }),
    emailContactId: uuid("email_contact_id")
      .notNull()
      .references(() => emailContacts.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listContactUnique: uniqueIndex("email_list_members_unique_idx").on(
      table.emailListId,
      table.emailContactId
    ),
  })
);

export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  emailListId: uuid("email_list_id").references(() => emailLists.id),
  status: text("status").notNull().default("draft"), // draft | active | paused | completed
  triggerType: text("trigger_type").notNull().default("manual"),
  // 'manual' | 'new_lead' | 'tag_added' | 'score_threshold'
  triggerConfig: jsonb("trigger_config"), // e.g. { scoreThreshold: 40 }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailSequenceSteps = pgTable(
  "email_sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    delayHours: integer("delay_hours").notNull().default(0), // since previous step or enrollment
    subject: text("subject").notNull(),
    bodyTemplate: text("body_template").notNull(), // supports {{firstName}}, {{propertyLink}}, etc.
    stopCondition: jsonb("stop_condition"), // e.g. { ifWhatsAppOptedIn: true }
  },
  (table) => ({
    campaignStepUnique: uniqueIndex("email_sequence_steps_unique_idx").on(
      table.campaignId,
      table.stepOrder
    ),
  })
);

export const emailEnrollments = pgTable(
  "email_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailContactId: uuid("email_contact_id")
      .notNull()
      .references(() => emailContacts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").notNull().default(0),
    status: text("status").notNull().default("active"),
    // 'active' | 'completed' | 'stopped' | 'unsubscribed'
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  },
  (table) => ({
    contactCampaignUnique: uniqueIndex("email_enrollments_unique_idx").on(
      table.emailContactId,
      table.campaignId
    ),
  })
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailContactId: uuid("email_contact_id")
      .notNull()
      .references(() => emailContacts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => emailCampaigns.id),
    sequenceStepId: uuid("sequence_step_id").references(() => emailSequenceSteps.id),
    eventType: text("event_type").notNull(),
    // 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed'
    metadata: jsonb("metadata"), // e.g. { clickedUrl: "..." }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contactCreatedIdx: index("email_events_contact_created_idx").on(
      table.emailContactId,
      table.createdAt
    ),
  })
);

// ========== WHATSAPP OPT-IN / CONSENT (Phase 10) ==========
// Hard rule enforced in code: no WhatsApp message is ever sent to a lead
// without a row here. Email engagement alone never creates this row —
// only an explicit, logged opt-in action does.
export const whatsappOptins = pgTable("whatsapp_optins", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull(),
  optedInAt: timestamp("opted_in_at", { withTimezone: true }).notNull().defaultNow(),
  optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
  source: text("source").notNull(), // 'email_invitation_click' | 'manual' | 'inbound_message'
});

// ========== BAILEYS SESSION STATE (Phase 12) ==========
// Baileys requires persisting auth/session credentials so the WhatsApp
// Web-style link survives worker restarts without re-scanning the QR code.
export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionName: text("session_name").notNull().unique(), // e.g. 'primary'
  authState: jsonb("auth_state").notNull(), // Baileys' serialized creds/keys
  connected: boolean("connected").notNull().default(false),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ========== PROSPEO LEAD DISCOVERY (Phase 14) ==========

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull(),
  domain: text("domain").unique(),
  linkedinUrl: text("linkedin_url"),
  industry: text("industry"),
  location: text("location"),
  companySize: text("company_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// API keys are NEVER stored here — only a reference to the env var name
// holding the real key, e.g. 'PROSPEO_API_KEY_ACCOUNT_A'. Adding a new
// account is one env var + one row here, no code changes.
export const prospeoAccounts = pgTable("prospeo_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountName: text("account_name").notNull().unique(),
  apiKeyEnvVar: text("api_key_env_var").notNull(),
  active: boolean("active").notNull().default(true),
  remainingCredits: integer("remaining_credits"),
  monthlyLimit: integer("monthly_limit"),
  renewalDate: text("renewal_date"), // stored as ISO date string; kept simple, not a date-only column type
  lastCreditCheck: timestamp("last_credit_check", { withTimezone: true }),
  totalCreditsUsed: integer("total_credits_used").notNull().default(0),
  totalSuccessfulEnrichments: integer("total_successful_enrichments").notNull().default(0),
  totalFailedEnrichments: integer("total_failed_enrichments").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prospeoProspects = pgTable(
  "prospeo_prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name"),
    jobTitle: text("job_title"),
    companyId: uuid("company_id").references(() => companies.id),
    email: text("email"),
    emailStatus: text("email_status"), // 'verified' | 'guessed' | 'not_found' | 'unknown'
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    location: text("location"),
    country: text("country"),
    industry: text("industry"),
    companySize: text("company_size"),
    leadScore: integer("lead_score"),
    qualification: text("qualification"), // 'poor' | 'weak' | 'good' | 'high_priority'
    status: text("status").notNull().default("discovered"),
    // 'discovered' | 'qualifying' | 'qualified' | 'rejected' | 'duplicate' |
    // 'ready_for_enrichment' | 'enriching' | 'enriched' | 'no_email' |
    // 'enrichment_failed' | 'credit_unavailable' | 'saved' | 'ready_for_outreach'
    sourceProvider: text("source_provider").notNull().default("prospeo"),
    sourceAccountId: uuid("source_account_id").references(() => prospeoAccounts.id),
    promotedLeadId: uuid("promoted_lead_id").references(() => leads.id),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("prospeo_prospects_email_idx").on(table.email),
    linkedinIdx: index("prospeo_prospects_linkedin_idx").on(table.linkedinUrl),
    statusIdx: index("prospeo_prospects_status_idx").on(table.status),
  })
);

export const prospeoUsage = pgTable("prospeo_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  prospeoAccountId: uuid("prospeo_account_id")
    .notNull()
    .references(() => prospeoAccounts.id),
  prospectId: uuid("prospect_id").references(() => prospeoProspects.id),
  operation: text("operation").notNull(), // 'search' | 'email_enrichment' | 'credit_check'
  creditsBefore: integer("credits_before"),
  creditsAfter: integer("credits_after"),
  success: boolean("success").notNull(),
  error: text("error"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prospeoProspectEvents = pgTable("prospeo_prospect_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  prospectId: uuid("prospect_id")
    .notNull()
    .references(() => prospeoProspects.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prospeoProspectScores = pgTable("prospeo_prospect_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  prospectId: uuid("prospect_id")
    .notNull()
    .references(() => prospeoProspects.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  reasoning: text("reasoning").notNull(),
  model: text("model").notNull(),
  qualification: text("qualification").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


