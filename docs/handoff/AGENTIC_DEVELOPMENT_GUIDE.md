# Agentic Development Guide

## How to Use AI Agents with This Codebase

This guide explains how AI coding agents (like Cursor, Copilot, Claude Code, etc.) can effectively work with this codebase. It covers patterns, conventions, and prompts that produce better results.

## Why This Guide Exists

AI agents are powerful but lack context about your specific codebase. Without guidance, they produce generic code that doesn't match your patterns. This guide helps agents (and humans directing them) work effectively.

## Critical Context for AI Agents

### This is NOT a Standard Next.js App

This project has specific patterns that differ from what most AI training data expects:

1. **The CoE Portal is the only app in this repo**: The Project Dashboard (`project-dashboard/`) is **gitignored and external** — it is NOT part of this repository. Agents must never assume dashboard files exist here; only the integration contract lives in this repo (`src/lib/dashboard-sync.ts`, shared cookie).

2. **Shared auth via cookie**: Authentication is shared between apps via `coe_shared_token` cookie. The agent should not suggest OAuth redirect flows or JWT-in-localStorage patterns.

3. **Response envelope**: Every API returns `{ success, message, data, errors }`. Agents must follow this pattern.

4. **No NextAuth.js**: This project uses custom JWT auth, not NextAuth.js. Don't suggest NextAuth changes.

5. **Queue-based email**: Email delivery goes through `EmailJob` database table + cron worker. Don't suggest inline SMTP for bulk emails.

6. **MinIO, not cloud S3**: File storage uses self-hosted MinIO. Don't suggest AWS S3 SDK changes.

7. **Database-backed sessions are wrong**: Sessions are JWT-based, not stored in DB. Don't suggest creating a Session model.

## Important Files for AI Agents

### When working on the CoE Portal (`src/`):

| File | Why the Agent Must Read It |
|------|---------------------------|
| `prisma/schema.prisma` | Understand all models, enums, relations |
| `src/lib/jwt.ts` | Token payload structure, TTLs, secrets |
| `src/lib/api-helpers.ts` | `authenticate()` and `authorize()` signatures |
| `src/lib/validators.ts` | All Zod schemas for request validation |
| `src/lib/shared-auth.ts` | Shared cookie config |
| `src/app/api/auth/login/route.ts` | Login pattern (reference for auth flows) |

### When working on the Project Dashboard (EXTERNAL — not in this repo):

> The dashboard source is gitignored here. Only the sync contract is visible: `src/lib/dashboard-sync.ts`, `src/lib/shared-auth.ts`, and the `coe_shared_token` cookie. Work on the dashboard in its own repository.

| File | Why It Matters |
|------|---------------------------|
| `src/lib/dashboard-sync.ts` | CoE-side fire-and-forget sync to the dashboard's internal API (`DASHBOARD_URL` + `SYNC_SECRET`) |

## Prompt Templates for AI Agents

### Adding a New API Route

```
You are working on the CoE Portal in src/.
Database: MySQL via Prisma ORM at prisma/schema.prisma
Auth: JWT in httpOnly cookies. Use authenticate(req) from src/lib/api-helpers.ts
Role check: Use authorize(user, 'ADMIN') from src/lib/api-helpers.ts
Response format: Use successRes() and errorRes() from src/lib/api-helpers.ts
Validation: Use Zod schemas. Define schema then safeParse().
Response envelope: { success: boolean, message: string, data: any, errors: string[] }

Task: Create an API route that...
```

### Adding a New Database Model

```
You are working on the Prisma schema at prisma/schema.prisma.
Existing models and enums are defined there.
Naming conventions:
- Model names: PascalCase, singular (e.g., HackathonEvent)
- Table names: snake_case, plural, via @@map (e.g., "hackathon_events")
- Field names: camelCase (e.g., createdById)
- Enum names: PascalCase (e.g., BookingStatus)
- Enum values: UPPER_SNAKE_CASE (e.g., PENDING)
- Indexes: @@index([field]) on frequently queried fields
- Relations: Always define both sides with @relation

Task: Add a model for...
```

