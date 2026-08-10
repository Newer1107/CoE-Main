> ## ⚠️ ARCHIVED — planning only, never implemented
>
> This document is a **blueprint that was never implemented** (as of this
> writing there is no event-assignment / faculty-responsibility feature in
> `src/app/api/**` or `src/app/**` — the document itself states "PLANNING ONLY —
> no implementation, no schema changes, no code"). It is kept for historical
> reference. `docs/END_TO_END_WORKFLOW.md` lists it as a "future phase
> (blueprint only)".
>
> If event-scoped judge/mentor/coordinator assignments are ever built, this
> document is the starting point — verify every claim against the code first.

# Event Assignments & Faculty Responsibilities — Implementation Blueprint

Status: PLANNING ONLY — no implementation, no schema changes, no code.
Scope: Innovation Management Platform (CoE-Main, Next.js 16 App Router, Prisma + MySQL).
Date: 2026-08-07
Review gate: this document must be approved before any development begins.

Every statement in this document was verified against the current codebase
(`src/lib/api-helpers.ts`, `src/app/api/innovation/**`, `src/app/admin/
AdminPanelClient.tsx`, `src/app/innovation/faculty/page.tsx`, `prisma/schema
.prisma`, `src/components/Navbar.tsx`, `src/lib/mailer.ts`, `src/app/api/cron/**`).

---

## Deliverable 1 — Existing Analysis (grounded in the code)

### 1.1 How RBAC works today

- Auth: JWT in an httpOnly cookie. `authenticate(req)` (`src/lib/api-helpers.ts`)
  verifies the token and returns a `TokenPayload` (`id`, `role`, `industryId?`);
  unauthenticated requests get `401 Unauthorized`.
- Authorization: `authorize(user, ...roles) -> boolean` — a **global role
  membership check**. Every protected route follows the same pattern:

  ```ts
  if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);
  ```

  There is one special case: `INDUSTRY_PARTNER` passes when the token carries a
  numeric `industryId` (partner-scoped access).
- Role enum (Prisma `User.role`): **ADMIN, FACULTY, STUDENT, INDUSTRY_PARTNER**.
  No other roles exist. The user's requirement — no new global roles — matches
  the current model: all non-admin gates are role-name-based and would remain so.

### 1.2 What each role can do in the Innovation module today (verified gates)

| Capability | API route | Gate today |
|---|---|---|
| Create/edit/publish events | `POST /api/innovation/events` | ADMIN only |
| Event status transitions (UPCOMING → ACTIVE → JUDGING/CLOSED) | `PATCH /api/innovation/admin/events/[id]/status` | ADMIN only |
| Screening + judging decisions (bulk sync) | `PATCH /api/innovation/faculty/claims/sync` | **ADMIN only** |
| Per-claim attendance marking | `PATCH /api/innovation/faculty/claims/[id]/attendance` | ADMIN only |
| Open-problem application review | `PATCH /api/innovation/faculty/claims/[id]/review` | ADMIN only |
| QR ticket verification (event-day scanning) | `POST /api/tickets/verify` | ADMIN **or FACULTY** |
| Event registration | `POST /api/innovation/events/[id]/register` | STUDENT only |
| Show interest in an event | `POST /api/innovation/interest` | STUDENT only |
| My claims / my tickets | `GET /api/innovation/claims/my`, `GET /api/tickets/my` | authenticated |
| Leaderboard | `GET /api/innovation/events/[id]/leaderboard` | public |
| Faculty workspace page | `/innovation/faculty` (renders `DecisionEngineClient`) | FACULTY, ADMIN, INDUSTRY_PARTNER |

Key verified facts:

1. **Judging and screening are effectively ADMIN-only today.** The sync API is
   gated ADMIN, and the judging/screening queue UI lives inside the admin panel
   (`AdminPanelClient.tsx`, `claims/sync` calls at ~lines 3238/3286). A FACULTY
   user cannot judge or screen a hackathon — there is no faculty-facing
   judging UI and no faculty-gated judging API.
2. **FACULTY's only innovation write-capability today is ticket verification**
   (QR scanning / attendance) via `tickets/verify` — the exact capability a
   VOLUNTEER responsibility needs.
3. **The faculty workspace page is not a hackathon console.** `/innovation/
   faculty` renders `DecisionEngineClient` (open-problem application decisions),
   yet its backing review API is ADMIN-gated — a pre-existing inconsistency
   worth fixing during this work.
4. **`users.isCoordinator` exists as a dormant column** (added to the schema,
   zero usages in `src/`). It is a coarse global flag — the wrong shape for
   per-event responsibilities. The plan should leave it unused (or deprecate)
   and use the assignment model instead.
5. **Event ownership is `hackathon_events.createdById`** (admin-created).
   There is no co-owner/operator concept today — events are administered
   exclusively by ADMIN.
6. **`departments` table + `User.departmentId` are populated-empty** (table
   exists, 0 rows, unused) — useful later for auto-suggesting faculty by
   department, not required now.
7. **Event lifecycle** is driven by the admin status route + cron
   (`innovation-reminder`, `reminder`, `email-queue`) and the email queue
   (`mailer.ts` has screening/result/new-event templates). All notification
   plumbing exists and is reusable for assignment notifications.
8. **Teams/claims model** (`claim`, `claim_members` with LEAD/MEMBER roles) is
   the natural "assigned teams" source for judges/mentors.
9. **Join-table patterns already exist** (HackathonInterest, OpportunityInterest,
   ClaimMember) — the assignment concept is a new join table with the same
   shape (event ↔ user + attributes). No new architectural pattern is needed.

### 1.3 What can be reused vs what must change

Reuse as-is: `authenticate`/`authorize`, error/success helpers, JWT, the email
queue + cron, tickets/verify, claims/my, tickets/my, leaderboard, registration,
interest, the claims/sync decision engine (logic), AdminPanelClient component
patterns, dashboard/portfolio aggregation pattern, portal components.

Must change (described in later deliverables):
- A new authorization layer for **event-scoped permissions** (one new helper —
  see §10).
- The sync route's gate (ADMIN → event-judge/coordinator).
- `tickets/verify` gate (ADMIN/FACULTY → also event-volunteer).
- A faculty-facing responsibilities surface (dashboard section + assignment
  management UI for admin/coordinator).
- Assignment notification wiring into the existing email queue.

---

## Deliverable 2 — Responsibility Model

**Responsibilities are NOT roles.** A responsibility is an assignment record
linking one faculty member to one event with a named duty. The JWT/role system
is untouched; at runtime the app resolves permissions by looking up
assignments, not by reading the role claim.

Conceptual entity (design only — no schema generated):

```
EventAssignment
  eventId        → HackathonEvent
  userId         → User (role FACULTY)
  responsibility → one of: COORDINATOR | JUDGE | MENTOR | VOLUNTEER
  status         → ACTIVE | COMPLETED | REMOVED   (acceptance not required — see §9)
  assignedById   → who created it (ADMIN or the event's COORDINATOR)
  round?         → optional judging round scope (judging may be round-based)
  createdAt / updatedAt
```

Rules:
- A faculty member may hold **multiple responsibilities across events**
  (Coordinator of AI Hackathon + Judge of SIH) and **multiple responsibilities
  within one event** (Coordinator + Judge) — with precedence rules (§11).
- Responsibilities exist only inside an event; they grant nothing outside it.
- Global ADMIN always passes every event permission (no assignment needed).
- INDUSTRY_PARTNER can be assigned JUDGE/MENTOR/VOLUNTEER where the platform
  allows partners in (keeps the existing partner pathway useful) — decided by
  the coordinator at assignment time; COORDINATOR is restricted to FACULTY.

### Capability definitions (what each responsibility CAN/CANNOT do)

**Coordinator** (per event; assigned by ADMIN)
- CAN: view all event data (teams, claims, submissions, attendance, scores);
  manage registrations (open/close windows within event status rules); assign
  JUDGE/MENTOR/VOLUNTEER; monitor judging progress; view score summaries;
  publish results (with admin's event-status consent); manage attendance;
  make announcements (email queue); export reports.
- CANNOT: delete the event; change event status (UPCOMING→ACTIVE→CLOSED stays
  ADMIN-only to preserve the lifecycle contract); assign/remove COORDINATORS;
  approve the event for public listing (featured); access other events'
  data; modify rubric templates of other events.

**Judge** (assigned to an event; optionally scoped to a round)
- CAN: view only teams assigned to them (or all SHORTLISTED teams when the
  event uses single-round judging); enter/edit rubric scores within the
  judging window; submit evaluations; see their own progress.
- CANNOT: see other judges' scores; change team statuses (SHORTLIST/REJECT/
  ACCEPT decisions remain with coordinator/ADMIN); see submissions before the
  submission window closes; edit scores after the judging lock; view
  registration PII beyond the team roster.

**Mentor** (assigned to an event)
- CAN: view assigned teams; view team progress (claim status, submission
  presence, attendance); leave structured feedback; schedule/record meetings;
  mark mentoring complete.
- CANNOT: score or judge; change statuses; see other mentors' teams' private
  feedback; issue tickets/certificates.

**Volunteer** (assigned to an event; event-day help)
- CAN: QR-verify tickets and mark attendance (reuses `tickets/verify`);
  view the registration desk queue for the event.
- CANNOT: view scores, claims detail, or financial/personal data beyond
  ticket validity; edit registrations; issue tickets.

**Administrator**
- CAN: everything (creates events, assigns coordinators, overrides any state,
  sees all data). Unchanged from today.

---

## Deliverable 3 — Permission Matrix

Legend: ✅ allowed · ⛔ denied · 🔶 conditional (described)

| Capability | ADMIN | COORDINATOR | JUDGE | MENTOR | VOLUNTEER | FACULTY (unassigned) | STUDENT |
|---|---|---|---|---|---|---|---|
| Create event | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Edit event details | ✅ | 🔶 (their event, non-status fields) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Change event status | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Assign coordinator | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Assign judge/mentor/volunteer | ✅ | ✅ (their event) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Remove assignment | ✅ | ✅ (their event, except self-demote below COORDINATOR…) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| View all event teams/claims | ✅ | ✅ | 🔶 (assigned teams only) | 🔶 (assigned teams only) | 🔶 (desk queue only) | ⛔ | own claim only |
| Manage registrations (window) | ✅ | 🔶 (within status rules) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Screen (shortlist/reject) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Judge / submit scores | ✅ | ✅ | ✅ (assigned round) | ⛔ | ⛔ | ⛔ | ⛔ |
| View other judges' scores | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| View judging progress (per judge) | ✅ | ✅ | 🔶 (own progress) | ⛔ | ⛔ | ⛔ | ⛔ |
| Lock/unlock judging window | ✅ | 🔶 (via event status only) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Publish results / close event | ✅ | 🔶 (request; ADMIN applies status) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| View leaderboard | ✅ | ✅ | ✅ | ✅ | ⛔ | ✅ (public) | ✅ (public) |
| Issue tickets | ✅ | ⛔ (system-driven on shortlist) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| QR verify / attendance | ✅ | ✅ | 🔶 (own teams, if enabled) | 🔶 (own teams, if enabled) | ✅ | ✅ (global, today) | ⛔ |
| Mentor feedback / meetings | ✅ | ✅ | ⛔ | ✅ (assigned teams) | ⛔ | ⛔ | ⛔ |
| Announcements / email event | ✅ | ✅ (their event) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Export event report | ✅ | ✅ (their event) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Certificates | ✅ | 🔶 (trigger generation) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Assign teams to judges/mentors | ✅ | ✅ (their event) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| View other events' data | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

Notes:
- "Their event" = assignment scoping by `eventId`; every query filters on it.
- Status transitions, ticket issuance and certificate triggers stay ADMIN/
  system-owned so the event lifecycle contract (cron, email queue, leaderboard
  visibility) cannot be violated by an assignment.
- Attendance-by-judge/mentor is 🔶 because the existing `tickets/verify` grant
  is role-wide; the plan narrows the volunteer path and leaves judge/mentor
  attendance off by default (coordinator can enable it per event).

---

## Deliverable 4 — Faculty Experience

Constraint honored: no new global role, no separate login, no role switching.
The faculty member's single account shows everything relevant to them.

### Navigation (unchanged shell)

- Navbar stays as-is (`src/components/Navbar.tsx` — role-derived link sets).
- `/innovation/faculty` remains the faculty workspace. A new **"My Event
  Responsibilities"** section is added to it (and mirrored, read-only, on the
  general `/faculty` portal for discoverability).

