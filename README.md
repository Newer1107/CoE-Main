# TCET Center of Excellence Portal

Production-oriented Next.js App Router portal for TCET CoE with:
- role-based authentication and access control
- student facility booking and admin moderation
- faculty/admin content publishing (news, events, grants, announcements)
- innovation platform with separated open-statement and hackathon tracks
- open-statement lifecycle controls (`OPENED` / `CLOSED`) with faculty result release control
- two-stage hackathon evaluation (PPT screening -> final judging)
- rubric-based scoring for both hackathon judging and open-statement reviews
- email notifications and cron-driven reminders
- MinIO-backed object storage with browser-safe proxying
- Google Analytics 4 instrumentation for auth, booking, innovation, and homepage engagement events

## Table of Contents

1. System Overview
2. Feature Matrix by Role
3. Technical Stack
4. Architecture and Core Flows
5. Data Model
6. App Routes and UX Flows
7. API Reference
8. Environment Configuration
9. Local Development
10. Analytics (GA4)
11. Deployment Notes
12. Operational Runbook
13. Security Model
14. Troubleshooting
15. Verification Checklist

## 1) System Overview

The portal serves three authenticated personas plus public visitors:
- Students: register, verify OTP, login, book facilities, participate in innovation
- Faculty: manage content, create and review innovation/hackathon workflows
- Admin: operational moderation, analytics, and platform governance
- Public: browse homepage content and innovation landing/event pages

Major capability groups:
- Public content feed: news, grants, events, announcements, hero slides
- Facility booking: student request lifecycle with admin confirm/reject and reminders
- Innovation platform:
  - Open statements: students register teams with UID verification and mandatory technical doc + PPT
  - Open statement results: faculty can review early but release results only after statement closure
  - Hackathon track: event registration, problem statements, staged faculty judging, leaderboard

## 2) Feature Matrix by Role

| Capability | Public | Student | Faculty | Admin |
|---|---:|---:|---:|---:|
| View homepage feeds | Yes | Yes | Yes | Yes |
| Register account | No | Yes | Yes | No |
| Verify OTP / reset password via OTP | No | Yes | Yes | Yes |
| Login / logout / refresh session | No | Yes | Yes | Yes |
| Create facility booking | No | Yes | No | No |
| Cancel own pending booking | No | Yes | No | No |
| Access faculty content portal | No | No | Yes | Yes |
| Create news/events/grants/announcements | No | No | Yes | Yes |
| Manage hero slides | No | No | No | Yes |
| View innovation landing and event pages | Yes | Yes | Yes | Yes |
| Register for open statements | No | Yes | No | No |
| Upload open submission docs (technical + PPT) | No | Yes | No | No |
| Register team for hackathon event | No | Yes | No | No |
| Review open/hackathon innovation submissions | No | No | Yes | Yes |
| Create hackathon events and problem sets | No | No | Yes | Yes |
| Change hackathon stage status | No | No | Yes (own events) | Yes |
| Open/close open statements and publish results | No | No | Yes (own statements) | Yes |
| Moderate faculty users | No | No | No | Yes |
| Moderate bookings and view admin stats | No | No | No | Yes |

## 3) Technical Stack

- Framework: Next.js 16.2.1 (App Router)
- Runtime: Node.js
- Language: TypeScript
- UI: React 19 + Tailwind CSS v4
- Analytics: Google Analytics 4 via `@next/third-parties`
- Database: MySQL + Prisma ORM
- Auth: JWT access/refresh in httpOnly cookies
- Validation: Zod
- Email: Nodemailer (SMTP)
- Storage: MinIO (S3-compatible)
- Scheduled jobs: cron-triggered route handlers

## 4) Architecture and Core Flows

### 4.1 High-level architecture

```mermaid
flowchart TD
  B[Browser] --> N[Next.js App]
  N --> P[Pages and Server Components]
  N --> R[Route Handlers: /api/*]
  R --> A[Auth and RBAC]
  R --> D[(MySQL via Prisma)]
  R --> M[SMTP via Nodemailer]
  R --> S[MinIO Object Store]
  C[Scheduler] --> CR1[GET /api/cron/reminder]
  C --> CR2[GET /api/cron/innovation-reminder]
  CR1 --> R
  CR2 --> R
```

