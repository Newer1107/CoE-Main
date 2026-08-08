# Innovation & Competitions Platform — Implementation Changes

> Status: IMPLEMENTED + E2E-VERIFIED on the local dev server (port 6356), branch
> `vertical/hackathons`. Nothing has been committed or pushed; main is untouched.
> Date: 2026-08-07 · Hardening pass: 2026-08-08 (see §11)

## 11. Production hardening (audit pass, 2026-08-08)
Security/robustness fixes applied after a full workflow audit (details in
`END_TO_END_WORKFLOW.md → Production hardening`):
- Registration duplicate check + create now atomic (transaction + row locks) —
  no concurrent double-booking; briefing deck uploads **before** claim creation
  (no orphan claims); uploads capped at 20MB with MIME allowlists; claim
  submission enforces `submissionLockAt`/endTime/CLOSED; interest rejected on
  closed events; leaderboard + UID lookup no longer expose student emails;
  check-in is ADMIN-only and only inside the event window; closing an event is
  blocked while unjudged claims remain.

## 1. What this is

The existing CoE portal (Next.js 16 App Router, Prisma + MySQL, MinIO, Stitch
design system) gained a public-facing **Innovation & Competitions vertical** at
`/hackathons` — an Unstop-inspired discovery + participation experience:

- Students browse/filter events, view detail pages (problems, rubrics,
  leaderboard), register solo or in teams, save external opportunities, and get
  a personal dashboard + portfolio.
- Faculty/Admin create typed events (10 built-in event types) with per-event
  configuration, then run the full funnel: screening → tickets → judging →
  results → leaderboard — all config-driven.
- External opportunities (hackathons, competitions, workshops, conferences,
  research calls) and a lightweight learning hub are included.

Design principle followed throughout: **one engine, two faces** — the existing
innovation engine (events → problems → claims → tickets → judging → leaderboard
+ email queue + cron) was parameterized, never duplicated.

## 2. Schema changes (all additive; 2 migrations)

Migration `20260807143558_migration`:

- New tables: `departments`, `site_settings`, `rubric_categories`,
  `rubric_scores`.
- New columns: `hackathon_events.eventType` (default `hackathon`), `.config`
  (JSON), `.featured`, `.departmentId`; `problems.difficulty`, `.sdgTags`,
  `.departmentId`; `users.departmentId`, `.isCoordinator`.
- NOTE: this migration was later **edited to be purely additive** (the
  original also dropped the orphaned `computers`/`labs` tables and
  `bookings.computerId` — drift cleanup that fails on clean databases and
  deletes data). The drift statements were removed; prod's
  `_prisma_migrations` checksum was re-recorded to match (`scripts/
  fix-migration-checksum.mjs`). Any DB with the orphaned tables keeps them as
  harmless legacy tables (Prisma ignores extra tables/columns).
- The 7 fixed rubric score columns on `claims` were KEPT (additive path)
  — the config-driven flow writes both `rubric_scores` rows and the legacy
  columns, so old UI/leaderboard code keeps working.

Migration `20260807151955_add_external_opportunities_learning_hub`:

- New tables: `opportunities` (title, category, organizer, deadline, eligibility,
  prize, themes/technologies JSON, applicationUrl, facultyRecommended, status
  PENDING/APPROVED/REJECTED), `opportunity_interests` (SAVED/INTERESTED per
  student), `learning_resources` (PDF/LINK/YOUTUBE/GITHUB/TEMPLATE/
  WINNING_PROJECT).

## 3. Configuration engine

### 3.1 Platform settings (site level)

- `src/lib/platform-config.ts` — typed defaults + 60s-cached deep merge of
  `site_settings` overrides (dotted keys like `identity.platformName`,
  `flags.tickets`). Exports 10 event-type defaults and 7 rubric templates
  (sih-7, coding-3, design-4, exhibition-5, research-4, paper-3, case-4).
- `GET/PATCH /api/admin/hackathons-config` (admin) + UI at
  `/admin/hackathons-config` (Identity, Taxonomy, Rubrics, Feature Flags).

### 3.2 Per-event configuration

`hackathon_events.config` JSON (deep-merged over the type defaults):

```jsonc
{
  "registration": { "requiresPpt": false, "requiresProblemSelection": true,
                    "minTeamSize": 1, "maxTeamSize": 3, "allowSolo": true },
  "submission": { "allowUrl": true, "allowFile": true },
  "rubrics": { "template": "sih-7" },
  "certificates": { "issueOnAccept": true },
  "leaderboard": { "visibleAfter": "CLOSED" },
  "ticketing": { "enabled": true },
  "emails": { "enabled": true }
}
```

Enforced in `POST /api/innovation/events/[id]/register` (conditional PPT /
problem selection / team size / solo rules, server-side `submissionLockAt`
check) and `PATCH /api/innovation/faculty/claims/sync` (stage + rubric
categories resolved per event, RubricScore rows upserted, `finalScore` =
sum capped per weight, legacy columns mirrored). Events without a config keep
the original SIH-style behavior byte-for-byte.