### Dashboard layout (design)

```
Faculty Workspace
├─ My Event Responsibilities        ← new section
│  ├─ Coordinator of:  [AI Hackathon]        → Manage event (open console)
│  ├─ Judge of:        [SIH 2026 · Round 1]  → Judge teams (open judging queue)
│  ├─ Mentor of:       [Design Sprint]       → Mentored teams (open mentor view)
│  └─ Volunteer of:    [Innovation Day]      → Event-day desk (open scanner)
├─ Existing Decision Engine (open problems)  ← unchanged
└─ Existing navigation to other modules      ← unchanged
```

- Each responsibility row: event title, dates, status pill (from event
  status), responsibility chip, and a contextual quick action (below).
- **Event switching** is not a mode — it is just picking the row. Clicking a
  responsibility opens that event's scoped console; the URL carries
  `?event=<id>&scope=<responsibility>` so each view is bookmarkable and the
  console only shows data the responsibility may see.
- No duplicate accounts, no login switch — the JWT is the same; the UI merely
  renders assignment-derived sections.

### Quick actions per responsibility

- Coordinator: Manage registrations · Assign faculty · Judging progress ·
  Results · Announcements · Report.
- Judge: Open judging queue (filtered to assigned teams) · My progress.
- Mentor: My teams · Feedback · Meetings.
- Volunteer: Scan tickets · Attendance desk.

