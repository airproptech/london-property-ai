# Email Marketing + Baileys WhatsApp — Architecture Update

**Status:** Planning — supersedes the original Meta Cloud API WhatsApp design.
**Decision on record:** Baileys chosen knowingly, accepting ToS/ban risk, for zero-cost WhatsApp messaging.

---

## 1. What's changing from the original Phase 1 design

| Component | Before | Now |
|---|---|---|
| WhatsApp integration | Meta Cloud API (official, paid at scale) | Baileys (unofficial, free, ban risk) |
| Email | Not built | Full marketing engine: campaigns, sequences, tracking |
| Primary sales channel | WhatsApp only | Email = acquisition/nurture. WhatsApp = AI sales conversation, entered only by explicit opt-in |
| Lead scoring | Manual/conversation signals only | Adds email engagement signals (opens, clicks) combined with WhatsApp + property signals |

The core CRM, property database, matching engine, and lead-scoring *engine* (the scoring math itself) don't change — this update adds an email layer in front of them and swaps the WhatsApp transport underneath.

---

## 2. Updated funnel architecture

```
LEAD SOURCES (forms, ads, referrals, CSV import)
        │
        ▼
   LEAD CAPTURE / CRM
        │
        ▼
  EMAIL MARKETING ENGINE ──────────────┐
        │                              │
        ▼                              │
  EMAIL ENGAGEMENT                     │
   (opens, clicks)                     │
        │                              │
        ▼                              │
   LEAD SCORING  ◄───────────────────┤ (combines email + WhatsApp + property signals)
        │
        ▼
  Score/engagement crosses threshold?
        │
        ├── No  → stays in EMAIL NURTURE sequence
        │
        └── Yes → Email sends explicit WhatsApp invitation
                        │
                        ▼
                 Lead clicks + opts in
                        │
                        ▼
              WHATSAPP OPT-IN RECORDED (consent + timestamp)
                        │
                        ▼
                BAILEYS WHATSAPP SERVICE
                        │
                        ▼
                    AI SALES AGENT
                        │
                        ▼
              QUALIFICATION + PROPERTY MATCHING
                        │
                        ▼
              AUTOMATED WHATSAPP FOLLOW-UP
                        │
                        ▼
                    🔥 HOT LEAD
                        │
                        ▼
                 HUMAN HANDOFF (you)
```

**Hard rule, enforced in code, not just policy:** no WhatsApp message is ever sent to a lead without a recorded `whatsapp_opt_in` consent record with a timestamp. Email engagement alone (opens/clicks) never triggers a WhatsApp send — it only triggers score changes and, once a threshold is crossed, an *email* inviting the lead to opt in.

---

## 3. Database schema additions

These extend the existing schema (`packages/database/src/schema.ts`) — nothing below removes existing tables.

```sql
-- ========== EMAIL CONTACTS & LISTS ==========
-- A lead can exist without an email contact record (e.g. WhatsApp-only
-- inbound lead); email_contacts is specifically for marketing-consent-bearing
-- addresses, kept separate from the core `leads` table's `email` field so
-- unsubscribe/suppression state doesn't get conflated with core CRM data.

CREATE TABLE email_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID REFERENCES leads(id) ON DELETE CASCADE,
  email             TEXT NOT NULL UNIQUE,
  subscribed        BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at   TIMESTAMPTZ,
  suppressed        BOOLEAN NOT NULL DEFAULT false,   -- hard bounce / complaint / manual suppression
  suppressed_reason TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_list_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_list_id     UUID NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  email_contact_id  UUID NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email_list_id, email_contact_id)
);

-- ========== CAMPAIGNS & SEQUENCES ==========
CREATE TABLE email_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email_list_id UUID REFERENCES email_lists(id),
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','paused','completed')),
  trigger_type  TEXT NOT NULL DEFAULT 'manual'
                  CHECK (trigger_type IN ('manual','new_lead','tag_added','score_threshold')),
  trigger_config JSONB,          -- e.g. {"scoreThreshold": 40}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_sequence_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,
  delay_hours     INT NOT NULL DEFAULT 0,   -- delay since previous step (or enrollment)
  subject         TEXT NOT NULL,
  body_template   TEXT NOT NULL,             -- supports {{firstName}}, {{propertyLink}}, etc.
  stop_condition  JSONB,                     -- e.g. {"ifWhatsAppOptedIn": true}
  UNIQUE(campaign_id, step_order)
);

CREATE TABLE email_enrollments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_contact_id    UUID NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  campaign_id         UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  current_step        INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','stopped','unsubscribed')),
  enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_send_at        TIMESTAMPTZ,
  UNIQUE(email_contact_id, campaign_id)
);

-- ========== EMAIL EVENTS (tracking) ==========
CREATE TABLE email_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_contact_id  UUID NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  campaign_id       UUID REFERENCES email_campaigns(id),
  sequence_step_id  UUID REFERENCES email_sequence_steps(id),
  event_type        TEXT NOT NULL
                      CHECK (event_type IN ('sent','delivered','opened','clicked','bounced','complained','unsubscribed')),
  metadata          JSONB,          -- e.g. {"clickedUrl": "..."}
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== WHATSAPP OPT-IN / CONSENT ==========
CREATE TABLE whatsapp_optins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number  TEXT NOT NULL,
  opted_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  opted_out_at  TIMESTAMPTZ,
  source        TEXT NOT NULL   -- 'email_invitation_click' | 'manual' | 'inbound_message'
);

-- ========== BAILEYS SESSION STATE ==========
-- Baileys requires persisting auth/session credentials so the WhatsApp
-- Web-style link survives restarts without re-scanning the QR code.
CREATE TABLE whatsapp_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name  TEXT NOT NULL UNIQUE,     -- e.g. 'primary'
  auth_state    JSONB NOT NULL,           -- Baileys' serialized creds/keys
  connected     BOOLEAN NOT NULL DEFAULT false,
  last_connected_at TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Lead scoring additions** (extends `packages/lead-scoring/src/config.ts` weights, no schema change needed — reuses existing `lead_score_events`):

| Signal | Points |
|---|---|
| Email opened | +1 |
| Property link clicked | +5 |
| Multiple property clicks (3+) | +10 |
| Lead form submitted | +20 |
| WhatsApp opt-in | +20 |
| Viewing requested | +25 |

---

## 4. Email provider abstraction

Same adapter pattern already used for `packages/communications` — extend it rather than replace it.

```
EmailProvider (interface)
    │
    ├── BrevoProvider     (free tier: 300 emails/day — best free option)
    ├── ResendProvider    (free tier: 3,000/month, already scaffolded)
    ├── MailgunProvider   (free tier: limited, pay-as-you-go after)
    └── SendGridProvider  (free tier: 100/day)