### 4.2 Session lifecycle

- Login sets `accessToken` (short-lived) and `refreshToken` (long-lived)
- Protected APIs validate token via cookie or bearer token
- Refresh endpoint rotates access token
- Logout clears auth cookies
- Page-level redirects enforce role boundaries

### 4.3 Booking lifecycle

```mermaid
flowchart LR
  S[Student] --> B1[POST /api/bookings]
  B1 --> PENDING[PENDING]
  PENDING --> A1[PATCH /api/admin/bookings/:id/confirm]
  PENDING --> A2[PATCH /api/admin/bookings/:id/reject]
  PENDING --> CXL[DELETE /api/bookings/:id]
  A1 --> CONF[CONFIRMED]
  A2 --> REJ[REJECTED]
  CXL --> CAN[CANCELLED]
  CONF --> REM[GET /api/cron/reminder]
```

### 4.4 Hackathon full workflow (conduct flow)

```mermaid
flowchart TD
  subgraph FAC[Faculty or Admin]
    HC1[Create hackathon event + timeline + problems]
    HC2[Move event status to ACTIVE]
    HC3[Registered Teams queue in Faculty Workspace - Events tab]
    HC4[Stage 1 sync: SCREENING]
    HC5[Mark attendance for shortlisted teams]
    HC6[Stage 2 sync: JUDGING with rubric]
    HC7[Move event status to CLOSED]
  end

  subgraph STU[Student Team]
    HS1[Open event page]
    HS2[Register team with UID verification + PPT or PDF]
  end

  subgraph SYS[System]
    HY1[Claim created with status SUBMITTED]
    HY2[Claim status becomes SHORTLISTED or REJECTED]
    HY3[Absent teams excluded from judging]
    HY4[Final decision ACCEPTED or REJECTED + scores persisted]
    HY5[Leaderboard available on event page]
    HY6[Notification emails sent at stage transitions]
  end

  HC1 --> HC2
  HS1 --> HS2
  HS2 --> HY1
  HC2 --> HC3
  HY1 --> HC3
  HC3 --> HC4
  HC4 --> HY2
  HY2 --> HC5
  HC5 --> HY3
  HY3 --> HC6
  HC6 --> HY4
  HY4 --> HC7
  HC7 --> HY5
  HC2 --> HY6
  HC4 --> HY6
  HC6 --> HY6
  HC7 --> HY6
```

### 4.5 Hackathon event structure (domain view)

```mermaid
flowchart TD
  HE[HackathonEvent\nstatus: UPCOMING or ACTIVE or CLOSED\nregistrationOpen: true or false\npptFileKey: optional] --> P[Problem statements\nmode: CLOSED]
  P --> C[Claim per team\nstatus lifecycle: IN_PROGRESS -> SUBMITTED -> SHORTLISTED -> ACCEPTED or REJECTED\nattendance flag: isAbsent]
  C --> CM[ClaimMember list\nLEAD + MEMBER]
  C --> SF[Submission assets\nsubmissionFileKey or submissionUrl]
  C --> RB[Rubric scores\ninnovation, technical, impact, ux, execution, presentation, feasibility]
  RB --> FS[finalScore and score]

  ST[Student] -->|register with PPT| C
  FC[Faculty or Admin] -->|screening + judging sync| C
  CR[Innovation reminder cron] -->|activate events + reminders + active notifications| HE
```

### 4.6 Hackathon end-to-end sequence

```mermaid
sequenceDiagram
  participant S as Student Team
  participant E as /api/innovation/events/:id/register
  participant DB as Prisma DB
  participant F as Faculty Workspace
  participant AD as /api/innovation/admin/events/:id/status
  participant SY as /api/innovation/faculty/claims/sync
  participant M as Mailer
  participant L as /api/innovation/events/:id/leaderboard

  S->>E: Register team + upload PPT
  E->>DB: Create claim + upload file + set status SUBMITTED

  F->>AD: Move event UPCOMING to ACTIVE
  AD->>M: Send active-phase event notification

  F->>SY: Stage=SCREENING (SHORTLISTED or REJECTED)
  SY->>DB: Update claim status
  SY->>M: Send screening result email

  F->>SY: Stage=JUDGING (ACCEPTED or REJECTED + rubrics, present shortlisted teams only)
  SY->>DB: Persist rubrics + finalScore
  SY->>M: Send final score email

  F->>AD: Move event ACTIVE to CLOSED
  AD->>M: Send winners announcement emails

  S->>L: View leaderboard (CLOSED only)
  L->>DB: Rank by finalScore then score
```