### What the faculty member does NOT see

- Assignments for events they are not part of.
- Admin-only panels (status changes, featured toggle, global settings).

---

## Deliverable 5 — Assignment Workflow

1. **Administrator creates an event** — unchanged (existing create form,
   `POST /api/innovation/events`).
2. **Administrator assigns a Coordinator** (first assignment; required before
   the event can be handed over for operations).
   - Email queued: "You are the coordinator of <event>".
3. **Coordinator assigns Judges** — pick faculty (optionally by department,
   reusing the empty-but-designed `departments` table later) + optional round
   scope. Emails queued.
4. **Coordinator assigns Mentors** — per event or per team subset. Emails
   queued.
5. **Coordinator assigns Volunteers** — for event-day duties. Emails queued.
6. **Faculty dashboard updates** — the section in §4 refreshes immediately
   (assignments are read live, no caching beyond existing 60s config cache).
7. **Faculty gains event permissions** — the authorization helper (§10) now
   returns true for the event-scoped checks; no session/token change needed.
8. **Assignment lifecycle** (§9) governs removal/replacement; a removal
   notification is queued, and in-flight work (judging drafts) is handled per
   §11.

Every step writes through the existing API/email-queue/cron infrastructure;
the only new pieces are the assignment storage + the management endpoints +
the permission helper.