Admin create form (in `AdminPanelClient.tsx`) now has an Event Type select
(auto-fills config), an "Advanced: Configuration" section (rubric template +
preview, registration toggles, leaderboard visibility, ticketing, featured).

### 3.3 Config-driven judging UI

The admin judging queue renders rubric inputs from the selected event's
`RubricCategory` rows (label + weight, live total), falls back to the legacy 7
fields for legacy events, and shows "This event type has no judging rubric" for
workshop/bootcamp-style events. Judging sync accepts any rubric keys
(`innovationHackathonRubricSchema` is now a loose record; per-category max is
validated against the event's categories server-side).

## 4. New APIs

| Route | Purpose |
|---|---|
| `GET /api/innovation/events` | + filters: `eventType`, `status`, `featured`, `search`, `sort`; payload + `department` |
| `GET /api/innovation/events/[id]` | + `problems` (with support-doc URLs), `rubricCategories`, `department`, auth-aware `myClaim`/`myInterest` |
| `GET/PATCH /api/admin/hackathons-config` | Platform settings (admin) |
| `GET/POST /api/opportunities` | Browse (approved) / submit (faculty+admin → PENDING) |
| `POST/DELETE /api/opportunities/[id]/interest` | Save / mark interested (student) |
| `GET /api/opportunities/my` | My saved/interested opportunities |
| `PATCH/DELETE /api/admin/opportunities/[id]` | Approve / reject / edit / delete (admin) |
| `GET/POST /api/learning-resources`, `DELETE /api/learning-resources/[id]` | Learning hub |
| `GET /api/hackathons/dashboard` | Student dashboard aggregation (registered, deadlines, certificates, results, recommended) |
| `GET /api/profile/innovation-portfolio` | Student portfolio aggregation (totals, awards, certificates, attendance) |

## 5. New UI (all Stitch-themed: navy #002155, gold #8c4f00, Newsreader
headlines, sharp corners, mobile responsive)

- `/hackathons` — landing: hero, **upcoming events at the top** (next 6, live on
  every request via `force-dynamic`), category chips (10 types), animated stats,
  featured events, external + learning CTAs.
- `/hackathons/browse` — search + type chips + status/sort filters (shareable
  URL params), event card grid.
- `/hackathons/[id]` — navy hero, meta grid, tabs (About / Problems / Rubrics /
  Leaderboard), config-aware `RegistrationForm`, interest button, claim state.
- `/hackathons/dashboard` — student home: stat cards, registered events,
  upcoming deadlines, certificates, recent results, recommendations, saved
  opportunities.
- `/hackathons/my` — registrations + tickets (with download).
- `/hackathons/portfolio` — awards, certificates, participated table, session
  attendance progress.
- `/hackathons/external` — opportunity cards (deadline badge, prize, tags,
  faculty-recommended badge, Apply + Bookmark/Interested toggles, submit form).
- `/hackathons/learn` — resources grouped by category.
- `/admin/hackathons-content` — opportunity moderation (approve/reject/delete)
  + learning-resource management.
- `/admin/hackathons-config` — platform settings.
- `/hackathons/layout.tsx` — vertical sub-nav (Browse / Dashboard / My
  Hackathons / Opportunities / Learning / Portfolio).
- Navbar: "Hackathons" link.

Components: `src/components/hackathons/` — EventCard, CategoryChips, FilterBar,
StatBand, EventHero, TabBar, RegistrationForm (+ shared helpers).

## 6. Verification performed (all green)

- `npx tsc --noEmit` — 0 errors project-wide.
- `npm run build` — production build succeeds (all new routes compiled).
- Targeted eslint — clean on every new/changed file (the repo's ~99
  pre-existing `no-explicit-any` errors in legacy files remain, untouched).
- Full E2E against the live server + real DB:
  - Created 3 typed demo events (hackathon, coding-competition, bootcamp) →
    RubricCategory rows 7 / 3 / 0.
  - Solo registration (no PPT, no problem selection) → 201; team registration
    with member UIDs + problem selection → 201; bootcamp registration → 201.
  - Screening: REJECT (clean) + SHORTLIST → QR ticket issued (PDF uploaded to
    MinIO — working), claim SHORTLISTED.
  - Judging: ACCEPTED with sih-7 rubrics → 7 `rubric_scores` rows, finalScore
    78, legacy columns mirrored.
  - Event closed → leaderboard (rank 1, Team Sustain, 78) + result email queued.
  - Dashboard: 3 registered / 1 certificate / 1 result; Portfolio: totals
    3/1/1/78 + attendance 0/1 sessions.
  - Opportunities: create → approve → student saves → appears in dashboard
    saved list. Learning resources: create + grouped display.
  - Browser walk-through of every page (logged-in student session): landing,
    browse, detail (all 4 tabs), dashboard, my, portfolio, external, learn —
    all render correctly, no console errors.