### 4.7 Open problem statement full workflow (conduct flow)

```mermaid
flowchart TD
  subgraph FAC[Faculty or Admin]
    OP1[Create open problem statement]
    OP2[Problem status defaults to OPENED]
    OP3[Review in Faculty Workspace - Submissions tab]
    OP4[Save decision and rubric ACCEPTED or REVISION_REQUESTED or REJECTED]
    OP5[Close statement in Faculty Workspace - Problems tab]
  end

  subgraph STU[Student Team]
    OS1[Open problem board]
    OS2[Register with team UIDs]
    OS3[Upload technical doc + PPT]
  end

  subgraph SYS[System]
    OY1[UID lookup eligibility check]
    OY2[OpenSubmission created]
    OY3[Review saved but result hidden while statement is OPENED]
    OY4[On CLOSE: publish results + set resultPublishedAt]
    OY5[Students can view score, feedback, badges]
    OY6[Result release emails sent]
  end

  OP1 --> OP2
  OS1 --> OS2
  OS2 --> OY1
  OY1 --> OS3
  OS3 --> OY2
  OY2 --> OP3
  OP3 --> OP4
  OP4 --> OY3
  OY3 --> OP5
  OP5 --> OY4
  OY4 --> OY5
  OY4 --> OY6
```

### 4.8 Open statement end-to-end sequence

```mermaid
sequenceDiagram
  participant F as Faculty or Admin
  participant S as Student Team
  participant U as /api/innovation/users/lookup
  participant O as /api/innovation/open-submissions
  participant R as /api/innovation/faculty/open-submissions/:id/review
  participant P as /api/innovation/problems/:id
  participant DB as Prisma DB
  participant M as Mailer

  F->>DB: Create OPEN statement (status OPENED)
  S->>U: Validate team UIDs for problem
  U->>S: Eligible UID results
  S->>O: Submit registration + technical doc + PPT
  O->>DB: Create OpenSubmission

  F->>R: Save review decision + rubric
  R->>DB: Persist review and scores
  Note over DB,S: Result hidden until statement is CLOSED

  F->>P: Update problem status CLOSED
  P->>DB: Set resultPublishedAt on related open submissions
  P->>M: Send release emails
  S->>DB: View published scores and feedback
```

## 5) Data Model

Primary entities:
- `User` (role/status/verification)
- `Otp` (verification/reset OTP)
- `Booking`
- `NewsPost`
- `Grant`
- `Event`
- `Announcement`
- `HeroSlide`
- `HackathonEvent`
- `Problem`
- `Claim`
- `ClaimMember`
- `OpenSubmission`
- `OpenSubmissionMember`

Key innovation enums and lifecycle:
- `ProblemMode`: `OPEN`, `CLOSED`
- `ProblemStatus`: `OPENED`, `CLOSED`, `ARCHIVED`
- `ClaimStatus`: `IN_PROGRESS`, `SUBMITTED`, `SHORTLISTED`, `ACCEPTED`, `REVISION_REQUESTED`, `REJECTED`
- `EventStatus`: `UPCOMING`, `ACTIVE`, `JUDGING`, `CLOSED`
  - operational transition flow currently used: `UPCOMING -> ACTIVE -> CLOSED`
  - `JUDGING` remains as a compatibility enum value

Scoring fields persisted on `Claim` for hackathon judging:
- `innovationScore`, `technicalScore`, `impactScore`, `uxScore`, `executionScore`, `presentationScore`, `feasibilityScore`
- `finalScore` and `score`
- `isAbsent` tracks judging-round attendance for shortlisted teams