---

## Deliverable 6 — Judging Workflow (redesigned)

Current state (verified): judging is ADMIN-only, done in the admin panel via
`claims/sync`. The plan distributes it to assigned judges while keeping the
engine intact.

1. **How a faculty member becomes a judge:** an ADMIN or the event's
   COORDINATOR creates a JUDGE assignment (§5). The faculty member's
   dashboard then shows "Judge of <event>".
2. **How they access judging:** the judge CTA opens the event's judging queue
   (same queue UI pattern as AdminPanelClient, scoped). Access is enforced
   server-side: the queue API resolves assignments for `(user, eventId)`
   before returning data.
3. **How they receive assigned teams:** the claims list for a judge is
   filtered to (a) the event, (b) SHORTLISTED claims (after screening), (c)
   the judge's assigned teams or round. Team-to-judge assignment is done by
   the coordinator (per team or per round) and stored as part of the
   assignment/round model.
4. **How they submit evaluations:** the existing sync engine is reused, but
   the gate changes from `authorize('ADMIN')` to
   `hasEventResponsibility(user, eventId, ['JUDGE','COORDINATOR'])` (ADMIN
   always passes). Rubric validation stays config-driven (RubricCategory/
   legacy 7) — unchanged.
5. **How evaluations are locked:** reuse the existing `submissionLockAt`
   pattern — a **judging lock** timestamp on the event (config extension)
   after which the sync route rejects score writes; the coordinator/ADMIN can
   reopen via the same endpoint (audited).
