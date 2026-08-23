# London Property AI

AI-powered lead-generation, qualification, property-matching, and automated
follow-up platform for London leasehold properties.

**This project is fully independent from any other project** (including the
separate hostel WhatsApp agent) — its own repo, VPS, database, R2 bucket,
API keys, domains, and secrets. Nothing here imports from or depends on
another codebase.

## Status

Phase 2 (Foundation) — scaffolded, not yet deployed. See `docs/architecture.md`
for the full Phase 1 design (schema, API, AI agent, scoring, matching,
follow-up, security, deployment, and cost breakdown).

## Structure

```
apps/
  api/        Fastify HTTP API — auth, leads, webhooks
  worker/     BullMQ-based follow-up scheduler and background jobs
  dashboard/  Next.js admin CRM (Phase 3+)
packages/
  ai/                 AI provider abstraction, agent orchestrator, tool handlers
  database/           Drizzle ORM schema, migrations, DB client
  lead-scoring/       Explainable, configurable lead scoring engine
  property-matching/  Rule-based property matching engine
  communications/     Channel adapters (email, WhatsApp, SMS) behind one interface
  shared/             Zod schemas and types shared across services
docker/       Dockerfiles + Caddyfile
migrations/   Generated SQL migrations (via drizzle-kit)
```

## Local setup

1. Copy `.env.example` to `.env` and fill in real values. **Never commit `.env`.**
2. Install dependencies: `npm install`
3. Start infrastructure only (Postgres + Redis): `docker compose up -d postgres redis`
4. Generate and run migrations:
   ```
   npm run db:generate
   npm run db:migrate
   ```
5. Run the API in dev mode: `npm run dev:api`
6. Run the worker in dev mode: `npm run dev:worker`

## Full stack via Docker Compose

```
docker compose up -d --build
```

This brings up Postgres, Redis, the API, the worker, the dashboard, and
Caddy (which handles HTTPS once your domain's DNS points at this VPS and
`docker/Caddyfile` has your real subdomains).

## What's implemented vs. stubbed

- **Implemented and testable now:** database schema/migrations, lead
  scoring engine, property matching engine, API health check + auth +
  leads CRUD, AI provider abstraction wired to Anthropic, agent tool
  definitions and handlers, follow-up compliance gating logic.
- **Deliberately stubbed (no real credentials to test against yet):**
  Email adapter (Resend), WhatsApp adapter (Meta Cloud API), OpenAI/Gemini
  providers. These throw a clear "not yet implemented" error rather than
  pretending to work — per project rule, no integration is claimed to
  work until it's actually been tested against a real account.

## Security notes

- All secrets live in `.env`, which is git-ignored. `.env.example` contains
  placeholders only.
- Passwords are hashed with argon2id.
- The AI agent has no direct database access — it can only call the fixed,
  reviewed tool functions in `packages/ai/src/tools/handlers.ts`.
- Every AI escalation, scoring change, and follow-up send is logged
  (`activities`, `lead_score_events`, `audit_logs` tables).

## Next steps (Phase 3)

Lead CRM dashboard views: pipeline overview, lead detail page (profile,
score breakdown, conversation, timeline, matches), and property detail page.
