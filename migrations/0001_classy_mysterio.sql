CREATE TABLE "email_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email_list_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"trigger_type" text DEFAULT 'manual' NOT NULL,
	"trigger_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"email" text NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"suppressed" boolean DEFAULT false NOT NULL,
	"suppressed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_contacts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_contact_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_send_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_contact_id" uuid NOT NULL,
	"campaign_id" uuid,
	"sequence_step_id" uuid,
	"event_type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_list_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_list_id" uuid NOT NULL,
	"email_contact_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"subject" text NOT NULL,
	"body_template" text NOT NULL,
	"stop_condition" jsonb
);
--> statement-breakpoint
CREATE TABLE "whatsapp_optins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"opted_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opted_out_at" timestamp with time zone,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_name" text NOT NULL,
	"auth_state" jsonb NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"last_connected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_sessions_session_name_unique" UNIQUE("session_name")
);
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_email_list_id_email_lists_id_fk" FOREIGN KEY ("email_list_id") REFERENCES "public"."email_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_contacts" ADD CONSTRAINT "email_contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_enrollments" ADD CONSTRAINT "email_enrollments_email_contact_id_email_contacts_id_fk" FOREIGN KEY ("email_contact_id") REFERENCES "public"."email_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_enrollments" ADD CONSTRAINT "email_enrollments_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_contact_id_email_contacts_id_fk" FOREIGN KEY ("email_contact_id") REFERENCES "public"."email_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_sequence_step_id_email_sequence_steps_id_fk" FOREIGN KEY ("sequence_step_id") REFERENCES "public"."email_sequence_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_email_list_id_email_lists_id_fk" FOREIGN KEY ("email_list_id") REFERENCES "public"."email_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_email_contact_id_email_contacts_id_fk" FOREIGN KEY ("email_contact_id") REFERENCES "public"."email_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequence_steps" ADD CONSTRAINT "email_sequence_steps_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_optins" ADD CONSTRAINT "whatsapp_optins_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_enrollments_unique_idx" ON "email_enrollments" USING btree ("email_contact_id","campaign_id");--> statement-breakpoint
CREATE INDEX "email_events_contact_created_idx" ON "email_events" USING btree ("email_contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_list_members_unique_idx" ON "email_list_members" USING btree ("email_list_id","email_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_sequence_steps_unique_idx" ON "email_sequence_steps" USING btree ("campaign_id","step_order");