Scoring and release fields persisted on `OpenSubmission`:
- rubric scores: `innovationScore`, `technicalScore`, `impactScore`, `uxScore`, `executionScore`, `presentationScore`, `feasibilityScore`
- `finalScore` and `score`
- `resultPublishedAt` controls student-side result visibility

## 6) App Routes and UX Flows

Public/common pages:
- `/`
- `/about`
- `/laboratory`
- `/innovation`
- `/innovation/events/[id]`

Auth pages:
- `/login`
- `/forgot-password`

Protected pages:
- `/facility-booking` (student)
- `/faculty` (faculty/admin)
- `/admin` (admin)
- `/innovation/problems` (student/faculty/admin)
- `/innovation/my-submissions` (student)
- `/innovation/faculty` (faculty/admin)

Navigation and access behavior:
- Navbar is role-aware (faculty/admin links hidden from unauthorized users)
- Login supports `next` redirect for student return flow
- Admin/faculty pages hard-redirect unauthorized users

### 6.1 Hackathon page-level flow

```mermaid
flowchart LR
  IH[Innovation Landing Page] --> ED[Event Detail Page]
  ED --> RF[Register Team form\nStudent only]
  ED --> LB[Leaderboard\nvisible in CLOSED only]
  IF[Faculty Workspace] --> ET[Events tab]
  ET --> TM[Registered Teams queue\nPending, Shortlisted, Absent, Rejected]
  TM --> SC[Stage 1: PPT screening sync]
  TM --> JG[Stage 2: final judging sync + rubric during ACTIVE]
```

Route mapping for this flow:
- Innovation landing page: `/innovation`
- Event detail page: `/innovation/events/[id]`
- Faculty workspace: `/innovation/faculty`

### 6.2 Open statement page-level flow

```mermaid
flowchart LR
  IP[Innovation Problems page] --> OR[Student registration form]
  OR --> UV[Fetch UID details]
  UV --> US[Submit open statement files]
  FW[Faculty Workspace] --> PS[Problems tab\nCreate and close statements]
  FW --> SS[Submissions tab\nOpen Statement submissions only]
  SS --> SR[Save rubric + decision]
  PS --> RP[Close statement and publish results]
```

Current UX notes:
- On `/innovation`, `Open Problem Statements` is hidden for `FACULTY` users.
- In Faculty Workspace, the `Submissions` section is dedicated to open statements; hackathon team review runs in `Events -> Registered Teams`.

## 7) API Reference

Response envelope pattern:
- `success: boolean`
- `message: string`
- `data: payload | null`
- `errors: []` on failures

### 7.1 Auth APIs

- `POST /api/auth/register/student`
- `POST /api/auth/register/faculty`
- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### 7.2 Booking APIs

- `POST /api/bookings` (student)
- `GET /api/bookings` (guidance response)
- `GET /api/bookings/my` (authenticated user)
- `DELETE /api/bookings/[id]` (student own pending booking)

### 7.3 Admin APIs

- `GET /api/admin/stats` (admin)
- `GET /api/admin/users` (admin)
- `GET /api/admin/bookings` (admin)
- `PATCH /api/admin/bookings/[id]/confirm` (admin)
- `PATCH /api/admin/bookings/[id]/reject` (admin)
- `PATCH /api/admin/faculty/[id]/approve` (admin)
- `PATCH /api/admin/faculty/[id]/reject` (admin)

### 7.4 Content APIs

News:
- `GET /api/news` (public)
- `POST /api/news` (faculty/admin)
- `PATCH /api/news/[id]` (faculty/admin)
- `DELETE /api/news/[id]` (admin)

Events:
- `GET /api/events` (public)
- `POST /api/events` (faculty/admin)
- `PATCH /api/events/[id]` (faculty/admin)
- `DELETE /api/events/[id]` (faculty/admin)

Grants:
- `GET /api/grants` (public)
- `POST /api/grants` (faculty/admin)
- `PATCH /api/grants/[id]` (faculty/admin)
- `DELETE /api/grants/[id]` (admin)

Announcements:
- `GET /api/announcements` (public, non-expired)
- `POST /api/announcements` (faculty/admin)
- `DELETE /api/announcements/[id]` (faculty/admin)

Hero slides:
- `GET /api/hero-slides` (public)
- `POST /api/hero-slides` (admin, multipart image)

