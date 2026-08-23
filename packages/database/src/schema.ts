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