6. **How organizers monitor judging progress:** the coordinator console shows
   per-judge progress (claims scored / claims assigned, last update), built
   from the same `rubric_scores` rows the judges write — no new scoring
   logic, just an aggregation.
7. **Results:** coordinator requests closure; ADMIN applies the CLOSED status
   (existing route); leaderboard + result emails fire as today.

---

## Deliverable 7 — Mentor Workflow

1. **Assignment:** coordinator assigns MENTOR (event-wide or team-subset).
2. **Assigned teams:** mentor view lists their teams (claim + team members +
   submission presence + attendance summary — all existing data).
3. **Meetings:** lightweight meeting log (agenda/date/notes) owned by the
   mentor per team — stored alongside the assignment; scheduled meetings
   surface as dashboard items. (Deliberately kept out of the calendar
   subsystem to avoid scope creep.)
4. **Progress:** mentor sees claim status, submission upload state, and
   session attendance over time (reuses existing claims/attendance reads).
5. **Feedback:** structured feedback records (private to mentor + coordinator
   + ADMIN; distinct from judging rubrics).
6. **Completion:** mentor marks teams complete; coordinator sees completion
   state on the progress dashboard; completion events can trigger the email
   queue (optional template).

---

## Deliverable 8 — Coordinator Workflow (with boundaries)

What a coordinator can do (per event, verified against existing APIs):
- **Manage event ops:** registration window toggles (within status rules),
  announcements via the existing email queue, report export.
- **Manage teams/registrations:** view all claims, screen
  (SHORTLIST/REJECT via the sync engine), monitor submissions.
- **Assign faculty:** create/remove JUDGE/MENTOR/VOLUNTEER assignments.
- **Monitor judging:** per-judge progress, reopen judging lock.
- **Publish results:** request closure → ADMIN applies status; result emails
  fire automatically.
- **Certificates:** trigger generation (existing system) after results.
- **Manage attendance:** mark per-claim attendance (reuse the attendance
  route, gate extended to coordinator) and delegate QR scanning to
  volunteers.
- **Reports:** aggregate views over claims/scores/attendance.

Boundaries (hard):
- No event status changes, no event deletion, no featured/publish toggles,
  no global settings, no other events' data, no coordinator self-appointment,
  no judge score tampering (can view, cannot edit judges' scores — only
  reopen the lock for judges).

---

## Deliverable 9 — Assignment Lifecycle

```
Assigned ──► ACTIVE ──► COMPLETED
   │            │
   └────────────┴────► REMOVED
```