### Adding an Email Template

```
Email system in src/lib/email-delivery.ts:
- dispatchEmail({ to, subject, html, category, mode }) for queue-based delivery
- mode: 'immediate' for urgent, 'bulk' for non-urgent
- Categories are strings like "BOOKING_CONFIRMED"
- Templates defined in src/lib/mailer.ts using wrap() HTML wrapper
- Template functions: sendOTPEmail(), sendBookingConfirmationEmail(), etc.

Task: Add an email template for...
```

## Common AI Mistakes

| Mistake | Why It Happens | How to Prevent |
|---------|---------------|----------------|
| **Suggests NextAuth.js** | Most training data uses NextAuth for auth | Tell agent: "This project uses custom JWT auth" |
| **Suggests localStorage for tokens** | Common pattern in tutorials | Tell agent: "All tokens in httpOnly cookies" |
| **Creates Session model** | Many apps use DB sessions | Tell agent: "Sessions are JWT-based, no Session table" |
| **Uses S3 SDK import** | Training data assumes AWS S3 | Tell agent: "Uses MinIO from src/lib/minio.ts" |
| **Writes raw SQL** | Training data includes SQL | Tell agent: "Uses Prisma ORM for all queries" |
| **Ignores response envelope** | Training APIs don't use envelopes | Tell agent: "Use successRes()/errorRes() helpers" |
| **Suggests new dependencies** | Training assumes npm ecosystem | Tell agent: "No new npm packages without approval" |
| **References project-dashboard files** | Old docs described two apps in one repo | Tell agent: "project-dashboard/ is gitignored/external — only sync via src/lib/dashboard-sync.ts" |
| **Uses toProxyUrl() from minio.ts** | Outdated examples | Tell agent: "toProxyUrl() is private; use /api/storage/<key> or uploadFile's returned key" |
| **Mixes up the two apps** | Both were historically in the same repo | Tell agent: "src/ is the CoE Portal; the dashboard is external" |

## Development Workflow with AI

### Step 1: Explore

```typescript
// Ask the agent to read key files first:
"Read src/lib/api-helpers.ts and src/lib/jwt.ts to understand the auth pattern."
```

### Step 2: Plan

```typescript
// Get the agent to propose a plan before writing code:
"Before writing code, explain the files you'll create/modify and the data flow."
```

### Step 3: Implement

```typescript
// Be specific about files and patterns:
"Add a GET endpoint at /api/items that returns all items.
Use the authenticate/authorize pattern from api-helpers.ts.
Response must use the standard successRes/errorRes envelope."
```

### Step 4: Verify

```typescript
// Check the output:
"Run lsp_diagnostics on the changed files."
"Check that the response follows { success, message, data } pattern."
```

## Project-Specific AI Rules

These rules should be included in any prompt to an AI agent:

```
RULES:
1. No new npm packages without explicit approval
2. No as any, @ts-ignore, @ts-expect-error
3. Always use Zod for input validation
4. Always use authenticate() + authorize() for protected routes
5. Response must use successRes/errorRes envelope
6. All API routes go in src/app/api/<group>/<name>/route.ts
7. Database queries use Prisma ORM (not raw SQL)
8. File uploads use MinIO (src/lib/minio.ts)
9. Email delivery uses dispatchEmail() (src/lib/email-delivery.ts)
10. Sessions are JWT-based (no Session table)
```

## Reading Order for AI Agents

When an AI agent is first introduced to this project, it should read:

1. `docs/handoff/PROJECT_OVERVIEW.md` — Understand the two applications
2. `docs/handoff/SYSTEM_ARCHITECTURE.md` — Understand module interactions
3. `docs/handoff/AUTHENTICATION.md` — Understand auth (most critical)
4. `prisma/schema.prisma` — Understand the data model
5. `src/lib/api-helpers.ts` — Understand core patterns
6. The specific module documentation relevant to the task
