# Hackathon Ops Module — Handoff (Coordinator + Judge + Student surfaces)

Implemented 2026-08-14 on the CoE-Main portal (dev-verified end-to-end). Everything is
event-scoped via `HackathonEvent.config.ops` toggles; defaults off so existing events
behave unchanged.

## Data model (migration `hackathon_ops` + `registration_recollect`)
- `Venue` (eventId, name, capacity?, order) — one venue per team via `Claim.venueId`
- `JudgeAssignment` (eventId, judgeId, venueId? — null = all claims)
- `Notice` (eventId, title, body, fileKey?, pinned)
- `EventFeedback` (eventId, userId, rating 1–5, comment?, unique eventId+userId)
- `EventMedia` (eventId, kind REPORT|PHOTO|VIDEO, fileKey, caption?)
- `RubricScore` += `comment VarChar(1000)`, `round Int default 1`;
  unique is now `[claimId, rubricCategoryId, round]` — **rounds are audit layers,
  the LAST round is authoritative, never sum rounds together**
- `Claim` += `venueId`, `mentor` (faculty EMAIL), `derivedInfo` snapshot
- Ops toggles: `config.ops = { venues, judges, notices, scoreReview, judgeRounds, currentRound, commentsToStudents, feedback, mediaReport }`

## API surface
- Ops (ADMIN): `/api/innovation/events/[id]/ops/{venues, venues/[venueId], venues/assign,
  judges, judges/[assignmentId], notices, notices/[noticeId], scores, rounds, media}`
  + `/feedback` (student POST, admin GET), `/ops/media` (admin POST/GET)
- Judge: `/api/innovation/judge/{overview, claims?eventId=, claims/[id]/score}`
  — venue scope enforced server-side (403 out of scope)
- Status: `/api/innovation/admin/events/[id]/status` — GET + PATCH (terminal CLOSED;
  close requires every claim to have ≥1 rubricScore; on close, `finalScore` is computed
  from the LAST round's totals so results/certificates read one source of truth)

## Key rules (all E2E-verified)
- Registration gate: `UPCOMING`/`ACTIVE` only + PPT lock `submissionLockAt` + per-user
  one team; members must be verified students; uid NOT unique → dedupe by set, never length
- Score caps = category weight (25/30/25/20 → 100); overrides need a reason, JUDGING only,
  stored with `[OVERRIDE]` prefix; overrides write the CURRENT round
- Rounds: coordinator advances (`ops/rounds` POST, capped at judgeRounds); judge saves are
  per-round upserts; coordinator Scores tab + leaderboard show only the current round's rows
- Leaderboard (`getEventLeaderboard`) falls back to live rubric totals (last round) when
  `finalScore`/`score` are null; comments surface (identity-stripped, non-OVERRIDE) when
  CLOSED + `commentsToStudents`
- Feedback: only when CLOSED + toggle; 409 on repeat; admin sees rows + average
- Media: typed limits (REPORT ≤20MB pdf, PHOTO ≤10MB png/jpg/webp, VIDEO ≤100MB mp4/webm);
  files under `events/{eventId}/media`, served via the auth proxy
- Coordinator UI: `/admin/events/[id]` (tabs Overview/Venues/Judges/Notices/Scores/Feedback/
  Media) — Overview has status advance + round controls; Scores shows live current-round totals
- Judge UI: `/judging` — assignment list, venue-scoped queue, 4-category rubric with caps,
  comment box, Save Round N; faculty-profile modal may appear for FACULTY logins (dismiss)

## Student surfaces
`EventOpsSections` on `/hackathons/[id]`: notices (pinned first), feedback card (post-close,
stars + comment, submitted state), gallery (report link, photo grid, videos). Results tab shows
rank/score/comments. Registration form: auto-derived Team Lead (You) strip (`src/lib/student-info.ts`
— parses BOTH `24-COMPD13-28` (fused: div D, roll 13, trailing serial ignored) and
`23-CSE-A-05`), live member lookup (`/api/innovation/students/lookup`), searchable PS picker
(502 SIH statements), PPT required, phone view-only, mentor email.

## Checks
- `scripts/checks/student-info-checks.ts` (10) — UID parsing both formats
- `scripts/checks/erp-checks.ts` (10) — unchanged
- E2E script pattern lives in session history (`/tmp` cleaned); flow: register ×3 →
  venues/assign → judge assign → notices → ACTIVE → JUDGING → round 1 → advance → round 2 →
  override → complete unscored via overrides → CLOSED → feedback → media → results+comments

## Deploy prep
- One additive migration (`hackathon_ops`); prod Deploy runs `migrate deploy` automatically
- Event #7 ("SIH 2026 — Internal Hackathon") seeded on DEV only: 502 problems (titles
  cleaned), 4 rubrics (25/30/25/20), ops toggles on, PPT lock Sun 23:59:59 IST — for prod,
  re-run `scripts/seed-sih-event.ts` with the prod DB after deploy (idempotent) or create
  the event via admin UI
- No new env vars; no prod access performed
