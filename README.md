# TCET Center of Excellence Portal

Production-oriented Next.js App Router portal for TCET CoE with:
- role-based authentication and access control
- student facility booking and admin moderation
- faculty/admin content publishing (news, events, grants, announcements)
- innovation platform with separated open-problem and hackathon tracks
- application-based open-problem workflow (student profile + custom problem questions)
- two-stage hackathon evaluation (PPT screening -> final judging)
- rubric-based scoring for hackathon judging
- faculty application review notifications (selected/rejected email)
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
  - Open problems: students maintain reusable profile, answer faculty questions, submit individual applications
  - Faculty application review: select/reject + feedback + notification emails
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
| Create student profile for open problems | No | Yes | No | No |
| Apply to open problems | No | Yes | No | No |
| Register team for hackathon event | No | Yes | No | No |
| Review open-problem applications | No | No | Yes | Yes |
| Review hackathon submissions | No | No | Yes | Yes |
| Create hackathon events and problem sets | No | No | Yes | Yes |
| Change hackathon stage status | No | No | Yes (own events) | Yes |
| Manage open problem status (`OPENED`/`CLOSED`/`ARCHIVED`) | No | No | Yes (own problems) | Yes |
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

### 4.7 Open problem application workflow (conduct flow)

```mermaid
flowchart TD
  subgraph FAC[Faculty or Admin]
    OP1[Create open problem]
    OP2[Problem status defaults to OPENED]
    OP3[Add custom questions]
    OP4[Review in Faculty Applications workspace]
    OP5[Save decision SELECTED or REJECTED + feedback]
  end

  subgraph STU[Student]
    OS1[Open problem board]
    OS2[Complete profile once\nskills, experience, interests, resume]
    OS3[Answer problem-specific questions]
    OS4[Submit application]
  end

  subgraph SYS[System]
    OY1[StudentProfile persisted and reused]
    OY2[Application + ApplicationAnswer created]
    OY3[Faculty review updates status and feedback]
    OY4[Selection/rejection email sent to student]
    OY5[Student views status in My Applications]
  end

  OP1 --> OP2
  OP2 --> OP3
  OS1 --> OS2
  OS2 --> OS3
  OS3 --> OS4
  OS4 --> OY1
  OY1 --> OY2
  OY2 --> OP4
  OP4 --> OP5
  OP5 --> OY3
  OY3 --> OY4
  OY4 --> OY5
```

### 4.8 Open problem application end-to-end sequence

```mermaid
sequenceDiagram
  participant F as Faculty or Admin
  participant S as Student
  participant PC as /api/profile/check-completion
  participant PR as /api/profile
  participant Q as /api/innovation/problems/:id/questions
  participant A as /api/innovation/applications
  participant FR as /api/innovation/faculty/applications/:id/review
  participant DB as Prisma DB
  participant M as Mailer

  F->>DB: Create open problem (status OPENED)
  S->>PC: Check profile completion
  PC->>S: Incomplete
  S->>PR: Create or update profile
  S->>Q: Fetch custom questions
  S->>A: Submit answers
  A->>DB: Create Application + ApplicationAnswer

  F->>FR: Save SELECTED or REJECTED + feedback
  FR->>DB: Persist status + feedback
  FR->>M: Send selection/rejection email
  S->>DB: View updated status in My Applications
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
- `StudentProfile`
- `ProblemQuestion`
- `Application`
- `ApplicationAnswer`

Key innovation enums and lifecycle:
- `ProblemMode`: `OPEN`, `CLOSED`
- `ProblemStatus`: `OPENED`, `CLOSED`, `ARCHIVED`
- `ApplicationStatus`: `SUBMITTED`, `SELECTED`, `REJECTED`
- `ClaimStatus`: `IN_PROGRESS`, `SUBMITTED`, `SHORTLISTED`, `ACCEPTED`, `REVISION_REQUESTED`, `REJECTED`
- `EventStatus`: `UPCOMING`, `ACTIVE`, `JUDGING`, `CLOSED`
  - operational transition flow currently used: `UPCOMING -> ACTIVE -> JUDGING -> CLOSED`

Scoring fields persisted on `Claim` for hackathon judging:
- `innovationScore`, `technicalScore`, `impactScore`, `uxScore`, `executionScore`, `presentationScore`, `feasibilityScore`
- `finalScore` and `score`
- `isAbsent` tracks judging-round attendance for shortlisted teams

Open-problem application fields persisted on `Application`:
- `status`: `SUBMITTED`, `SELECTED`, `REJECTED`
- `feedback`: faculty decision notes
- profile linkage via `profileId`
- custom responses via `ApplicationAnswer`

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
- `/admin?tab=innovation` (admin hackathon control center)
- `/innovation/problems` (student/faculty/admin)
- `/innovation/profile` (student)
- `/innovation/my-applications` (student)
- `/innovation/my-submissions` (student)
- `/innovation/faculty` (faculty/admin)
- `/innovation/faculty/problems/create` (faculty/admin)
- `/innovation/faculty/applications` (faculty/admin)

Navigation and access behavior:
- Navbar is role-aware (faculty/admin links hidden from unauthorized users)
- Admin account menu includes `Hackathon Control Center` shortcut to `/admin?tab=innovation`
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

### 6.2 Open problem application page-level flow

```mermaid
flowchart LR
  IP[Innovation Problems page] --> PM[Profile completion check]
  PM --> AP[Apply modal\nquestion answers]
  AP --> SA[Submit Application]
  FW[Faculty Workspace] --> PS[Problems tab\nmanage OPENED/CLOSED/ARCHIVED]
  FW --> AR[Applications tab\nreview SUBMITTED applications]
  AR --> RV[Mark SELECTED/REJECTED + feedback]
  RV --> MY[Student My Applications page]