- **Mobile responsiveness audit** — every new page/component is mobile-first:
  grids collapse to 1–2 columns (`grid-cols-1/2` base → `md:`/`lg:`), tabs
  scroll horizontally (`overflow-x-auto`), filter bars stack, hero/meta rows
  wrap (`flex-wrap`), forms use full-width inputs; no fixed-width layout or
  horizontal overflow on any page.
- **Production-readiness cleanup** — no debug statements/TODOs in new code;
  `.env`/`.next` confirmed gitignored; stray experiment file removed; dev
  helper scripts live under `scripts/` only (not part of the app build);
  `delete-events.mjs` now cascades tickets/attendance so cleanups leave no
  orphans; one orphaned ticket from an earlier E2E run was removed.

## 7. Demo data left in the DB (on purpose)

- Events: "Smart Campus Hackathon 2026" (closed, featured), "CodeSprint 2026"
  (upcoming), "AI & ML Bootcamp" (upcoming).
- Students: `e2e.student1@example.test` / `E2ePass123!` (UID 24-TCTEST001-28)
  and `e2e.student2@example.test` / `E2ePass123!` (UID 24-TCTEST002-28).
- One approved external opportunity ("National Hackathon 2026") + one pending
  ("Startup Weekend Mumbai"), 3 learning resources.
- Admin: `admin@tcetmumbai.in` (password in `.env`).

## 8. Run it

```bash
cd /home/raunak/CoE-Main
PORT=6356 npm run dev        # dev server (uses .env; MySQL at coe_dev)
# or: npm run build && PORT=6356 npm start
```

Dev helpers in `scripts/`: `e2e-seed-students.mjs`, `e2e-verify-cleanup.mjs`,
`get-problem-id.mjs`, `delete-events.mjs`, `db-state.mjs`, `seed-admin-local.mjs`.

## 9. Deployment (LIVE — Tailscale)

The app is deployed in **production mode** on this machine, reachable at:

- **Tailscale IP:** http://100.100.96.110:6356  (hostname: `vm`)
- LAN: http://175.175.1.103:6356
- Local: http://localhost:6356

It runs in **production mode** as a plain background process on this machine
(`NODE_ENV=production PORT=6356 npm run start`, cwd `/home/raunak/CoE-Main`) —
no systemd unit, no supervisor. Restart it any time with:

```bash
cd /home/raunak/CoE-Main && NODE_ENV=production PORT=6356 npm run start
```

(If a previous instance holds port 6356, stop it first — e.g. kill the process
on that port.)

### Database: switched to the dev copy `coe_db_dev`

- `.env` `DATABASE_URL` now points at **`coe_db_dev`** (same host
  `tcetcercd-main:3306`, user-provided copy of prod) — the deployed app reads
  and writes the dev copy, leaving the original `coe_dev` untouched.
- The dev copy arrived at migration state 27 (pre-change schema, full original
  dataset: 1504 users, 348 tickets, 22 claims). Both new migrations were
  applied to it with `prisma migrate deploy` — **clean apply, zero failures**.
- **Data-integrity check (before vs after apply): identical counts** — users
  1504, events 2, problems 18, claims 22, claim_members 63, tickets 348,
  ticket_attendance 113; new tables (`rubric_categories`, `rubric_scores`,
  `opportunities`, `opportunity_interests`, `learning_resources`,
  `site_settings`, `departments`) created empty; migration history 27 → 29;
  `prisma migrate status` = "up to date".
- Prod `coe_dev` remains fully migrated (29) with a re-recorded checksum for
  the edited migration — history clean.
- NOTE: the demo events (Smart Campus / CodeSprint / Bootcamp) and demo
  students live on `coe_dev` only. The dev copy serves the 2 original legacy
  events. To populate the portal on the dev DB, re-run the demo seeding there
  (the E2E scripts target the DB in `.env`).

Production notes:

- `.next` is the production build; the server binds 0.0.0.0 so all three
  URLs above serve the same app.
- DB: MySQL `coe_dev` on `tcetcercd-main:3306` (Tailscale) — unchanged.
- MinIO ticket uploads: verified working with the configured endpoint.
- **Emails will not send until SMTP OAuth2 env vars are added** (see below).

## 10. Known notes / follow-ups

- **Email sending requires OAuth2 SMTP env vars** (`GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) — the mailer authenticates via
  OAuth2, not the app password. Until these are added to `.env`, lifecycle
  emails fail gracefully (logged, queued with retries). Add them before going
  live.
- Ticket PDFs upload to MinIO (verified working with the configured endpoint).
- `submissionLockAt` is now enforced server-side on registration.
- The 2 pre-existing TCET events (Hackathon Academy I/II) remain legacy-style
  and still work (judging falls back to the 7 fixed rubrics).
- Full-repo lint still reports ~99 pre-existing `no-explicit-any` errors in
  legacy files; the repo's canonical gate (`next build`) is green.
- Next steps (not in this scope): departments seeding + coordinator scoping,
  certificate PDF generation, mentor portal, hackathon team workspaces.