### 7.5 Innovation APIs

Problems:
- `GET /api/innovation/problems`
  - Public users can access open track (`track=open`)
  - Hackathon/all tracks require faculty/admin
- `POST /api/innovation/problems` (faculty/admin)
  - Open statements are created with `status=OPENED` by default
- `PATCH /api/innovation/problems/[id]` (owner faculty or admin)
  - For open statements: changing status to `CLOSED` publishes pending results
- `DELETE /api/innovation/problems/[id]` (admin)

Claims:
- `POST /api/innovation/claims` (student)
  - Open-track claim creation is deprecated and returns migration guidance
- `GET /api/innovation/claims/my` (student)
- `PATCH /api/innovation/claims/[id]/submit` (student team member)
- `PATCH /api/innovation/faculty/claims/[id]/review` (owner faculty or admin)

Open submissions:
- `POST /api/innovation/open-submissions` (student)
- `GET /api/innovation/faculty/open-submissions` (faculty/admin)
- `PATCH /api/innovation/faculty/open-submissions/[id]/review` (owner faculty or admin)
  - Accept/reject decisions require rubric payload
  - Save is immediate, student results remain hidden until statement closure

Hackathon events:
- `GET /api/innovation/events` (public)
- `POST /api/innovation/events` (faculty/admin)
- `PATCH /api/innovation/events/[id]` (creator faculty or admin)
- `POST /api/innovation/events/[id]/register` (student)
- `GET /api/innovation/events/[id]/leaderboard` (event must be `CLOSED`)

Event stage controls and review:
- `PATCH /api/innovation/admin/events/[id]/status` (admin, or creator faculty)
- `GET /api/innovation/admin/submissions` (admin)
- `GET /api/innovation/faculty/submissions` (faculty/admin)
- `PATCH /api/innovation/faculty/claims/sync` (faculty/admin)
- `PATCH /api/innovation/faculty/claims/[id]/attendance` (owner faculty or admin)
  - Stage-aware payload:
    - `stage=SCREENING`: decision statuses `SHORTLISTED` or `REJECTED`
    - `stage=JUDGING`: decision statuses `ACCEPTED` or `REJECTED`, rubrics required, absent teams excluded

### 7.6 Utility and Ops APIs

- `GET /api/storage/[...path]` (proxy stream for MinIO object access)
- `GET /api/health`
- `POST /api/seed`
- `GET /api/cron/reminder`
- `GET /api/cron/innovation-reminder`

## 8) Environment Configuration

Required variables:

```bash
DATABASE_URL="mysql://user:password@localhost:3306/coe_main"
JWT_ACCESS_SECRET="change-me-access"
JWT_REFRESH_SECRET="change-me-refresh"

ADMIN_EMAIL="admin@tcetmumbai.in"
ADMIN_PASSWORD="AdminPassword123"
ADMIN_NAME="CoE Admin"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="app-password"
SMTP_FROM="TCET CoE <noreply@tcetmumbai.in>"

MINIO_ENDPOINT="localhost"
MINIO_PORT=9000
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_USE_SSL=false
MINIO_BUCKET="coe-assets"

NEXT_PUBLIC_GA_ID="G-XXXXXXXXXX"
```

Optional variables:
- `NEXT_PUBLIC_APP_URL`
- `FRONTEND_URL`
- `MINIO_USE_PROXY=true|false`

## 9) Local Development

```bash
npm install
npm run db:migrate:status
npm run db:migrate
npm run dev
```

No-reset migration workflow (recommended):

```bash
# 1) change prisma/schema.prisma

# 2) create migration SQL from current DB -> schema (no reset)
npm run db:migrate:create -- --name describe_change

# 3) apply pending migrations without reset
npm run db:migrate
```

Important:
- Do not run `npx prisma migrate dev` for routine apply operations in this repository.
- Use `npm run db:migrate` (`prisma migrate deploy`) to apply safely without reset prompts.
- Create forward-only migrations; do not edit already-applied migration files.

Validation:

```bash
npm run lint
npm run build
```

Seed admin account:

```bash
curl -X POST http://localhost:3000/api/seed
```

