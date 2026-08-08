# Hackathon Portal — Final End-to-End Workflow

The complete hackathon lifecycle implemented in this codebase (verified against
`HACKATHON_EVENT_FLOW.md`, all API routes present, E2E lifecycle previously tested green).

## Actors

| Actor | Can do |
|---|---|
| **ADMIN** | Create events, screen, judge, verify tickets, close events, view leaderboard/analytics, manage email queue |
| **STUDENT** | Mark interest, register team, submit briefing deck, view/download ticket, track dashboard/portfolio |
| **FACULTY** | No attendance/check-in rights — all check-in marking is ADMIN-only |

## Stage-by-stage flow

### Stage A — Event creation (Admin)
`POST /api/innovation/events` → event created `UPCOMING`, `registrationOpen=true`,
problems bulk-created, optional briefing PDF uploaded to object storage (MinIO).

### Stage B — Interest tracking (optional)
`POST /api/innovation/interest` (idempotent) → `HackathonInterest` row; admin sees per-event
interest totals with student contact details.

### Stage C — Team registration (Student)
`POST /api/innovation/events/{id}/register` — validations: event open & not past end,
team size = lead + members, no duplicate UIDs, lead matches logged-in student, all members
active/verified, no member double-booked in the event. Creates `Claim` (SUBMITTED) + member
roster; briefing PPT uploaded.

### Stage D — Screening (Admin, bulk)
`PATCH /api/innovation/faculty/claims/sync` (stage SCREENING) → SHORTLISTED/REJECTED per claim.
Shortlisted teams get a **hackathon selection ticket** issued; screening-result emails queued.

### Stage E — Ticket issuance (auto)
One `Ticket` (type HACKATHON_SELECTION) per selected claim → PDF with QR → object storage →
`TicketAttendance` rows pre-created (NOT_PRESENT) for every member → ticket email with PDF
attachment to team lead.

### Stage F — Status progression
`UPCOMING → ACTIVE → JUDGING → CLOSED`. Manual: `PATCH .../admin/events/{id}/status`.
Cron (`/api/cron/innovation-reminder`): upcoming broadcast, auto-activation (+emails),
30-min-before-end reminders (deduped via `reminderSent`).

### Stage G — Check-in (Admin only)
`POST /api/tickets/verify` — QR scan → team/event/attendance rows shown; passing
`presentClaimMemberIds` marks members PRESENT (`checkedInAt`/`checkedInBy` recorded);
all present ⇒ ticket auto-USED. Admin-only (FACULTY removed); marking is only
accepted inside the event window (`startTime`–`endTime`).

### Stage H — Judging (Admin)
`PATCH /api/innovation/faculty/claims/sync` (stage JUDGING) → per-claim rubric scores +
ACCEPTED/REJECTED; weighted final score stored; rubric-result emails queued. Judging queue
lives in the admin panel (Innovation tab), fully config-driven by rubric categories.

### Stage I — Closure & results
Status → CLOSED: in-progress claims auto-submitted, **leaderboard computed**, closure
result emails (team name, score, rank, leaderboard link). Leaderboard API
(`GET .../events/{id}/leaderboard`) serves results only after CLOSED.
Closing is **blocked while any claim awaits a judging decision** — judge or
reject every submission first.

## Production hardening (audit pass, 2026-08-08)
- **Registration race fixed** — duplicate-member check + claim creation run in one
  transaction with `SELECT ... FOR UPDATE` on the involved student rows; concurrent
  registrations touching the same member serialize.
- **Upload-first ordering** — the briefing deck uploads before the claim is created;
  a failed upload can no longer orphan a claim or block re-registration (uploaded
  files are cleaned up on the duplicate-409 path).
- **Upload limits** — 20MB cap + MIME allowlists (`validateUploadFile` in
  `src/lib/innovation.ts`): decks = PDF/PPT; submissions = PDF/ZIP/PPT/DOC/TXT.
- **Submission deadline enforcement** — `PATCH /claims/[id]/submit` now rejects
  submissions after `submissionLockAt`, after the event ends, or once CLOSED
  (previously only claim state was checked).
- **Interest blocked on closed events** — `POST /innovation/interest` returns 400
  for CLOSED events (was inflating admin stats).
- **PII removed from public surfaces** — leaderboard and UID lookup no longer
  return student emails.
- **Server-side rubric validation confirmed** — `validateRubricValues` in the
  judging sync rejects scores outside each category's weight.
- **Close guard** — status route refuses CLOSED while unjudged claims exist.
- **Attendance role tightened** — `POST /api/tickets/verify` is ADMIN-only.

### Post-event (Student)
- Dashboard: registrations, deadlines, certificates, recent results, recommended events.
- My Hackathons: claims with status, tickets with QR PDF download, attendance state.
- Portfolio: earned certificates per event.

## Email matrix

| Email | Recipients | Trigger |
|---|---|---|
| Upcoming broadcast | All active students | Cron |
| Event active | Registered participants | Cron / admin status ACTIVE |
| Ending reminder | Participants (once) | Cron 30-min window |
| Screening result | Claim members | Bulk sync SCREENING |
| Rubric result | Claim members | Bulk sync JUDGING |
| Ticket issued (PDF) | Team lead | Ticket issuance |
| Closure result (score/rank) | Claim members | Event closed |

All lifecycle emails run through the queue (`EmailJob`, exponential-backoff retries, admin
snapshot at `GET /api/admin/emails`) except ticket-issued (immediate send with attachment).

## Deployment state (as of this pass)

- **Running:** port 6356, dev DB `coe_db_dev` (per instruction; prod `coe_dev` migrated &
  untouched — flip = one `.env` change + restart).
- **Emails:** SMTP OAuth2 vars (`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`) live in the prod
  server env; queue fails gracefully (queued + retried) when unset.
- **Not pushed:** branch `vertical/hackathons`, working tree only.
- **Future phase (blueprint only):** event-scoped judge/mentor/coordinator assignments —
  `docs/EVENT_ASSIGNMENTS_PLAN.md`, does not block deployment.
