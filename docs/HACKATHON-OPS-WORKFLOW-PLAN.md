# Hackathon Ops Workflow — Detailed Phase-by-Phase Plan

Generic capability for the CoE-Main hackathon module. Everything keys off `HackathonEvent`;
per-event toggles in `config` JSON; existing events unaffected (toggles default off).
All paths below are the actual repo locations.

Lifecycle: `UPCOMING → ACTIVE → JUDGING → CLOSED` (terminal). No reopen.

---

## Phase 1 — Operations backbone
*Goal: the coordinator can run the event day: rooms, judges, announcements, team files.*

### 1A. Venues + team assignment

**Schema**
```
model Venue {
  id       Int    @id @default(autoincrement())
  eventId  Int
  event    HackathonEvent @relation(...)
  name     String
  capacity Int?            // null = unlimited
  order    Int    @default(0)
  @@unique([eventId, name])
  @@map("venues")
}
model TeamVenue {
  id      Int  @id @default(autoincrement())
  eventId Int
  claimId Int  @unique          // one venue per team
  venueId Int
  @@map("team_venues")
}
```

**API — new file `src/app/api/innovation/events/[id]/ops/venues/route.ts`**
- `GET` (ADMIN) → `{ venues: [{id,name,capacity,order,assignedCount}], unassignedClaims: [{id,teamName,...}] }` — assignedCount via groupBy on TeamVenue.
- `POST` `{name, capacity?, order?}` → create venue. Errors: duplicate name (400, case-insensitive), capacity < 1 or non-int (400).
- `DELETE /[venueId]` → blocked if any TeamVenue rows exist → 409 `{message: "Unassign N teams first"}`; else delete.
- `PUT /[venueId]` `{name?, capacity?}` → rename/re-capacity (name uniqueness re-checked).
- `POST /assign` `{claimIds: number[], venueId}` (bulk) → inside `$transaction`: verify venue exists (404), verify claims belong to event (filter where eventId), **capacity check**: `existing + incoming ≤ capacity` else 400 with count; upsert TeamVenue per claim.
- `DELETE /assign` `{claimId}` → unassign (venueId null). Allowed anytime (scores are claim-scoped, not venue-scoped).

**UI — new section in `src/app/admin/hackathons-config/page.tsx` (per-event "Ops" panel):**
- Venue list (name, capacity, assigned count, unassign-all per venue, delete/edit).
- "Unassigned teams" list with per-team dropdown → venue, and "assign all to …" bulk control.
- Banner when `status === "JUDGING"` and unassignedClaims.length > 0.
- Hidden entirely when `config.venues` off.

**Edge cases (implemented server-side, not just UI):**
- Capacity race: assignment runs in a transaction with a fresh count; overflow → 400.
- Reassignment while judging: allowed; existing RubricScores stay attached to claim (venue change never touches scores).
- Venue delete with teams → 409 (must unassign first) — prevents silent orphans.
- Duplicate names → unique(eventId,name) + case-insensitive pre-check.
- Multi-session events: one venue row per session-room ("Session 1 · Hall A") — `ponytail:` documented ceiling, no per-session schema.
- `config.venues` off → routes return 404, UI hidden, judge fallback = all claims (current behavior).

### 1B. Judges + venue scoping

**Schema**
```
model JudgeAssignment {
  id       Int   @id @default(autoincrement())
  eventId  Int
  judgeId  Int
  venueId  Int?              // null = all claims
  @@unique([eventId, judgeId])
  @@map("judge_assignments")
}
```

**API — new file `src/app/api/innovation/events/[id]/ops/judges/route.ts`**
- `GET` (ADMIN) → `{ judges: [{userId, name, email, venueId, venueName, claimCount}] }`
- `POST` `{userId, venueId?}` → validate user exists + has an allowed judging role (reuse the role check from the existing faculty review route); upsert (unique event+judge); invalid user → 404; non-judge role → 403.
- `DELETE /[userId]` → remove assignment. RubricScores **kept** (audit intact), judge loses queue access.
- `PUT /[userId]` `{venueId}` → move to another venue (or null).