```

Current UX notes:
- Students are prompted globally to complete profile before applying (`ProfileCompletionModal`).
- Faculty open-problem review runs in `/innovation/faculty/applications`.
- Legacy open-submissions compatibility endpoints were removed; application routes are now canonical.

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
  - Open problems are created with `status=OPENED` by default
  - Supports optional `questions` payload for problem-specific application questions
- `PATCH /api/innovation/problems/[id]` (owner faculty or admin)
  - Used for status and metadata updates (`OPENED` / `CLOSED` / `ARCHIVED`)
- `DELETE /api/innovation/problems/[id]` (admin)

Profile and completion:
- `GET /api/profile` (student)
- `POST /api/profile` (student)
- `PATCH /api/profile` (student)
- `GET /api/profile/check-completion` (student)

Open-problem questions and applications:
- `GET /api/innovation/problems/[id]/questions` (authenticated)
- `POST /api/innovation/problems/[id]/questions` (faculty/admin)
- `POST /api/innovation/applications` (student)
- `GET /api/innovation/applications/my` (student)

Faculty applications review:
- `GET /api/innovation/faculty/applications` (faculty/admin)
- `PATCH /api/innovation/faculty/applications/[id]/review` (faculty/admin)
  - statuses: `SUBMITTED`, `SELECTED`, `REJECTED`
  - sends selection/rejection notification emails

Claims:
- `POST /api/innovation/claims` (student)
  - Open-track claim creation is deprecated; use applications APIs for open problems
- `GET /api/innovation/claims/my` (student)
- `PATCH /api/innovation/claims/[id]/submit` (student team member)
- `PATCH /api/innovation/faculty/claims/[id]/review` (owner faculty or admin)

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

### 11.1 Docker Deployment (App + MySQL)

Docker files included in repository:
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.docker.example`
- `scripts/docker-entrypoint.sh`

Steps:
1. Copy environment template.
```bash
cp .env.docker.example .env.docker
```
2. Update `.env.docker` with real secrets and infrastructure values (SMTP, MinIO, JWT, GA).
3. Build and start services.
```bash
docker compose --env-file .env.docker up --build -d
```
4. Check logs.
```bash
docker compose --env-file .env.docker logs -f app
```
5. Open app at `http://localhost:3000`.

Useful operations:
```bash
# stop containers
docker compose --env-file .env.docker down

# stop containers and remove DB volume
docker compose --env-file .env.docker down -v

# run migrations manually
docker compose --env-file .env.docker exec app npx prisma migrate deploy
```

Notes:
- `DATABASE_URL` in `.env.docker` must use host `db` (compose service name) for local compose networking.
- App startup runs `prisma migrate deploy` automatically when `RUN_MIGRATIONS=true`.
- For external managed MySQL, remove/disable the `db` service in compose and set `DATABASE_URL` to external host.

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

Application decision not visible in student portal:
- Ensure review status for the application is `SELECTED` or `REJECTED`
- Confirm student checks `/innovation/my-applications` (or `GET /api/innovation/applications/my`)
- If email is missing, verify SMTP configuration; status updates still persist even if mail fails

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
- Verify open-problem application flow:
  - student profile completion gate before apply
  - application submission with dynamic problem questions
  - faculty/admin review via applications lane
  - student decision visibility in My Applications
  - selection/rejection emails are sent (best-effort)
- Verify reminder cron endpoints
- Ensure `.env` secrets are not committed