- **Assigned → ACTIVE immediately.** Recommendation: **no acceptance step**.
  Reasoning: (1) faculty assignments at an institution are obligations, not
  opt-ins — an accept/decline step adds friction without a real decision;
  (2) the event calendar is tight and a declined assignment mid-cycle would
  strand operations; (3) notifications (email queue) give faculty the chance
  to flag conflicts with the coordinator before the event starts, which is
  the human process. Keep an optional `ACCEPTED/DECLINED` extension in the
  model (status field is a string, extensible) for later, but ship ACTIVE
  immediately.
- **ACTIVE → COMPLETED:** after results are published (coordinator) or the
  event closes; mostly bookkeeping (keeps "past responsibilities" visible on
  the faculty dashboard).
- **REMOVED:** by ADMIN or coordinator, with a reason field and an audit
  trail. Effects: permissions revoked immediately (helper checks status),
  judge drafts discarded/archived, replacement encouraged before judging
  lock, notification queued.

---

## Deliverable 10 — Reuse Strategy (maximize reuse, minimize new code)

| Need | Reuse |
|---|---|
| Auth/identity | `authenticate` (JWT) — unchanged |
| Global role check | `authorize` — unchanged for ADMIN/STUDENT gates |
| Event-scoped check | ONE new helper (e.g. `hasEventResponsibility(user, eventId, [...])` + a cached assignment lookup) — the only new auth code |
| Assignment storage | Prisma join-table pattern identical to `HackathonInterest`/`OpportunityInterest` (event ↔ user + status/attributes) |
| Team data for judges/mentors | Existing `claim`/`claim_members` (+ submission fields) — no new data model |
| Scoring | `claims/sync` engine + `hackathon-scoring.ts` + `rubric_scores` — only the gate changes |
| Judging UI | AdminPanelClient judging queue components (extract/reuse scoped variant) |
| Attendance / QR | `tickets/verify` (gate widened to volunteer) + existing attendance route |
| Notifications | `mailer.ts` + email queue + cron (`email-queue`) — add 1–2 templates (assignment created/removed) |
| Status lifecycle | `admin/events/[id]/status` — untouched (ADMIN-only) |
| Student-facing portal | Unchanged (`/hackathons`, dashboard, portfolio) |
| Aggregation patterns | Dashboard/portfolio API pattern for the faculty responsibilities section |
| Faculty page | Extend `/innovation/faculty` with the responsibilities section; fix the DecisionEngine gate inconsistency |

Deliberately NOT reused/touched: no new roles, no token changes, no student
flow changes, no changes to event creation/status logic, no new
infrastructure (cron/email/queue all exist).

---

## Deliverable 11 — Risks & Mitigations

1. **Privilege escalation via assignment params.** A malicious actor must not
   pass an arbitrary `eventId` to act as judge. Mitigation: one centralized
   server-side helper (`hasEventResponsibility`) that (a) resolves the user's
   assignments, (b) checks status = ACTIVE, (c) checks the event exists and is
   in an eligible status for the action; every event-scoped route calls it —
   never inline ad-hoc queries.
2. **Conflicting/multiple responsibilities** (faculty = coordinator AND judge
   of the same event). Mitigation: allow it (common in practice); precedence
   rule — COORDINATOR grants the union of its permissions; when both exist,
   the coordinator scope wins for write conflicts (e.g., coordinator may
   screen while also judging). UI shows both chips.
3. **Faculty in multiple events.** No conflict by construction (scoping by
   eventId); the dashboard groups by event; context switches are pure URL
   state.
4. **Judge self-assignment / coordinator self-appointment.** Assignment
   creation endpoints enforce: ADMIN can assign anyone; coordinator can
   assign others but not themselves as COORDINATOR (and cannot assign an
   ADMIN as a subordinate responsibility unless the admin is also faculty —
   ADMIN bypasses anyway).