## 10) Analytics (GA4)

Integration overview:
- GA script is mounted in the root layout through `@next/third-parties/google`
- Event dispatch uses a shared helper in `src/lib/analytics.ts`
- Analytics calls are wrapped to avoid blocking UI behavior
- Event payloads intentionally avoid PII (no raw names/emails/passwords)

Tracked events:
- `login` and `login_failed`
- `sign_up` and `sign_up_failed`
- `hackathon_register`
- `open_statement_register`
- `open_statement_docs_uploaded`
- `innovation_registration_failed`
- `booking_created`
- `booking_failed`
- `booking_cancelled`
- `content_viewed` (news, grants, announcements, events)
- `hero_cta_clicked`

Quick validation in GA DebugView:
- Set `NEXT_PUBLIC_GA_ID` in `.env.local`
- Run the app locally and trigger login/register, booking, and innovation actions
- Verify events appear in GA4 DebugView with expected non-PII parameters

## 11) Deployment Notes

MinIO transport:
- Supports host-style and URL-style endpoint values
- For HTTPS app + HTTP MinIO, use storage proxy route (`/api/storage/[...path]`)

Cookies:
- `httpOnly=true`
- `sameSite=lax`
- `secure=true` in production

SMTP:
- For Gmail, use app password and SMTP-enabled account settings

## 12) Operational Runbook

Booking reminder job:
- Endpoint: `GET /api/cron/reminder`
- Behavior:
  - reminders for confirmed bookings starting in next 30 minutes
  - marks `reminderSent=true`
  - cleans expired OTP records

Innovation reminder job:
- Endpoint: `GET /api/cron/innovation-reminder`
- Behavior:
  - transitions `UPCOMING -> ACTIVE` when start time is reached
  - sends active-phase participant notifications at activation
  - sends event ending reminders
  - does not auto-close events; closure is a manual status control

Operational health:
- `GET /api/health`

## 13) Security Model

- Passwords hashed with bcrypt
- Access/refresh token secrets from environment
- Route guards use centralized `authenticate()` + `authorize()`
- Forgot-password flow uses non-enumerating response behavior
- Password reset requires valid OTP within TTL window
- Role-based page redirects reduce unauthorized surface area in UI

## 14) Troubleshooting

`401` on protected actions:
- Access token expired; refresh flow should issue a new access token

Mixed-content or broken media URLs:
- Use `/api/storage/[...path]` proxy for non-SSL MinIO setups

`/api/seed` returns `405`:
- Use `POST`, not `GET`

Leaderboard endpoint failing:
- Verify event status is `CLOSED`

Final judging sync failing:
- Ensure event status is `ACTIVE`
- Ensure only present shortlisted claims are included
- If a shortlisted team was marked absent, mark it present first
- Ensure all rubric fields are present

Open statement result not visible to students:
- Ensure the statement was moved to `CLOSED`
- Confirm `resultPublishedAt` is set on related `open_submissions`

Prisma migrate drift warning after editing historical migrations:
- Prisma may require a dev database reset to reconcile history
- Prefer creating a new forward migration instead of editing an already-applied migration file

Avoiding "All data will be lost" reset prompts:
- Use `npm run db:migrate:create -- --name <change_name>` for new migration files
- Use `npm run db:migrate` to apply pending migrations safely
- Avoid `npx prisma migrate dev` unless you intentionally accept reset behavior in throwaway environments

## 15) Verification Checklist

Before release:
- `npm run build`
- Verify auth flows (register, OTP verify, login, forgot/reset password)
- Verify student booking lifecycle and admin moderation
- Verify faculty content create/update/delete flows with uploads
- Verify innovation two-stage flow:
  - registration/submission
  - screening sync
  - shortlist and absent-team visibility
  - judging sync with rubric scoring for present teams
  - leaderboard output
- Verify open-statement separated flow:
  - statement creation defaults to `OPENED`
  - student open registration with UID verification + mandatory technical doc + PPT
  - faculty rubric review in open-submissions lane
  - result remains hidden in student view until statement is moved to `CLOSED`
  - closure publishes results and triggers release emails
- Verify reminder cron endpoints
- Ensure `.env` secrets are not committed
