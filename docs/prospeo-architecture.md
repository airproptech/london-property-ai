# Prospeo Lead Discovery — Architecture

**Status:** Planning
**Database decision:** Uses the existing self-hosted Postgres (already running, tested, populated) — no Neon migration. The spec's repeated mention of "Neon" is treated as shorthand for "one central database," which your existing setup already satisfies.
**Target market:** Same as the core platform — London property/leasehold leads.

---

## 1. Key architectural decision: prospects are not leads (yet)

Your existing `leads` table is built around **inbound buyer/investor leads** — it has `budget`, `preferredLocations`, `marketingOptIn`, property-specific fields. Prospeo produces **cold-discovered B2B prospects** — job title, company, LinkedIn URL, industry. These are structurally different things at different pipeline stages.

Rather than bolting B2B fields onto the `leads` table (which would leave most of them null for every property buyer, and vice versa), this integration adds a **separate prospecting pipeline** that only ever writes into `leads` once a prospect has been discovered, qualified, deduplicated, and enriched — at which point it becomes a real lead and everything you've already built (scoring, matching, follow-up, WhatsApp) works on it automatically, with `source = 'prospeo'` and `source_account_id` recorded for attribution.

```
PROSPEO ACCOUNTS (yours, authorized)
        │
        ▼
  LEAD DISCOVERY (per-account, rate-aware)
        │
        ▼
  FILTER (basic relevance rules before spending anything)
        │
        ▼
  DEDUPE CHECK (against prospeo_prospects AND existing leads)
        │
        ▼
  AI QUALIFICATION (score without spending a credit)
        │
        ▼
  RANK (highest score first)
        │
        ▼
  CREDIT CHECK (concurrency-safe account selection)
        │
        ▼
  EMAIL ENRICHMENT (only for top-ranked, non-duplicate prospects)
        │
        ▼
  PROMOTE TO `leads` TABLE (source='prospeo') ──► existing CRM/scoring/follow-up pipeline
```

---

## 2. Database schema additions