```

Interface surface (in `packages/communications/src/email-provider.ts`):
```typescript
interface EmailProvider {
  send(input: { to: string; subject: string; html: string; trackingId: string }): Promise<{ providerMessageId: string }>;
  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string,string>): boolean;
  parseWebhookEvent(payload: unknown): EmailEvent[]; // normalizes provider-specific webhook shapes into our email_events rows
}
```

**Recommendation for which to build first:** Brevo — highest free-tier volume (300/day = ~9,000/month) of the options listed, which matters since you're running this cost-conscious. Resend is already scaffolded from Phase 2, so it's the fastest to finish second.

---

## 5. Baileys WhatsApp adapter design

Baileys runs as a **long-lived Node process holding a live WebSocket connection to WhatsApp** — this is architecturally different from Meta's Cloud API (which is just an HTTP request/webhook pair). It needs to live in the **worker** service, not the API, since it must stay connected continuously.

```
apps/worker/src/whatsapp/
  baileys-client.ts      -- manages connection lifecycle, QR display, reconnection
  message-handler.ts     -- routes inbound messages to the AI agent
  session-store.ts       -- persists auth_state to whatsapp_sessions table (via packages/database)
```

**Key design points:**
- **QR linking:** on first run, Baileys generates a QR code you scan with the WhatsApp app on the phone number you're dedicating to this business (per your original isolation requirement — separate number from the hostel project). The code will print the QR to the worker's logs; you scan it once, and the session persists in `whatsapp_sessions` afterward.
- **Reconnection handling:** Baileys' socket drops periodically (network blips, WhatsApp-side restarts) — the adapter needs auto-reconnect logic with backoff, and should alert you (via the existing `notify_human` mechanism) if it can't reconnect after several attempts, since that means the number may need re-linking or may have been flagged.
- **Rate limiting self-imposed:** since there's no official rate limit to respect, we enforce our own conservative sending pace (e.g. no more than X messages per minute) to reduce ban risk — sending too fast, too much like a bot, is the most common cause of WhatsApp flagging a number.
- **Same `CommunicationAdapter` interface** as before — the AI agent and follow-up worker still just call `communicationService.send('whatsapp', {...})`; only the adapter's internals change from an HTTP call to Meta to a Baileys socket send.

---

## 6. Email → WhatsApp consent transition logic

Enforced as an explicit gate in the email sequence engine, not left to the AI's judgment:

1. Lead's score crosses a configurable threshold (e.g. 40+) **or** a specific "invite to WhatsApp" sequence step is reached
2. Email sent containing an explicit, unambiguous opt-in link/button (not just "reply to continue" — a clear, logged action)
3. Click is tracked as an `email_events` row with `event_type = 'clicked'` and `metadata.clickedUrl` pointing to the opt-in landing action
4. Landing page or click-through handler creates a `whatsapp_optins` row with `source = 'email_invitation_click'`
5. **Only after that row exists** does the lead become eligible for any outbound WhatsApp send — checked at the top of the follow-up processor and the AI agent's `create_followup` tool, both of which already have compliance-gate logic from Phase 2 that this extends naturally.

---

## 7. Phase plan for this update

Given the scope, I'd suggest building this as its own set of phases, layered onto the existing numbered phases:

**Phase 10 — Email foundation:** schema migration for the tables above, `EmailProvider` interface + Brevo implementation, basic campaign/sequence CRUD in the API.

**Phase 11 — Email automation engine:** the worker-side sequence processor (enrolls contacts, sends steps on schedule, respects stop conditions), email event webhook ingestion, updated lead-scoring signals.

**Phase 12 — Baileys WhatsApp:** the adapter itself, QR linking flow, session persistence, swapping the existing `WhatsAppAdapter` stub for a real Baileys-backed implementation.

**Phase 13 — Consent transition + unified dashboard:** the opt-in gate logic, and CRM views showing the full email→WhatsApp journey per lead (per your example in section 11 of the spec).

This lets us build and test each piece independently rather than one enormous change — same incremental approach that worked well for Phase 2.

---

## 8. Cost impact

| Item | Cost |
|---|---|
| Brevo (primary email provider) | Free up to 300 emails/day |
| Baileys | Free (no per-message cost — this is the entire point of choosing it) |
| Everything else from Phase 1 cost estimate | Unchanged |

Net effect: this update adds functionality without adding cost, at the price of the WhatsApp ban risk already discussed.

---

## Open questions before Phase 10 starts

1. Which email provider do you want built first — Brevo (highest free volume) or finish Resend (already partially scaffolded)?
2. Do you have the dedicated WhatsApp phone number ready to link via Baileys, or does that still need sorting?
3. What score threshold feels right for triggering the WhatsApp invitation email — the spec doesn't specify a number, I used 40 as a placeholder above.