5. **Judge sees other judges' scores / coordinator edits judge scores.**
   Judge queries filter scores to own claims; coordinator view is
   read-only for scores (reopen-lock only, audited).
6. **Removal mid-judging.** Rule: REMOVED judge's drafts are discarded,
   scores they already submitted remain (they were validated), coordinator is
   prompted to reassign un-scored claims before the lock. If the lock already
   passed, the coordinator must reopen (audited) or the scores stand.
7. **Event deleted while assignments exist.** FK cascade (assignments are
   event-bound) — audit log keeps the history; notifications sent.
8. **Volunteer overreach.** Volunteer scoping is the tightest: QR verify +
   desk queue only; no claims/score read. `tickets/verify` gate changes from
   role-wide to role-OR-assignment (FACULTY keeps today's access to avoid
   regressions).
9. **Data leakage via list endpoints.** Every new/existing endpoint that
   becomes assignment-scoped must accept an `eventId` filter and apply the
   helper; default-deny when no scope is resolvable.
10. **Audit.** Assignment create/remove/reopen events go to an audit trail
    (reuse the pattern used for status changes) so accountability exists for
    coordinator actions.
11. **Migration on live DBs.** Any new table must follow the additive-only
    rule established in this project (verified safe on prod copy). No
    alteration of `users` beyond what exists.
12. **DecisionEngine inconsistency.** Fix the faculty-page review gate in the
    same pass (it currently shows faculty a UI whose write API is ADMIN-only).

---

## Final Blueprint — Summary

1. **Fit into existing architecture:** a single new join table
   (`EventAssignment`: event ↔ faculty ↔ responsibility ↔ status ↔ audit)
   following the existing `HackathonInterest` pattern, plus one new
   authorization helper layered on top of the untouched `authenticate`/
   `authorize`/JWT stack. The Role enum, login, tokens, student flows and
   event lifecycle remain unchanged.
2. **Faculty responsibilities:** four built-in duties (COORDINATOR, JUDGE,
   MENTOR, VOLUNTEER), each a set of event-scoped capabilities per the
   matrix in §3; multiple responsibilities across/within events allowed with
   coordinator-precedence.
3. **Permissions:** granted exclusively by ACTIVE assignments resolved
   server-side per request (`hasEventResponsibility`), never by the client;
   ADMIN remains a universal bypass; assignments carry no global power.
4. **Judging:** assigned judges access a scoped queue (reused engine/UI),
   score via the existing config-driven sync, locked by an event judging
   deadline (submissionLockAt pattern); coordinator/ADMIN monitor progress
   and publish via the existing status route.
5. **Mentoring:** assignment → team subset → meetings/feedback/progress →
   completion, all read/write over existing claim/submission/attendance data.
6. **Coordination:** per-event operational console (registrations, faculty
   assignments, judging oversight, attendance, announcements, reports) with
   hard boundaries: status changes, deletion, featured and global settings
   stay ADMIN-owned.
7. **Delivery shape:** additive schema migration (1 table + index), ~2 new
   route groups (assignments CRUD + responsibilities dashboard aggregation),
   1 new auth helper, gate widening on 2 existing routes (sync,
   tickets/verify), 1 faculty dashboard section, 2 email templates — reusing
   the queue, cron, scoring engine, rubrics, tickets, and portal unchanged.

### Open questions for the review (to be answered before approval)

1. Should judging rounds (per-round judge assignment) be in scope for v1, or
   single-round judging first?
2. Should INDUSTRY_PARTNER be assignable as JUDGE/MENTOR/VOLUNTEER, or
   faculty-only?
3. Keep today's FACULTY-wide ticket-verify access, or narrow it to
   assignments going forward?
4. Is a coordinator REQUIRED per event (enforced at creation), or optional
   (ADMIN operates directly when absent)?
5. Should REMOVED assignments preserve their historical scores/feedback
   (recommended: yes) or fully purge?