```sql
-- ========== COMPANIES ==========
-- Avoids re-storing the same company info across many prospects.
CREATE TABLE companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  domain       TEXT UNIQUE,
  linkedin_url TEXT,
  industry     TEXT,
  location     TEXT,
  company_size TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== PROSPEO ACCOUNTS ==========
-- API keys are NEVER stored in this table directly — only a reference
-- name. The actual key lives in an environment variable
-- (PROSPEO_API_KEY_<reference>), keeping secrets out of the database
-- entirely, consistent with how every other credential in this project
-- is handled.
CREATE TABLE prospeo_accounts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name                TEXT NOT NULL UNIQUE,
  api_key_env_var             TEXT NOT NULL,   -- e.g. 'PROSPEO_API_KEY_ACCOUNT_A'
  active                      BOOLEAN NOT NULL DEFAULT true,
  remaining_credits           INT,
  monthly_limit               INT,
  renewal_date                DATE,
  last_credit_check           TIMESTAMPTZ,
  total_credits_used          INT NOT NULL DEFAULT 0,
  total_successful_enrichments INT NOT NULL DEFAULT 0,
  total_failed_enrichments    INT NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'active',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== PROSPEO USAGE (audit trail) ==========
CREATE TABLE prospeo_usage (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospeo_account_id UUID NOT NULL REFERENCES prospeo_accounts(id),
  prospect_id        UUID REFERENCES prospeo_prospects(id),
  operation          TEXT NOT NULL,   -- 'search' | 'email_enrichment' | 'credit_check'
  credits_before      INT,
  credits_after       INT,
  success            BOOLEAN NOT NULL,
  error               TEXT,
  request_id          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== PROSPEO PROSPECTS (pre-CRM pipeline) ==========
-- This is the working table for the discovery→enrichment pipeline.
-- Only once a prospect reaches 'ready_for_outreach' does a corresponding
-- row get created in the existing `leads` table.
CREATE TABLE prospeo_prospects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          TEXT,
  last_name           TEXT,
  full_name           TEXT,
  job_title           TEXT,
  company_id          UUID REFERENCES companies(id),
  email               TEXT,
  email_status        TEXT,             -- 'verified' | 'guessed' | 'not_found' | 'unknown'
  phone               TEXT,
  linkedin_url        TEXT,
  location            TEXT,
  country             TEXT,
  industry            TEXT,
  company_size        TEXT,
  lead_score          INT,
  qualification       TEXT,             -- 'poor' | 'weak' | 'good' | 'high_priority'
  status              TEXT NOT NULL DEFAULT 'discovered',
  -- 'discovered' | 'qualifying' | 'qualified' | 'rejected' | 'duplicate' |
  -- 'ready_for_enrichment' | 'enriching' | 'enriched' | 'no_email' |
  -- 'enrichment_failed' | 'credit_unavailable' | 'saved' | 'ready_for_outreach'
  source_provider     TEXT NOT NULL DEFAULT 'prospeo',
  source_account_id   UUID REFERENCES prospeo_accounts(id),
  promoted_lead_id    UUID REFERENCES leads(id),  -- set once promoted to a real lead
  discovered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  enriched_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX prospeo_prospects_email_idx ON prospeo_prospects(email);
CREATE INDEX prospeo_prospects_linkedin_idx ON prospeo_prospects(linkedin_url);
CREATE INDEX prospeo_prospects_status_idx ON prospeo_prospects(status);

-- ========== PROSPECT EVENTS (lifecycle timeline) ==========
CREATE TABLE prospeo_prospect_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  UUID NOT NULL REFERENCES prospeo_prospects(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  -- 'discovered' | 'qualified' | 'rejected' | 'duplicate' |
  -- 'enrichment_started' | 'enrichment_completed' | 'enrichment_failed' |
  -- 'email_found' | 'email_not_found' | 'saved' | 'promoted_to_lead'
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== PROSPECT AI SCORES (explainability, same pattern as lead_score_events) ==========
CREATE TABLE prospeo_prospect_scores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  UUID NOT NULL REFERENCES prospeo_prospects(id) ON DELETE CASCADE,
  score        INT NOT NULL,
  reasoning    TEXT NOT NULL,
  model        TEXT NOT NULL,        -- which AI model produced this, e.g. 'gemini-3.5-flash'
  qualification TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Note on ordering:** `prospeo_usage` references `prospeo_prospects`, so in the actual migration the tables get created in dependency order (companies → prospeo_accounts → prospeo_prospects → prospeo_usage → events → scores) — Drizzle handles this automatically when generating the migration.

---

## 3. Prospeo provider interface

Same adapter pattern as every other external integration in this project:

```typescript
interface LeadProvider {
  search(params: LeadSearchParams): Promise<RawProspect[]>;
  enrichEmail(prospect: RawProspect): Promise<EmailEnrichmentResult>;
  checkCredits(): Promise<{ remaining: number; limit: number; renewalDate: string }>;
}
```

`ProspeoProvider` implements this against Prospeo's real API. A `MockProspeoProvider` implements the same interface for `MOCK_PROSPEO=true` testing — simulating successful search, successful/failed enrichment, no-email-found, insufficient credits, rate limiting, and duplicate scenarios, exactly as the spec requires, without ever touching a real account.

---

## 4. Credit manager — concurrency-safe account selection

This is the part most likely to break under real usage if built carelessly, so it's worth being precise about the mechanism.

**The problem:** two background jobs could both see "Account A has 1 credit left" and both try to use it, resulting in either a failed Prospeo call or (worse) double-spending against a count we haven't refreshed yet.

**The fix:** a row-level lock via `SELECT ... FOR UPDATE` inside a transaction, decrementing the credit count atomically as part of the same transaction that claims it:

```typescript
async function reserveCredit(): Promise<ProspeoAccount> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(schema.prospeoAccounts)
      .where(and(eq(schema.prospeoAccounts.active, true), gt(schema.prospeoAccounts.remainingCredits, 0)))
      .orderBy(desc(schema.prospeoAccounts.remainingCredits)) // use the account with the most headroom first
      .limit(1)
      .for("update"); // row lock — no other transaction can select this row until we commit

    if (!account) throw new Error("No Prospeo account has available credits.");

    await tx
      .update(schema.prospeoAccounts)
      .set({ remainingCredits: account.remainingCredits - 1 })
      .where(eq(schema.prospeoAccounts.id, account.id));

    return account;
  });
}
```

Because the row is locked for the duration of the transaction, a second concurrent job attempting the same query simply waits until the first transaction commits (releasing the lock with the updated, decremented count) — it can never see and act on stale credit data. This is the standard, correct way to solve exactly this class of problem in Postgres.

---

## 5. Credit-efficient pipeline (the core business rule)

Per your spec's most important rule — never spend a credit on someone who wasn't going to be enriched anyway:

1. **Discover** — `ProspeoProvider.search()` with configurable filters (location, job title, industry, company size, keywords)
2. **Filter** — basic relevance rules before anything touches the database (e.g. must have a job title, must be in a target location)
3. **Dedupe** — check `prospeo_prospects` AND the existing `leads` table for: exact email, normalized email, LinkedIn URL, company domain + name, name + company. If duplicate → record a `duplicate` event, stop, no credit spent.
4. **AI score** — Gemini scores the prospect using your configured ICP criteria (0–30 Poor, 31–60 Weak, 61–80 Good, 81–100 High Priority) — this costs an AI call, not a Prospeo credit, so it's cheap to do on every non-duplicate prospect
5. **Rank** — sort by score, process highest first
6. **Credit check + reserve** — only for prospects that passed scoring, using the concurrency-safe reservation above
7. **Enrich** — call Prospeo's email-finder endpoint
8. **Promote** — once enriched, create a row in the real `leads` table (`source: 'prospeo'`), triggering your existing lead-scoring engine, property-matching, and (once opted in) WhatsApp follow-up — reusing everything already built rather than duplicating it

---

## 6. Lead status state machine

Implemented as a single `status` text column on `prospeo_prospects` (matching the pattern already used on `leads.status` and `properties.status` — plain text with a documented set of valid values, not a Postgres ENUM type, since you've already established that convention for easier future flexibility):

```
discovered → qualifying → qualified → ready_for_enrichment → enriching → enriched → saved → ready_for_outreach
                  ↓                           ↓                    ↓
              rejected                 credit_unavailable    enrichment_failed / no_email
                  ↓
              duplicate
