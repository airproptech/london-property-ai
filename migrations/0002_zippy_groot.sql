CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"domain" text,
	"linkedin_url" text,
	"industry" text,
	"location" text,
	"company_size" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "prospeo_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_name" text NOT NULL,
	"api_key_env_var" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"remaining_credits" integer,
	"monthly_limit" integer,
	"renewal_date" text,
	"last_credit_check" timestamp with time zone,
	"total_credits_used" integer DEFAULT 0 NOT NULL,
	"total_successful_enrichments" integer DEFAULT 0 NOT NULL,
	"total_failed_enrichments" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospeo_accounts_account_name_unique" UNIQUE("account_name")
);
--> statement-breakpoint
CREATE TABLE "prospeo_prospect_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospeo_prospect_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"reasoning" text NOT NULL,
	"model" text NOT NULL,
	"qualification" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospeo_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"job_title" text,
	"company_id" uuid,
	"email" text,
	"email_status" text,
	"phone" text,
	"linkedin_url" text,
	"location" text,
	"country" text,
	"industry" text,
	"company_size" text,
	"lead_score" integer,
	"qualification" text,
	"status" text DEFAULT 'discovered' NOT NULL,
	"source_provider" text DEFAULT 'prospeo' NOT NULL,
	"source_account_id" uuid,
	"promoted_lead_id" uuid,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospeo_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospeo_account_id" uuid NOT NULL,
	"prospect_id" uuid,
	"operation" text NOT NULL,
	"credits_before" integer,
	"credits_after" integer,
	"success" boolean NOT NULL,
	"error" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospeo_prospect_events" ADD CONSTRAINT "prospeo_prospect_events_prospect_id_prospeo_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospeo_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospeo_prospect_scores" ADD CONSTRAINT "prospeo_prospect_scores_prospect_id_prospeo_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospeo_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospeo_prospects" ADD CONSTRAINT "prospeo_prospects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospeo_prospects" ADD CONSTRAINT "prospeo_prospects_source_account_id_prospeo_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."prospeo_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospeo_prospects" ADD CONSTRAINT "prospeo_prospects_promoted_lead_id_leads_id_fk" FOREIGN KEY ("promoted_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospeo_usage" ADD CONSTRAINT "prospeo_usage_prospeo_account_id_prospeo_accounts_id_fk" FOREIGN KEY ("prospeo_account_id") REFERENCES "public"."prospeo_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospeo_usage" ADD CONSTRAINT "prospeo_usage_prospect_id_prospeo_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospeo_prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospeo_prospects_email_idx" ON "prospeo_prospects" USING btree ("email");--> statement-breakpoint
CREATE INDEX "prospeo_prospects_linkedin_idx" ON "prospeo_prospects" USING btree ("linkedin_url");--> statement-breakpoint
CREATE INDEX "prospeo_prospects_status_idx" ON "prospeo_prospects" USING btree ("status");