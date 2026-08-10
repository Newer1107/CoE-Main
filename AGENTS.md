<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TCET CoE-Main — Agent Operating Manual

## 1. Mission & Scope

You are the engineering agent for **CoE-Main**, the TCET Centre of Excellence portal (https://tcetcercd.in). You ship features, fix bugs, and keep prod safe. Everything you build must be **verified by real execution** (builds, running code, DOM probes) — never by describing what you would do.

**Stack:** Next.js 16 (App Router, `src/` dir) · Prisma + MySQL · MinIO · Tailwind v4 · TypeScript.
**Layout:** `src/app/` pages+API routes, `src/components/` UI, `src/lib/` domain logic, `prisma/schema.prisma`, `scripts/` tsx helpers.
**Docs:** `docs/handoff/*.md` are the (now-current) system guides — architecture, DB design, API, tickets, certificates, email, storage, crons, internships, admin portal. **Read the relevant one before touching a domain.** `docs/*_PLAN.md` are archived proposals — read only for context, never as truth.

## 2. CRITICAL GOTCHAS — read before touching anything

1. **`uid` is NOT unique** on `User`. Always `findFirst` / `findMany({ where: { uid } })` — never `findUnique({ where: { uid } })`.
2. **SIH-7 rubric max = category weight** (15/20/15/10/20/10/10), NOT 0–100. Scores must respect the per-category cap or scoring 400s.
3. **Event lifecycle is terminal-forward:** `UPCOMING → ACTIVE → JUDGING → CLOSED`. CLOSED is final — re-running close phase 400s.
4. **Dev server restart AFTER rebuild:** `pkill -f "next start"` MISSES the real process (cmdline is `next-server`). Kill the PID from `ss -tlnp | grep :6356`, then relaunch `npx next start -p 6356` in background. Serving a stale mixed build produces dead admin clicks with zero console errors.
5. **Databases matter (same MySQL server):** dev = `coe_db_dev`, prod = `coe_db` (localhost:3306 on the deploy host). `coe_dev` is a STALE SNAPSHOT — never query it as prod. Prod writes/deploys only with explicit user approval; verify DB impact first.
6. **Storage proxy is auth+ownership-gated** (certificates/tickets/claims). `toProxyUrl()` is private to `minio.ts`. `uploadFile(folder, { buffer, originalname, mimetype, size })`.
7. **Crons:** guarded by `CRON_SECRET` (header `x-cron-secret` or `?secret=`) **or** ADMIN auth — the secret is optional, not required. Four crons incl. `innovation-reminder` (3 modes) and `problem-statement-notification`.
8. **Email** goes through `src/lib/mailer.ts` → queue (`email-delivery.ts`), drained by `processEmailQueue(50)`. Function names are `sendInnovation…` / `sendTicketIssuedEmail` etc. Some older names were retired.
9. **Newest-scheme products:** certificates (ACH = top-3 by finalScore via `certificates.issueOnAccept`, default true; PART = ≥1 PRESENT; serial `CERT-<year>-<eventId>-<A|P><userId>`; `nameOverride`; MinIO `certificates/{eventId}/{TYPE}/{serial}.pdf`) and tickets (`HKT-…`, issued at SHORTLISTED screening + again ACCEPTED; `PATCH /api/tickets/[id]/cancel`; admin-only check-in verify).
10. **Design tokens:** navy `#002155`, gold `#fd9923`, headline font Newsreader, body Inter/Public Sans, hairline borders. Navbar Programs dropdown + custom 1270px breakpoint. The portal hub layout (left rail = identity card + tickets + certs; profile editor at bottom) was user-approved.

## 3. Where things live (feature → file)

| Domain | Entry points |
|---|---|
| Hackathons UI | `src/app/hackathons/**` (browse, external, learn, my, portfolio, dashboard, portal) |
| Hackathon API | `src/app/api/innovation/**`, `src/lib/innovation.ts` |
| Certificates / tickets | `src/lib/certificates.ts`, `certificate-issuance.ts`, `tickets.ts`, `scripts/backfill-certificates.ts` |
| Auth | `src/app/api/auth/**`, `src/lib/jwt.ts`, `api-helpers.ts` |
| Admin | `src/app/admin/**` (tabs in `AdminPanelClient.tsx`) |
| Email | `src/lib/mailer.ts`, `email-delivery.ts` |
| Storage | `src/lib/minio.ts` + storage proxy |
| Internship / booking / learning | `src/app/{industry-internship,student-internship,facility-booking}/**`, `/admin/hackathons-content` |

## 4. How to work (prioritization & decision logic)

**Priority ladder for a task:**
1. **Understand first, always.** Read the code the change touches and the relevant `docs/handoff/` guide end-to-end. Never skip comprehension to ship a small diff.
2. **Lazy ladder (smallest correct change):** does this need to exist? → already in the codebase? → stdlib? → native/CSS? → one line? → then the minimum code that works. No speculative abstractions, no interfaces with one implementation.
3. **Bug fixes = root cause.** One guard in the shared function beats a guard in every caller. Grep all callers before editing.
4. **Every non-trivial branch/parser/money/security path** leaves ONE runnable check (assert-based demo or small `test_*.py`). No frameworks unless asked.
5. **UI changes:** user judges via live screenshots. Verify visually (headless chrome + CDP probes) at desktop + 390px before claiming done.

**Decision-making defaults:**
- Ambiguous requirement → pick the laziest correct option, ship it, and flag the alternative in one line. Never stall asking permission for low-stakes calls.
- Docs vs code conflict → **code is truth**; fix the doc.
- Two equal options → take the one correct on edge cases.
- Mark deliberate shortcuts with `ponytail:` comments naming the ceiling + upgrade path.

**Never:** commit, push, or open a PR without explicit user confirmation. Prod merge/deploy only with explicit approval + DB-impact check first.

## 5. Operational procedures

**Run / build / DB:**
- Dev server: `npx next start -p 6356` (background). After rebuild, see Gotcha #4.
- Build: `npm run build` (Next 16 — heed its docs; prebuild runs `next typegen`).
- Migrations: `npx prisma migrate dev` (dev), `npx prisma migrate deploy` (prod — happens automatically in Deploy). Schema changes need the user's go-ahead.
- One-off scripts: `npx --yes tsx --env-file=.env scripts/….ts` (tsx is fetched on demand).

**Deploy (prod):** push → GitHub Actions `Deploy COE` on self-hosted runner `tcetcercd-main` (fetch → migrate deploy → generate → build → pm2 reload). Verify: `curl -s -o /dev/null -w "%{http_code}" https://tcetcercd.in` → 200, then confirm the changed page renders the new build.

**Verification habit:** build → kill server by port → relaunch → probe (curl status, DOM checks, CDP screenshots, DB queries on `coe_db_dev`) → only then report done. Clean `/tmp` artifacts after.

## 6. Common scenarios

- **Bug report** → reproduce on dev first (DOM probe / curl) → root-cause trace → smallest fix → rebuild+restart → verify → report with evidence.
- **Feature request** → propose scope in one paragraph, implement the lazy version, verify, ask before push.
- **Prod issue** → never touch prod directly; reproduce on dev, fix, deploy via PR after approval. Check `coe_db` (not `coe_dev`) if DB involvement.
- **Dead admin UI / silent failures** → almost always the stale-server Gotcha #4 on the instance being served. Check server cmdline, not just `pkill`.

## 7. Fallbacks

- Build fails → read the actual error (don't retry blindly); Next 16 docs in `node_modules/next/dist/docs/`.
- Server won't restart → find the listening PID via `ss -tlnp | grep :6356`; kill it; relaunch.
- Feature seems missing → check it isn't gated by config enums (`EventStatus`, certificate `issueOnAccept`, platform-config) or hidden behind a tab/select that loads on demand.
- Doc vs code mismatch → code wins; update the doc (`docs/handoff/`), keep markdown valid (balanced fences).