```

A scheduled cleanup job (same BullMQ pattern as the follow-up scheduler) sweeps for prospects stuck in `enriching` for longer than a reasonable timeout (e.g. 10 minutes) and resets them to `ready_for_enrichment` — recovering from crashes without manual intervention, per the spec's requirement.

---

## 7. Background jobs (all via the existing BullMQ worker)

| Job | Schedule | Purpose |
|---|---|---|
| `prospeo-discover` | Configurable (e.g. daily) | Runs search across active accounts, inserts new `discovered` prospects |
| `prospeo-qualify` | Continuous/triggered | AI-scores newly discovered prospects |
| `prospeo-enrich` | Continuous/triggered | Processes `ready_for_enrichment` prospects, highest score first |
| `prospeo-credit-sync` | Hourly | Refreshes `remaining_credits` from Prospeo's balance-check endpoint for every active account |
| `prospeo-cleanup` | Every 10 min | Resets stuck `enriching` prospects |

All jobs are idempotent — safe to run twice on the same prospect without side effects (checked via status guards before acting).

---

## 8. Environment variables

```bash
MOCK_PROSPEO=false                          # true = simulate everything, spend no real credits

# One env var per authorized account — referenced by prospeo_accounts.api_key_env_var,
# never stored in the database directly.
PROSPEO_API_KEY_ACCOUNT_A=
PROSPEO_API_KEY_ACCOUNT_B=
PROSPEO_API_KEY_ACCOUNT_C=

# Alert thresholds (percentage of monthly_limit remaining)
PROSPEO_ALERT_THRESHOLDS=50,25,10,0
```

Adding a new account later means: add one new env var, then insert one row into `prospeo_accounts` referencing it — no code changes needed, satisfying the spec's "add/deactivate accounts without changing application code" requirement.

---

## 9. API endpoints (added to the existing Fastify API, following its existing `/api/v1` convention)

```
POST   /api/v1/prospects/discover        -- trigger a discovery run
GET    /api/v1/prospects                 -- list, filterable by status/score
GET    /api/v1/prospects/:id
POST   /api/v1/prospects/:id/enrich      -- manual enrichment trigger
POST   /api/v1/prospects/:id/promote     -- manually promote to a real lead
GET    /api/v1/prospeo/accounts
POST   /api/v1/prospeo/accounts
PATCH  /api/v1/prospeo/accounts/:id
GET    /api/v1/prospeo/credits
POST   /api/v1/prospeo/sync
GET    /api/v1/stats/prospecting
```

---

## 10. Alerts

Reuses the exact same `notify_human` mechanism already built for hot-lead escalation — when an account's remaining credits cross a configured threshold (50/25/10/0%), a structured notification goes out through whatever `NOTIFY_CHANNEL` is already configured (email/Telegram/Slack), rather than building a second, separate alerting system.

---

## 11. Phase plan

**Phase 14 — Schema + provider foundation:** the tables above, `LeadProvider` interface, real `ProspeoProvider`, `MockProspeoProvider`, and `MOCK_PROSPEO` test mode wired end-to-end with mocked responses (safe to fully test before touching real credits).

**Phase 15 — Credit manager + pipeline:** the concurrency-safe reservation logic, the discover→filter→dedupe→score→rank→enrich pipeline, and the BullMQ jobs.

**Phase 16 — Promotion + dashboard:** the promotion path into the real `leads` table, the admin API endpoints, and basic dashboard views (accounts table, prospects list, stats).

This mirrors exactly how we approached the email/WhatsApp update — foundation and mock-testable first, real integration second, UI last.

---

## Open questions before Phase 14 starts

1. How many Prospeo accounts do you currently have, and what should we name them (for the `account_name` field)?
2. What discovery filters matter most for your ICP — job titles like "investor," "director," specific industries, company size ranges? Give me a first-pass filter set and we'll refine it once real results come in.
3. Discovery schedule — how often should the system search for new prospects (daily, weekly, manual trigger only)?