**Judge scoping — modify the existing scoring route `src/app/api/innovation/faculty/claims/[id]/review/route.ts`:**
- Before any score write: resolve judge's `JudgeAssignment` for the claim's event; if venueId set → claim's TeamVenue.venueId must equal it, else 403 "not assigned to this team's venue".
- Queue listing for judges: filtered by venue (see 2B — the review page's claim list query gains the join).

**UI:** judges panel in the Ops section: add-by-search (name/email), assign venue dropdown, list with claim counts, remove.

**Edge cases:**
- Duplicate add → upsert (idempotent), no 409.
- Judge removed mid-round → their scores persist; a "scores by removed judge" note in admin score review.
- Judge's role changed to non-judge → assignment treated as inactive (query filters), scores kept.
- Venue deleted → cascade sets judge venueId null (all claims) — never an error state.
- In-flight scoring after judge lost scope (reassigned/deleted venue) → 403 on write; UI refresh shows the new queue.

### 1C. Notices + team docs

**Schema**
```
model Notice {
  id        Int      @id @default(autoincrement())
  eventId   Int
  title     String
  body      String   @db.Text
  fileKey   String?
  pinned    Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([eventId, pinned, createdAt])
  @@map("notices")
}
```

**API — new file `src/app/api/innovation/events/[id]/ops/notices/route.ts`**
- `GET` (public) → notices for the event: pinned first, then createdAt desc. Returns `fileUrl` via the existing auth-agnostic storage proxy pattern only for files (proxy handles auth for private files; notices files are public).
- `POST` (ADMIN) `{title, body, pinned?}` + optional `file` (multipart, reuses `uploadFile` → `events/{eventId}/notices/…`). Title/body non-empty; body ≤ 5000 chars; file whitelist: pdf/png/jpg/jpeg/docx/pptx/zip, ≤ 10 MB.
- `PUT /[noticeId]` (ADMIN) → edit title/body/pinned; optional new file replaces old (old object removed from MinIO).
- `DELETE /[noticeId]` (ADMIN) → delete + remove MinIO object.

**Team docs — extend existing session-upload machinery:**
- `config.teamDocs` on → allow additional file types on the existing team submission upload (the `session-upload-locks` flow): pdf/docx/zip ≤ 10 MB alongside the existing PPT.
- After `submissionLockAt` → uploads locked (existing behavior), UI copy: "Submission window closed at <time>".

**UI:**
- Student event page `src/app/hackathons/[id]/EventDetailClient.tsx`: "Notices" section (title, body, file link, pinned badge, date).
- Admin Ops panel: notice composer (title/body/pin/file), list with edit/delete.
- Team docs: the existing upload UI gains the extra types when toggle on.

**Edge cases:**
- Files only via whitelist + size cap (reject 400 with the allowed list).
- Delete cleans MinIO (best-effort; object removal failure logged, row still deleted).
- Long titles truncate at 120 chars in list view.
- Notice edits are visible immediately (no draft state — v1).

---

## Phase 2 — Judging depth
*Goal: coordinator can review/change scores; judges give comments and can revisit (2×).*

### 2A. Score review + override

**Schema:** no new tables. Convention: overrides are written into `RubricScore` with `comment = "[OVERRIDE] <reason>"`, `round = current round`; activity log row records `before → after`.

**API — new file `src/app/api/innovation/events/[id]/ops/scores/route.ts`**
- `GET` (ADMIN) → per claim: team name, venue, per-category scores (all judges), aggregates, `overridden` marker, current round. Filter `?venueId=`.
- `PUT` `{claimId, categoryId, score, reason}` (ADMIN) → validate: event in JUDGING (else 403 "results declared"), category belongs to event (404), `0 ≤ score ≤ category.weight` (else 400 "exceeds category cap"), reason 2–200 chars (400). Write RubricScore upsert with `[OVERRIDE]` marker; activity log before/after.
- Override visibility: student-facing score queries (leaderboard/results) return final values only — no markers, no per-judge breakdown.

**UI — Ops panel "Scores" tab:** claims table (venue filter, expand per claim → category rows with current value, input, reason box, Save). Dirty-state handling: unsaved changes prompt before leaving (client-side confirm).

**Edge cases:**
- Override while a judge is also editing → last write wins; both entries visible in activity log (audit, no locks).
- Override after CLOSED → 403 (lifecycle terminal; coordinator finalizes in JUDGING).
- Category deleted after scores exist → scores keep categoryId (FK restrict) — categories are effectively immutable once scoring starts (existing behavior, documented).
- Empty reason → 400 (prevents silent un-audited changes).

### 2B. Judge comments + rounds (2× revisit)

**Schema**
```
RubricScore += comment String? @db.VarChar(1000), round Int @default(1)
```

**Config:** `judgeRounds` (Int, 0 = off). Round state lives in `HackathonEvent.config` (`ops.currentRound`) — updated by the advance action (no new table).

**API changes:**
- Scoring write route (`faculty/claims/[id]/review/route.ts`): accept `comment?` (≤1000 chars, optional unless `config.commentsRequired`) + implicit `round = config.ops.currentRound`; upsert per (claim, category, round) — add round to the unique scope or store rows per round (rows per round, round-1 kept for audit).
- `POST /api/innovation/events/[id]/ops/scores/advance-round` (ADMIN, JUDGING only): `currentRound++`, capped at `judgeRounds` (409 "already at final round").
- Queue/list for judges: show only claims in their venue (1B), plus which categories already scored **in the current round**.
- Student-visible comments (config `commentsToStudents` on, event CLOSED): final-round comments, **judge identity stripped** — shown as generic comments.

**UI:**
- Judge review page: per-category score + comment box; "scored in round N" badges; when round advances, previously saved round-1 rows shown read-only at the bottom (audit view).
- Admin: "Advance to round N+1" button with confirm (shows how many claims scored in the open round).
- Student results: comments list (no judge names).

**Edge cases:**
- Round advance mid-edit → judge's unsaved input lost (documented; UI warns "advance in progress" only via refresh — no live lock).
- `judgeRounds=1` → advance button hidden; `0` → comments still work, rounds always 1.
- Judge edits score in round N after advance (stale form POST) → rejected 409 "round N locked"; client refreshes.
- Comments with scores → comment without score allowed (e.g. "skipped")? v1: score required to save a row; comments-only notes go in the same box with score 0 only if allowed by rubric min (0 allowed). Documented.
- Final score for results = round-`currentRound` (or last completed when CLOSED); round-1 rows never affect results once a later round exists for that (claim, category).

### 2C. Results freeze

- When event advances to CLOSED (existing status route `admin/events/[id]/status/route.ts`): scores become immutable (writes 403 — enforced by the JUDGING check in 2A).
- Leaderboard/public results read live from RubricScore at render time — no cache, so pre-close overrides always reflect.

---

## Phase 3 — Wrap-up
*Goal: feedback, media, and open results.*

### 3A. Student feedback

**Schema**
```
model EventFeedback {
  id        Int      @id @default(autoincrement())
  eventId   Int
  userId    Int
  rating    Int      // 1-5
  comment   String?  @db.Text  // ≤2000 chars
  createdAt DateTime @default(now())
  @@unique([eventId, userId])
  @@map("event_feedbacks")
}
```

**API — new file `src/app/api/innovation/events/[id]/feedback/route.ts`**
- `POST` (student, own session id — never from body): event CLOSED + `config.feedback` on (else 403); rating int 1–5 (400 otherwise); comment ≤ 2000; duplicate → 409 "already submitted"; rate limit 5/min.
- `GET` (ADMIN) → all feedback + student name/uid; `?export=csv` reuses the analytics CSV pattern.

**UI:** student event page "Feedback" card (stars + textarea + submit; on 409 show "You've already shared feedback"); admin Ops tab "Feedback" list + Export CSV.

**Edge cases:** duplicate (unique constraint → 409, UI friendly); window not open (403 with message "results not declared yet"); rating out of range (400); identity is shown to admins (documented, not anonymous); no edit after submit (v1).

### 3B. Final report + photos/videos

**Schema**
```
model EventMedia {
  id        Int      @id @default(autoincrement())
  eventId   Int
  kind      String   // REPORT | PHOTO | VIDEO
  fileKey   String
  caption   String?  @db.VarChar(300)
  createdAt DateTime @default(now())
  @@map("event_media")
}
```

**API — new file `src/app/api/innovation/events/[id]/ops/media/route.ts`**
- `POST` (ADMIN, multipart): kind ∈ {REPORT, PHOTO, VIDEO}; caps: REPORT pdf ≤ 20 MB; PHOTO png/jpg/webp ≤ 10 MB; VIDEO mp4/webm ≤ 100 MB; caption ≤ 300. Upload via `uploadFile` → `events/{eventId}/media/…`.
- `GET` (public) → media list; REPORT first (pinned slot), then newest first.
- `DELETE /[mediaId]` (ADMIN) → remove row + MinIO object.

**UI:** admin upload form (kind select + file + caption); event page "Gallery" section (report link card on top + photo/video grid). Videos render as `<video>` with poster caption; photos via the storage proxy.

**Edge cases:** wrong type/size → 400 with cap listed; delete cleans object (best-effort, logged); gallery hidden when empty; event delete cascades rows (object cleanup documented as a sweep script if ever needed).

### 3C. Public results ("declare openly to all")

- Config `publicResults` on + event CLOSED → the event page renders a "Results" section: ranked claims (final score desc), shared ranks for ties (1, 1, 3…), per-category final scores, judge comments if `commentsToStudents` (identity-stripped).
- Implemented in `EventDetailClient.tsx` reading the existing leaderboard route (`events/[id]/leaderboard/route.ts`) extended with comments (only when toggles on).
- Toggle on but event not CLOSED → section hidden (lifecycle guard), no partial previews.

**Edge cases:** tie display (equal rank, no hidden tie-break); leaderboard route already public — comments exposure gated server-side (not by hiding UI); certificates flow untouched (results are display-only); after CLOSED nothing changes it (frozen by lifecycle).

---

## Security & permissions (all phases)

| Action | ADMIN | Judge (scoped) | Student | Public |
|---|---|---|---|---|
| Venue/judge/notice/media CRUD, override, advance-round | ✓ | – | – | – |
| Score+comment own venue, open round | – | ✓ | – | – |
| Rubrics view | ✓ | ✓ | ✓ | ✓ |
| Notices/media view | ✓ | ✓ | ✓ | ✓ |
| Results view (CLOSED + toggle) | ✓ | ✓ | ✓ | ✓ |
| Feedback submit (CLOSED + toggle) | – | – | ✓ once | – |
| Team doc upload (before lock) | – | – | ✓ | – |

- Every write: `authenticate` + `authorize`/scope check; ownership derived from session (never client ids).
- Uploads: `uploadFile` + storage proxy only.
- Ops routes 404 when the feature toggle is off (feature-hidden, not auth-error).

## Verification per phase

1. **Checks** — new `scripts/checks/hackathon-ops-checks.ts`: venue capacity reject, duplicate venue, judge scope 403, override cap 400, override-after-close 403, round advance lock, feedback unique 409, feedback window 403, toggle-default-off (config null → routes 404). Run with `npx tsx --env-file=.env`.
2. **Build** — `npm run build` + tsc 0.
3. **Dev E2E** — full lifecycle on `coe_db_dev`: event (toggles on) → venues → claims assigned → judges added/scoped → notices + team doc upload → scoring round 1 + comments → advance → round 2 → override → CLOSED → results + feedback + media render.
4. **Screenshots** — CDP desktop + 390px for every new screen (admin ops panels, judge queue, student event page sections).
5. **Prod** — one additive migration; verify an existing event (toggles off) renders byte-identical behavior.

## Out of scope (v1)
Auto venue allocation · notice push notifications · anonymous feedback · feedback editing · reopening CLOSED · per-session venue schema.
