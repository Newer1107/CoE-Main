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

### 1.1 System Component Architecture

```mermaid
graph TB
  subgraph "Client Layer"
    B[Browser/Web Client]
    M[Mobile Browser]
  end

  subgraph "Next.js Application"
    L[Root Layout + Auth Context]
    PC[Pages & Server Components]
    PSC[Protected Pages]
    CC[Client Components]
    PUB[Public Pages]
  end

  subgraph "API Layer"
    RH["Route Handlers (/api)"]
    AUTH["Auth APIs"]
    CONTENT["Content APIs"]
    INNOV["Innovation APIs"]
    ADMIN["Admin APIs"]
    UTIL["Utility APIs"]
  end

  subgraph "Service Layer"
    JWT["JWT Manager"]
    AUTH_SVC["Authentication"]
    AUTH_Z["Authorization/RBAC"]
    MAIL["Mailer Service"]
    STORAGE["Storage Service"]
    SCORE["Scoring Engine"]
  end

  subgraph "External Services & Storage"
    DB[(MySQL Database)]
    MINIO["MinIO Object Store"]
    SMTP["SMTP Server"]
    GA["Google Analytics 4"]
    CRON["Scheduler/Cron"]
  end

  B --> L
  M --> L
  L --> PC
  PC --> PSC
  PC --> PUB
  PSC --> CC
  PUB --> CC

  PC --> RH
  CC --> RH
  RH --> AUTH
  RH --> CONTENT
  RH --> INNOV
  RH --> ADMIN
  RH --> UTIL

  AUTH --> JWT
  AUTH --> AUTH_SVC
  CONTENT --> AUTH_Z
  INNOV --> AUTH_Z
  ADMIN --> AUTH_Z
  UTIL --> AUTH_Z

  AUTH_SVC --> DB
  AUTH_Z --> DB
  MAIL --> SMTP
  STORAGE --> MINIO
  SCORE --> DB
  GA --> GA

  CRON --> AUTH
  CRON --> MAIL
  CRON --> DB
```

### 1.2 Feature Module Organization

```mermaid
graph LR
  subgraph "Core"
    AUTH["Authentication"]
    USER["User Management"]
  end

  subgraph "Content Management"
    NEWS["News Feed"]
    GRANTS["Grants"]
    EVENTS["Events"]
    ANNOUN["Announcements"]
    HERO["Hero Slides"]
  end

  subgraph "Facility Management"
    BOOK["Booking System"]
  end

  subgraph "Innovation Platform"
    subgraph "Open Problems Track"
      PROF["Student Profile"]
      PROB["Problems"]
      APP["Applications"]
    end

    subgraph "Hackathon Track"
      HACK["Hackathon Events"]
      CLAIM["Team Claims"]
      SCORE["Scoring"]
      LB["Leaderboard"]
    end
  end

  subgraph "Operations"
    ADMIN_OPS["Admin Panel"]
    STATS["Analytics/Stats"]
  end

  AUTH --> USER
  USER --> BOOK
  USER --> PROF
  USER --> APP
  PROF --> APP
  PROF --> CLAIM
  PROB --> APP
  HACK --> CLAIM
  CLAIM --> SCORE
  SCORE --> LB
  ADMIN_OPS --> STATS
```

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
- Email: Nodemailer (SMTP) with durable DB-backed queue (`email_jobs`)
- Storage: MinIO (S3-compatible)
- Scheduled jobs: cron-triggered route handlers + email queue worker

## 4) Architecture and Core Flows

### 4.1 High-level architecture

```mermaid
flowchart TD
  B[Browser] --> N[Next.js App]
  N --> P[Pages and Server Components]
  N --> R[Route Handlers: /api/*]
  R --> A[Auth and RBAC]
  R --> D[(MySQL via Prisma)]
  R --> M[Email Dispatcher + Queue]
  R --> S[MinIO Object Store]
  C[Scheduler] --> CR1[GET /api/cron/reminder]
  C --> CR2[GET /api/cron/innovation-reminder]
  C --> CR3[GET /api/cron/email-queue]
  CR1 --> R
  CR2 --> R
```

### 4.1a Data Flow Through Core Workflows

```mermaid
graph LR
  subgraph "Input Sources"
    WEB["Web Form<br/>Client Input"]
    API_VER["API Verification<br/>OTP/Password"]
    FILE["File Upload<br/>PPT/Resume"]
  end

  subgraph "Processing Pipeline"
    VALID["Validation Layer<br/>Zod Schemas"]
    AUTH["Authentication<br/>JWT Tokens"]
    AUTHOR["Authorization<br/>RBAC Checks"]
    PROCESS["Business Logic<br/>Transform Data"]
  end

  subgraph "Persistence"
    DB_WRITE["Database Write<br/>Prisma ORM"]
    STORAGE["Object Storage<br/>MinIO"]
    CACHE["Cache Layer<br/>Session Store"]
  end

  subgraph "Notifications"
    MAIL["Email Service<br/>Nodemailer"]
    ANALYTICS["Analytics Events<br/>GA4"]
    LOGS["Audit Logs<br/>DB Records"]
  end

  subgraph "Output"
    RESPONSE["API Response<br/>JSON Envelope"]
    UI["UI Refresh<br/>Client State"]
    REPORT["Reports/Admin<br/>Aggregated Data"]
  end

  WEB --> VALID
  API_VER --> VALID
  FILE --> VALID
  VALID --> AUTH
  AUTH --> AUTHOR
  AUTHOR --> PROCESS
  PROCESS --> DB_WRITE
  PROCESS --> STORAGE
  DB_WRITE --> CACHE
  STORAGE --> CACHE
  DB_WRITE --> MAIL
  DB_WRITE --> ANALYTICS
  DB_WRITE --> LOGS
  CACHE --> RESPONSE
  RESPONSE --> UI
  LOGS --> REPORT
  ANALYTICS --> REPORT
```

### 4.1b Database Entity Relationship Diagram

```mermaid
erDiagram
  USER ||--o{ BOOKING : creates
  USER ||--o{ NEWSPOST : creates
  USER ||--o{ GRANT : creates
  USER ||--o{ EVENT : creates
  USER ||--o{ ANNOUNCEMENT : creates
  USER ||--o{ PROBLEM : creates
  USER ||--o{ HACKATHONEVENT : creates
  USER ||--o{ STUDENTPROFILE : has
  USER ||--o{ APPLICATION : submits
  USER ||--o{ CLAIMMEMBER : joins

  PROBLEM ||--o{ CLAIM : contains
  PROBLEM ||--o{ PROBLEMQUESTION : has
  PROBLEM ||--o{ APPLICATION : accepts

  HACKATHONEVENT ||--o{ PROBLEM : has

  CLAIM ||--o{ CLAIMMEMBER : includes
  CLAIM ||--o{ RUBRIC : scored_with

  STUDENTPROFILE ||--o{ APPLICATION : linked_to

  APPLICATION ||--o{ APPLICATIONANSWER : includes
  PROBLEMQUESTION ||--o{ APPLICATIONANSWER : answered

  OTP ||--o{ USER : verifies
  HEROSLIDE ||--|| CONTENT : displays
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

### 4.9 API Route Organization & Hierarchy

```mermaid
graph TD
  root["🔌 /api"]

  auth["🔐 /auth"]
  auth_reg["POST /register/student<br/>POST /register/faculty"]
  auth_verify["POST /verify-otp<br/>POST /resend-otp"]
  auth_session["POST /login<br/>POST /refresh<br/>POST /logout"]
  auth_pwd["POST /forgot-password<br/>POST /reset-password"]

  booking["📅 /bookings"]
  booking_create["POST /"]
  booking_view["GET /my<br/>GET / guidance"]
  booking_cancel["DELETE /:id"]

  admin["👨‍💼 /admin"]
  admin_booking["PATCH /bookings/:id/confirm<br/>PATCH /bookings/:id/reject"]
  admin_faculty["PATCH /faculty/:id/approve<br/>PATCH /faculty/:id/reject"]
  admin_stats["GET /stats<br/>GET /users<br/>GET /bookings<br/>GET /emails"]

  content["📰 /news, /events, /grants"]
  content_read["GET /"]
  content_create["POST /<br/>PATCH /:id<br/>DELETE /:id"]

  innovation["🚀 /innovation"]
  innov_prob["GET /problems<br/>POST /problems"]
  innov_app["POST /applications<br/>GET /applications/my"]
  innov_hack["POST /events/:id/register<br/>GET /events/:id/leaderboard"]
  innov_faculty["GET /faculty/*<br/>PATCH /faculty/claims/sync"]

  profile["👤 /profile"]
  profile_mgmt["GET /<br/>POST /<br/>PATCH /"]
  profile_check["GET /check-completion"]

  util["⚙️ Utilities"]
  util_store["GET /storage/:path"]
  util_health["GET /health"]
  util_seed["POST /seed"]
  util_cron["GET /cron/reminder<br/>GET /cron/innovation-reminder<br/>GET /cron/email-queue"]

  root --> auth
  root --> booking
  root --> admin
  root --> content
  root --> innovation
  root --> profile
  root --> util

  auth --> auth_reg
  auth --> auth_verify
  auth --> auth_session
  auth --> auth_pwd

  booking --> booking_create
  booking --> booking_view
  booking --> booking_cancel

  admin --> admin_booking
  admin --> admin_faculty
  admin --> admin_stats

  content --> content_read
  content --> content_create

  innovation --> innov_prob
  innovation --> innov_app
  innovation --> innov_hack
  innovation --> innov_faculty

  profile --> profile_mgmt
  profile --> profile_check

  util --> util_store
  util --> util_health
  util --> util_seed
  util --> util_cron
```

### 4.10 Application Status State Machine

```mermaid
stateDiagram-v2
  [*] --> SUBMITTED: Student applies

  SUBMITTED --> SELECTED: Faculty approves
  SUBMITTED --> REJECTED: Faculty rejects

  SELECTED --> [*]: Selection email sent
  REJECTED --> [*]: Rejection email sent

  note right of SUBMITTED
    Open Problem Application
    Awaiting faculty review
    Can have feedback
  end note

  note right of SELECTED
    Student accepted
    Receives feedback
    Can view in My Applications
  end note

  note right of REJECTED
    Student rejected
    Receives feedback
    Can apply to other problems
  end note
```

### 4.11 Hackathon Claim Status Lifecycle

```mermaid
stateDiagram-v2
  [*] --> IN_PROGRESS: Team starts form

  IN_PROGRESS --> SUBMITTED: Team submits PPT

  SUBMITTED --> SHORTLISTED: Screening approved
  SUBMITTED --> REJECTED: Screening rejected

  SHORTLISTED --> ACCEPTED: Final judging approved
  SHORTLISTED --> REJECTED: Final judging rejected
  SHORTLISTED --> REVISION_REQUESTED: Needs revision

  REVISION_REQUESTED --> SUBMITTED: Team resubmits

  ACCEPTED --> [*]: Winners announced
  REJECTED --> [*]: Consolation emails sent

  note right of IN_PROGRESS
    PPT Form Active
    Not yet submitted
  end note

  note right of SUBMITTED
    Awaiting Screening
    PPT ready for review
  end note

  note right of SHORTLISTED
    Passed Screening
    Ready for Final Judging
    rubrics can be set
  end note

  note right of ACCEPTED
    Final Judging Approved
    Final scores persisted
    Leaderboard eligible
  end note
```

### 4.12 Booking Status Lifecycle

```mermaid
stateDiagram-v2
  [*] --> PENDING: Student creates booking

  PENDING --> CONFIRMED: Admin approves
  PENDING --> REJECTED: Admin rejects
  PENDING --> CANCELLED: Student cancels

  CONFIRMED --> [*]: Reminder sent 30min before
  REJECTED --> [*]: Notification sent
  CANCELLED --> [*]: Confirmation sent

  note right of PENDING
    Awaiting admin review
    Student can cancel anytime
  end note

  note right of CONFIRMED
    Admin approved
    Reminder mail sent before time
    Student shows up at facility
  end note
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
- `EmailJob`

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

### 5.1 Principal Data Entities Flow Diagram

```mermaid
graph LR
  U["User<br/>id, role, status<br/>email, phone, uid"]

  SP["StudentProfile<br/>skills, experience<br/>interests, resume"]

  PROF["Problem<br/>title, description<br/>mode, status"]

  HE["HackathonEvent<br/>title, timeline<br/>status, problems"]

  APP["Application<br/>user + profile<br/>+ problem<br/>status, feedback"]

  CLAIM["Claim<br/>problemId<br/>team members<br/>scores"]

  NP["NewsPost<br/>Events, Grants<br/>Announcements"]

  BOOK["Booking<br/>student, facility<br/>date, status"]

  U -->|creates-one| SP
  U -->|creates-many| APP
  U -->|creates-many| PROF
  U -->|creates-many| HE
  U -->|creates-many| BOOK
  U -->|owns| NP

  SP -->|answered-by| APP
  PROF -->|has-many| APP
  PROF -->|belongs-to| HE

  APP -->|tracks| CLAIM
  HE -->|contains| CLAIM

  U -->|joins-as| CLAIM
```

### 5.2 Role-Based Access Control Matrix

```mermaid
graph TD
  subgraph "Public Access"
    PUB["✅ View homepage<br/>✅ View innovation landing<br/>✅ View hackathon events<br/>✅ View announcements"]
  end

  subgraph "Student Restricted"
    STU["✅ Register & Login<br/>✅ Create facility booking<br/>✅ Create student profile<br/>✅ Submit applications<br/>✅ View my applications<br/>✅ Register for hackathon<br/>❌ Manage content<br/>❌ Admin functions"]
  end

  subgraph "Faculty Restricted"
    FAC["✅ Login & create content<br/>✅ Create problems<br/>✅ Create hackathon events<br/>✅ Review applications<br/>✅ Judge submissions<br/>✅ Manage own content<br/>❌ Moderate other faculty<br/>❌ Global admin controls"]
  end

  subgraph "Admin Unrestricted"
    ADM["✅ ALL student actions<br/>✅ ALL faculty actions<br/>✅ Approve/reject faculty<br/>✅ Moderate bookings<br/>✅ View platform stats<br/>✅ Delete any content<br/>✅ Manage hero slides"]
  end
```

Open-problem application fields persisted on `Application`:

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

### 6.3 Role-Based Navigation & Page Access Flow

```mermaid
graph TD
  LOGIN[Login Page]

  LOGIN -->|student role| SDASH["Student Dashboard<br/>/"]
  LOGIN -->|faculty role| FDASH["Faculty Portal<br/>/faculty"]
  LOGIN -->|admin role| ADASH["Admin Panel<br/>/admin"]

  subgraph "Student Routes"
    SDASH --> FB["📅 /facility-booking"]
    SDASH --> PROF["👤 /innovation/profile"]
    SDASH --> PROB["🚀 /innovation/problems"]
    SDASH --> APP["📋 /innovation/my-applications"]
    SDASH --> SUB["📤 /innovation/my-submissions"]
  end

  subgraph "Faculty Routes"
    FDASH --> FE["🛠️ Events Management<br/>/innovation/faculty"]
    FDASH --> FPC["➕ Create Problem<br/>/innovation/faculty/problems/create"]
    FDASH --> FA["📝 Applications Review<br/>/innovation/faculty/applications"]
    FDASH --> NE["📰 Create News Event<br/>/faculty"]
  end

  subgraph "Admin Routes"
    ADASH --> AB["📅 Booking Moderation"]
    ADASH --> AHC["🎯 Hackathon Control<br/>/admin?tab=innovation"]
    ADASH --> AU["👥 User Management"]
    ADASH --> AS["📊 Analytics & Stats"]
  end

  subgraph "Public/Common"
    HOME["🏠 /"]
    ABOUT["ℹ️ /about"]
    LAB["🔬 /laboratory"]
    INNOV["🚀 /innovation"]
    EVENT["🎪 /innovation/events/:id"]
  end
```

### 6.4 Complete Student Innovation Journey Map

```mermaid
journey
  title Student Complete Innovation Journey
  section Profile Setup
    Complete profile: 5: Student
    Upload resume: 4: Student
    section Open Problem Track
    Browse open problems: 5: Student
    View problem details: 4: Student
    Apply to problem: 5: Student
    Answer custom questions: 4: Student
    Submit application: 5: Student
    View application status: 3: Student
    Receive decision email: 3: Student
    section Hackathon Track
    Visit hackathon event page: 4: Student
    Register team: 5: Student
    Upload PPT submission: 5: Student
    Wait for screening: 2: System
    View screening result: 3: Student
    Attend final judging: 5: Student
    Check final score: 5: Student
    View on leaderboard: 5: Student
```

### 6.5 Facility Booking User Journey

```mermaid
journey
  title Facility Booking Complete Flow
  section Student Actions
    Create booking request: 5: Student
    Select facility & time: 4: Student
    Submit booking: 5: Student
    Receive confirmation: 3: Student
    section Admin Actions
    View pending bookings: 4: Admin
    Verify booking details: 3: Admin
    Approve booking: 5: Admin
    section Reminders
    Booking confirmed: 4: System
    Reminder 30min before: 5: System
    Access granted: 5: Student
```

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

### 7.7 API Request/Response Flow & Error Handling

```mermaid
graph TD
  REQ["Incoming HTTP Request"]

  EXTRACT["Extract & Parse<br/>Headers, Body, Params"]
  TOKEN_CHECK["Check Token<br/>Cookie/Bearer"]

  TOKEN_VALID{Token<br/>Valid?}
  TOKEN_INVALID["Return 401<br/>Unauthorized"]

  BODY_VALIDATE["Validate Request<br/>with Zod Schema"]
  VALID_CHECK{Schema<br/>Valid?}
  INVALID_BODY["Return 400<br/>Bad Request<br/>Error Details"]

  AUTHORIZE["Check Role<br/>Permissions"]
  AUTH_CHECK{User<br/>Authorized?}
  NOT_AUTH["Return 403<br/>Forbidden"]

  EXECUTE["Execute Business<br/>Logic"]
  LOGIC_TRY{Success?}

  SUCCESS["✅ Response 200<br/>{success: true,<br/>data: payload}"]
  LOGIC_ERROR["❌ Response 5xx<br/>{success: false,<br/>message: error}"]

  REQ --> EXTRACT
  EXTRACT --> TOKEN_CHECK
  TOKEN_CHECK -->|No| TOKEN_INVALID
  TOKEN_CHECK -->|Yes| TOKEN_VALID
  TOKEN_VALID --> BODY_VALIDATE
  BODY_VALIDATE --> VALID_CHECK
  VALID_CHECK -->|No| INVALID_BODY
  VALID_CHECK -->|Yes| AUTHORIZE
  AUTHORIZE --> AUTH_CHECK
  AUTH_CHECK -->|No| NOT_AUTH
  AUTH_CHECK -->|Yes| EXECUTE
  EXECUTE --> LOGIC_TRY
  LOGIC_TRY -->|Yes| SUCCESS
  LOGIC_TRY -->|No| LOGIC_ERROR

  TOKEN_INVALID --> RESP["Return Response"]
  INVALID_BODY --> RESP
  NOT_AUTH --> RESP
  SUCCESS --> RESP
  LOGIC_ERROR --> RESP
```

### 7.8 Service Module Interaction Diagram

```mermaid
graph TB
  API["API Route Handler"]

  subgraph "Service Layer"
    AUTH_SVC["Authentication<br/>Services"]
    VALIDATE["Validation<br/>Services"]
    BUS["Business Logic<br/>Services"]
    MAIL_SVC["Mailer<br/>Service"]
    EMAIL_QUEUE["Email Queue<br/>Dispatcher/Worker"]
    STORAGE_SVC["Storage<br/>Service"]
    SCORE_SVC["Scoring<br/>Service"]
  end

  subgraph "Data Layer"
    PRISMA["Prisma Client"]
    DB[(MySQL)]
  end

  subgraph "External"
    MINIO["MinIO"]
    SMTP["SMTP"]
  end

  subgraph "Queue Storage"
    EMAIL_JOBS[(email_jobs)]
  end

  API --> VALIDATE
  API --> AUTH_SVC
  API --> BUS

  VALIDATE -->|Zod| VALIDATE

  AUTH_SVC -->|JWT| AUTH_SVC
  AUTH_SVC -->|Bcrypt| AUTH_SVC
  AUTH_SVC --> PRISMA

  BUS -->|Complex Ops| BUS
  BUS --> PRISMA
  BUS --> SCORE_SVC
  BUS --> MAIL_SVC

  MAIL_SVC --> EMAIL_QUEUE
  EMAIL_QUEUE --> PRISMA
  EMAIL_QUEUE --> EMAIL_JOBS
  EMAIL_QUEUE --> SMTP
  SCORE_SVC --> PRISMA

  STORAGE_SVC --> MINIO

  PRISMA --> DB
```

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

CRON_SECRET="change-me-cron-secret"
EMAIL_MAX_ATTEMPTS="5"
EMAIL_PRIORITY_IMMEDIATE="100"
EMAIL_PRIORITY_BULK="20"

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

### 11.0 Deployment Architecture Diagram

```mermaid
graph TB
  subgraph "Client Tier"
    BROWSER["🌐 Web Browser<br/>Desktop/Mobile"]
    DNS["🔗 DNS Resolution<br/>domain.com"]
  end

  subgraph "CDN & Reverse Proxy"
    CF["🚀 CloudFlare / Nginx<br/>SSL/TLS Termination<br/>Request Translation"]
  end

  subgraph "Application Server"
    NEXT["Next.js App Server<br/>Node.js Runtime<br/>/api routes<br/>SSR/SSG pages"]
    PC["Prisma Client<br/>Query Builder"]
  end

  subgraph "Data Layer"
    DB["☁️ MySQL Database<br/>Connection Pooling<br/>Replication"]
    CACHE["💾 Session Store<br/>JWT Tokens"]
  end

  subgraph "Object Storage"
    S3["🪣 MinIO / S3<br/>PPT Files<br/>Resume Files<br/>News Images"]
    PROXY["📡 Storage Proxy<br/>/api/storage/:path"]
  end

  subgraph "External Services"
    SMTP["📧 SMTP Gateway<br/>Gmail / Sendgrid<br/>Email Notifications"]
    GA["📊 Google Analytics 4<br/>Event Tracking<br/>User Analytics"]
  end

  subgraph "Scheduled Tasks"
    CRON["⏰ Cron Scheduler<br/>Reminder Jobs<br/>Event Transitions<br/>Queue Worker"]
  end

  subgraph "Queue Persistence"
    EMAIL_JOBS["📬 email_jobs table<br/>pending/retry/failed/sent"]
  end

  BROWSER -->|HTTPS| DNS
  DNS -->|Route| CF
  CF -->|Forward| NEXT
  NEXT --> PC
  PC -->|Query| DB
  NEXT -->|Session| CACHE
  CF -->|Direct| PROXY
  PROXY -->|Stream| S3
  NEXT -->|Send| SMTP
  NEXT -->|Queue & status| EMAIL_JOBS
  NEXT -->|Track| GA
  CRON -->|Trigger| NEXT
  CRON -->|Drain queue| NEXT

  style BROWSER fill:#e1f5ff
  style CF fill:#fff3e0
  style NEXT fill:#f3e5f5
  style DB fill:#e8f5e9
  style S3 fill:#fce4ec
  style SMTP fill:#fff9c4
  style GA fill:#ede7f6
  style CRON fill:#fff3e0
  style EMAIL_JOBS fill:#e8f5e9
```

### 11.0a External Service Integration Points

```mermaid
graph LR
  APP["Next.js Application"]

  subgraph "Email Service"
    NM["Mailer + Dispatcher"]
    QW["Queue Worker<br/>/api/cron/email-queue"]
    EQ["EmailJob Store<br/>email_jobs"]
    SMTP_SVR["SMTP Server<br/>Gmail / AWS SES"]
  end

  subgraph "Database"
    PRS["Prisma ORM"]
    MYSQL["MySQL Database"]
  end

  subgraph "File Storage"
    MINIO_CLIENT["MinIO SDK"]
    MINIO_SERVER["MinIO Server<br/>S3-Compatible"]
  end

  subgraph "Identity"
    JWT["JWT Library<br/>jsonwebtoken"]
    BCRYPT["bcryptjs<br/>Password Hashing"]
  end

  subgraph "Analytics"
    GA_LIB["GA4 Client Lib<br/>@next/third-parties"]
    GA_ENDPOINT["Google Analytics<br/>Measurement API"]
  end

  APP -->|Mail Events| NM
  NM -->|Persist jobs| EQ
  QW -->|Read pending/retry| EQ
  QW -->|SMTP send| SMTP_SVR
  APP -->|Prisma Queries| PRS -->|TCP| MYSQL
  APP -->|Upload/Download| MINIO_CLIENT -->|S3 Protocol| MINIO_SERVER
  APP -->|Token Ops| JWT
  APP -->|Hash/Compare| BCRYPT
  APP -->|Event Track| GA_LIB -->|HTTPS| GA_ENDPOINT

  style APP fill:#f3e5f5
  style NM fill:#fff9c4
  style PRS fill:#e8f5e9
  style MINIO_CLIENT fill:#fce4ec
  style JWT fill:#e1f5ff
  style GA_LIB fill:#ede7f6
```

### 11.0b Request Authentication & Authorization Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant MW as Middleware
  participant RH as Route Handler
  participant AUTH as Auth Service
  participant DB as Database
  participant RESP as Response

  C->>RH: HTTP Request<br/>+ cookies/bearer
  RH->>MW: Extract token
  MW->>AUTH: Verify JWT signature
  AUTH->>AUTH: Check expiry
  alt Token Valid
    AUTH->>DB: Get user role
    DB-->>AUTH: User object + role
    AUTH->>MW: User context
  else Token Expired
    MW->>MW: Check refresh rotation
    RH-->>C: 401 Unauthorized
  else Invalid Token
    RH-->>C: 401 Unauthorized
  end

  RH->>RH: RBAC authorrization check
  alt Authorized
    RH->>RH: Business logic
    RH->>DB: Query/Mutation
    DB-->>RH: Result
    RH->>RESP: Success envelope
  else Not Authorized
    RH-->>C: 403 Forbidden
  end

  RESP-->>C: JSON Response
```

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

### 12.0 Email Notification Flow Across Features

```mermaid
graph TD
  subgraph "Authentication Events"
    AUTH_REG["User Register"]
    OTP_SEND["OTP Sent"]
    PWD_RESET["Password Reset"]
  end

  subgraph "Facility Booking Events"
    BOOK_PENDING["Booking Created"]
    BOOK_CONF["Booking Confirmed<br/>30min Reminder"]
    BOOK_REJ["Booking Rejected"]
  end

  subgraph "Hackathon Events"
    HACK_REGISTER["Team Registration<br/>Confirmation"]
    HACK_ACTIVE["Event Activated<br/>Reminder Email"]
    HACK_SCREENING["Screening Complete<br/>Shortlist/Reject"]
    HACK_JUDGING["Final Judging<br/>Scores & Decision"]
    HACK_CLOSE["Event Closed<br/>Winners Announced"]
  end

  subgraph "Open Problem Events"
    APP_SUBMIT["Application Submitted<br/>Confirmation"]
    APP_DECISION["Application Decision<br/>Selected/Rejected"]
  end

  subgraph "Mailer Service"
    NODEMAILER["Nodemailer<br/>SMTP Client"]
  end

  subgraph "External Service"
    SMTP_SERVER["SMTP Gateway<br/>Gmail/SendGrid"]
    INBOX["User Inbox"]
  end

  AUTH_REG --> OTP_SEND
  BOOK_PENDING --> BOOK_CONF
  BOOK_PENDING --> BOOK_REJ
  HACK_REGISTER --> HACK_ACTIVE
  HACK_SCREENING --> HACK_JUDGING
  HACK_JUDGING --> HACK_CLOSE
  APP_SUBMIT --> APP_DECISION

  OTP_SEND --> NODEMAILER
  BOOK_CONF --> NODEMAILER
  BOOK_REJ --> NODEMAILER
  HACK_ACTIVE --> NODEMAILER
  HACK_SCREENING --> NODEMAILER
  HACK_JUDGING --> NODEMAILER
  HACK_CLOSE --> NODEMAILER
  APP_DECISION --> NODEMAILER

  NODEMAILER -->|SMTP| SMTP_SERVER
  SMTP_SERVER -->|Deliver| INBOX
```

### 12.1 Cron Job Processing Workflows

```mermaid
graph TD
  CRON_TRIGGER["⏰ External Scheduler<br/>GET /api/cron/reminder"]

  REMINDER_JOB["Reminder Job Handler"]
  CHECK_BOOKINGS["Query Confirmed<br/>Bookings starting<br/>in 30mins"]
  SEND_REMINDER["Send Email<br/>Reminder"]
  MARK_SENT["Mark<br/>reminderSent=true"]
  CLEANUP_OTP["Clean Expired<br/>OTP Records"]

  INNOV_TRIGGER["⏰ External Scheduler<br/>GET /api/cron/innovation-reminder"]
  INNOV_JOB["Innovation Job<br/>Handler"]
  CHECK_EVENTS["Find Events<br/>Ready to start"]
  TRANSITION_ACTIVE["Transition<br/>UPCOMING→ACTIVE"]
  SEND_ACTIVE_EMAIL["Send Active<br/>Phase Email"]
  CHECK_ENDING["Find Events<br/>About to end"]
  SEND_ENDING_REMINDER["Send Ending<br/>Reminder"]

  CRON_TRIGGER --> REMINDER_JOB
  REMINDER_JOB --> CHECK_BOOKINGS
  CHECK_BOOKINGS --> SEND_REMINDER
  SEND_REMINDER --> MARK_SENT
  MARK_SENT --> CLEANUP_OTP
  CLEANUP_OTP --> COMPLETE1["✅ Complete"]

  INNOV_TRIGGER --> INNOV_JOB
  INNOV_JOB --> CHECK_EVENTS
  CHECK_EVENTS --> TRANSITION_ACTIVE
  TRANSITION_ACTIVE --> SEND_ACTIVE_EMAIL
  SEND_ACTIVE_EMAIL --> CHECK_ENDING
  CHECK_ENDING --> SEND_ENDING_REMINDER
  SEND_ENDING_REMINDER --> COMPLETE2["✅ Complete"]

  style COMPLETE1 fill:#c8e6c9
  style COMPLETE2 fill:#c8e6c9
```

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

### 14.0 Feature Workflow Troubleshooting Guide

```mermaid
graph TD
  START["🔍 Issue Occurs"]

  CATEGORY{Issue<br/>Category?}

  AUTH_ISSUE["🔐 Authentication"]
  AUTH1["User can't login"]
  AUTH1 --> CHECK_PASS["Verify password<br/>and email"]
  CHECK_PASS --> CHECK_OTP["Check OTP valid<br/>for 5 minutes"]
  CHECK_OTP --> CHECK_JWT["Verify JWT in<br/>browser cookies"]
  CHECK_JWT --> FIX_AUTH["❌ Token expired<br/>→ Refresh<br/>❌ Invalid<br/>→ Re-login"]

  BOOK_ISSUE["📅 Booking Problem"]
  BOOK1["Booking stuck in<br/>PENDING"]
  BOOK1 --> CHECK_ADMIN["Admin approved?<br/>Check status"]
  CHECK_ADMIN --> CHECK_TIME["Check booking<br/>date/time valid"]
  CHECK_TIME --> FIX_BOOK["❌ No action<br/>→ Admin review<br/>❌ Invalid<br/>→ Cancel & retry"]

  INNOV_ISSUE["🚀 Innovation Problem"]
  INNOV1["Application not<br/>visible to faculty"]
  INNOV1 --> CHECK_PROFILE["Student profile<br/>complete?"]
  CHECK_PROFILE --> CHECK_SUBMIT["Application<br/>status?"]
  CHECK_SUBMIT --> FIX_INNOV["❌ Profile incomplete<br/>→ Fill profile first<br/>❌ Not SUBMITTED<br/>→ Check form"]

  HACK_ISSUE["🎯 Hackathon Problem"]
  HACK1["Leaderboard<br/>not visible"]
  HACK1 --> CHECK_EVENT["Event status<br/>CLOSED?"]
  CHECK_EVENT --> CHECK_SCORES["Rubrics filled<br/>for all teams?"]
  CHECK_SCORES --> FIX_HACK["❌ Event not closed<br/>→ Close event<br/>❌ Missing scores<br/>→ Complete judging"]

  START --> CATEGORY
  CATEGORY -->|Auth| AUTH_ISSUE
  CATEGORY -->|Booking| BOOK_ISSUE
  CATEGORY -->|Open Problem| INNOV_ISSUE
  CATEGORY -->|Hackathon| HACK_ISSUE

  AUTH_ISSUE --> AUTH1
  BOOK_ISSUE --> BOOK1
  INNOV_ISSUE --> INNOV1
  HACK_ISSUE --> HACK1
```

### 14.1 Common HTTP Status Codes & Handling

```mermaid
graph LR
  subgraph "2xx Success"
    200["200 OK<br/>Request successful"]
    201["201 Created<br/>Resource created"]
  end

  subgraph "4xx Client Error"
    400["400 Bad Request<br/>Invalid payload<br/>Check validation"]
    401["401 Unauthorized<br/>Token missing/invalid<br/>Login or refresh"]
    403["403 Forbidden<br/>User not authorized<br/>Check role & permissions"]
    404["404 Not Found<br/>Resource doesn't exist<br/>Check ID/path"]
    409["409 Conflict<br/>Duplicate entry<br/>Unique constraint"]
  end

  subgraph "5xx Server Error"
    500["500 Server Error<br/>Unexpected exception<br/>Check server logs"]
    503["503 Service Unavailable<br/>DB or service down<br/>Retry later"]
  end

  style 200 fill:#c8e6c9
  style 201 fill:#c8e6c9
  style 400 fill:#ffccbc
  style 401 fill:#ffccbc
  style 403 fill:#ffccbc
  style 404 fill:#ffccbc
  style 409 fill:#ffccbc
  style 500 fill:#ffcdd2
  style 503 fill:#ffcdd2
```
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

### 15.0 Quick Reference: Common Developer Tasks

```mermaid
graph TB
  DEV["👨‍💻 Developer Tasks"]

  LOCAL["🖥️ Local Development"]
  LOCAL --> L1["npm install"]
  LOCAL --> L2["npm run db:migrate"]
  LOCAL --> L3["npm run dev"]
  L3 --> L4["→ localhost:3000"]

  TEST["🧪 Testing & Building"]
  TEST --> T1["npm run lint<br/>ESLint validation"]
  TEST --> T2["npm run build<br/>Next.js compilation"]
  TEST --> T3["npm run db:migrate:status<br/>Check pending migrations"]

  SEED["🌱 Database Setup"]
  SEED --> S1["curl -X POST /api/seed<br/>Create admin user"]
  SEED --> S2["Verify User table has<br/>admin account"]

  FEATURE["✨ Adding Features"]
  FEATURE --> F1["Update prisma/schema.prisma"]
  FEATURE --> F2["npm run db:migrate:create<br/>-- --name feature_name"]
  FEATURE --> F3["npm run db:migrate<br/>Apply to DB"]
  FEATURE --> F4["Create /api routes"]
  FEATURE --> F5["Create UI components"]
  FEATURE --> F6["Test in browser"]

  BUG["🐛 Bug Fixing"]
  BUG --> B1["Identify issue in logs"]
  BUG --> B2["Locate code"]
  BUG --> B3["Fix logic/data flow"]
  BUG --> B4["Test locally"]
  BUG --> B5["npm run build verify"]

  DEPLOY["🚀 Deployment"]
  DEPLOY --> D1["All tests passing"]
  DEPLOY --> D2["Migrations ready"]
  DEPLOY --> D3["npm run build succeeds"]
  DEPLOY --> D4["docker compose up<br/>or platform deploy"]

  DEV --> LOCAL
  DEV --> TEST
  DEV --> SEED
  DEV --> FEATURE
  DEV --> BUG
  DEV --> DEPLOY
```

### 15.1 End-to-End Feature Validation Workflows

```mermaid
graph TD
  PRECHECK["Pre-Release Checks"]

  BUILD["npm run build<br/>✅ No compilation errors"]

  AUTH_CHECK["Authentication Flows"]
  AUTH_CHECK1["Register student/faculty"]
  AUTH_CHECK2["Verify OTP (5 min TTL)"]
  AUTH_CHECK3["Login & token in cookies"]
  AUTH_CHECK4["Forgot/reset password"]

  FACILITY_CHECK["Facility Booking"]
  FACILITY_CHECK1["Student creates booking"]
  FACILITY_CHECK2["Admin review & confirm"]
  FACILITY_CHECK3["Reminder email 30min before"]
  FACILITY_CHECK4["Student can cancel pending"]

  CONTENT_CHECK["Content Management"]
  CONTENT_CHECK1["Faculty create news/events"]
  CONTENT_CHECK2["Upload images to MinIO"]
  CONTENT_CHECK3["Verify public page loads"]
  CONTENT_CHECK4["Admin delete capability"]

  INNOVATION_CHECK["Innovation Platform"]
  INNOVATION_CHECK1["Student completes profile"]
  INNOVATION_CHECK2["Student applies to open problem"]
  INNOVATION_CHECK3["Faculty reviews applications"]
  INNOVATION_CHECK4["Decision email sent"]
  INNOVATION_CHECK5["Hackathon registration works"]
  INNOVATION_CHECK6["Screening & judging sync"]
  INNOVATION_CHECK7["Leaderboard visible CLOSED"]

  CRON_CHECK["Automation Checks"]
  CRON_CHECK1["Cron reminder job runs"]
  CRON_CHECK2["Innovation events transition"]
  CRON_CHECK3["Reminders sent correctly"]

  PRECHECK --> BUILD
  BUILD --> AUTH_CHECK
  AUTH_CHECK --> AUTH_CHECK1
  AUTH_CHECK --> AUTH_CHECK2
  AUTH_CHECK --> AUTH_CHECK3
  AUTH_CHECK --> AUTH_CHECK4
  BUILD --> FACILITY_CHECK
  FACILITY_CHECK --> FACILITY_CHECK1
  FACILITY_CHECK --> FACILITY_CHECK2
  FACILITY_CHECK --> FACILITY_CHECK3
  FACILITY_CHECK --> FACILITY_CHECK4
  BUILD --> CONTENT_CHECK
  CONTENT_CHECK --> CONTENT_CHECK1
  CONTENT_CHECK --> CONTENT_CHECK2
  CONTENT_CHECK --> CONTENT_CHECK3
  CONTENT_CHECK --> CONTENT_CHECK4
  BUILD --> INNOVATION_CHECK
  INNOVATION_CHECK --> INNOVATION_CHECK1
  INNOVATION_CHECK --> INNOVATION_CHECK2
  INNOVATION_CHECK --> INNOVATION_CHECK3
  INNOVATION_CHECK --> INNOVATION_CHECK4
  INNOVATION_CHECK --> INNOVATION_CHECK5
  INNOVATION_CHECK --> INNOVATION_CHECK6
  INNOVATION_CHECK --> INNOVATION_CHECK7
  BUILD --> CRON_CHECK
  CRON_CHECK --> CRON_CHECK1
  CRON_CHECK --> CRON_CHECK2
  CRON_CHECK --> CRON_CHECK3

  ALL_PASS["✅ All Checks Passed<br/>Ready for Release"]

  INNOVATION_CHECK --> ALL_PASS
  FACILITY_CHECK --> ALL_PASS
  CONTENT_CHECK --> ALL_PASS
  CRON_CHECK --> ALL_PASS
```

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

---

## 16) Complete System Feature Map (Reference)

```mermaid
mindmap
  root((🎓 TCET CoE<br/>Portal))
    🔐 Authentication
      Register Student/Faculty
      OTP Verification
      Login/Logout
      Password Reset
      Token Refresh
    📚 Content Management
      📰 News Feed
      🎪 Events
      💰 Grants
      📢 Announcements
      🖼️ Hero Slides
    📅 Facility Booking
      Create Booking
      Admin Moderation
      Reminders
      Cancellation
    🚀 Innovation Platform
      🎯 Open Problems
        Create Problem
        Student Profile
        Submit Applications
        Answer Questions
        Faculty Review
        Selection/Rejection
      🏆 Hackathon Track
        Create Event
        Team Registration
        PPT Submission
        Screening Stage
        Judging Stage
        Rubric Scoring
        Leaderboard
    👥 User Management
      Role-Based Access
      Faculty Approval
      User Statistics
    📊 Analytics
      Google Analytics 4
      Event Tracking
      Engagement Metrics
    ⚙️ Operations
      Cron Jobs
      Email Service
      File Storage
      Health Checks
```

### 16.1 System Maturity Assessment

```mermaid
graph LR
  AUTH["Authentication<br/>🟢 Production Ready"]
  CONTENT["Content Management<br/>🟢 Production Ready"]
  BOOKING["Facility Booking<br/>🟢 Production Ready"]
  OPENPROB["Open Problems<br/>🟡 Recently Enhanced"]
  HACKATHON["Hackathon Track<br/>🟡 Recently Enhanced"]
  ANALYTICS["Analytics<br/>🟢 Production Ready"]
  STORAGE["File Storage<br/>🟢 Production Ready"]
  NOTIFICATIONS["Notifications<br/>🟢 Production Ready"]

  style AUTH fill:#c8e6c9
  style CONTENT fill:#c8e6c9
  style BOOKING fill:#c8e6c9
  style OPENPROB fill:#fff9c4
  style HACKATHON fill:#fff9c4
  style ANALYTICS fill:#c8e6c9
  style STORAGE fill:#c8e6c9
  style NOTIFICATIONS fill:#c8e6c9
```

### 16.2 Recent Enhancement Timeline

```mermaid
timeline
  title Recent Project Enhancements
  section Current (2026-03)
    Resume file name handling in applications
    Problem submission question handling
    Student profile management and modals
  section Previous (2026-02)
    Application selection email improvements
  section Foundation (2025-12 to 2026-01)
    Open problems implementation
    Hackathon two-stage judging system
    Facility booking platform
    Content management portal
    JWT authentication and RBAC
```

### 16.3 Integration Points Checklist

| Component | Status | Endpoint/Port | Purpose |
|-----------|--------|----------|---------|
| **JWT Auth** | ✅ Active | `/api/auth/*` | Session management & role-based access |
| **MySQL DB** | ✅ Active | Port 3306 (Prisma) | Data persistence & queries |
| **Email (SMTP)** | ✅ Active | Port 587 (Nodemailer) | Notifications & reminders |
| **MinIO Storage** | ✅ Active | Port 9000 / `/api/storage/*` | File & image hosting |
| **Analytics (GA4)** | ✅ Active | `@next/third-parties` | Event tracking & engagement |
| **Scheduler (Cron)** | ✅ Active | `/api/cron/*` | Automated jobs & reminders |
| **OTP System** | ✅ Active | In-memory (5 min TTL) | Email verification |
| **File Upload** | ✅ Active | Multipart form data | Resume/PPT handling |

---

## 17) Quick Links & Resources

### Development
- **Local Setup**: See section 9) Local Development
- **Environment Config**: See section 8) Environment Configuration
- **Database Migrations**: Use `npm run db:migrate:create` and `npm run db:migrate`
- **Testing**: Run `npm run lint && npm run build`
- **Seeding**: `curl -X POST http://localhost:3000/api/seed`

### Operations
- **Health Check**: `GET /api/health`
- **Booking Reminders**: `GET /api/cron/reminder` (external trigger)
- **Innovation Events**: `GET /api/cron/innovation-reminder` (external trigger)
- **Docker Deployment**: See section 11.1 Docker Deployment

### Troubleshooting
- **Auth Issues**: See section 14.0 - Feature Workflow Troubleshooting
- **API Errors**: See section 14.1 - HTTP Status Codes
- **Database Drift**: See section 14 - Avoiding reset prompts
- **Email Problems**: Verify SMTP config in `.env`

### Feature Documentation
- **Bookings**: Section 4.3
- **Open Problems**: Section 4.7 & 4.8
- **Hackathon**: Section 4.4, 4.5 & 4.6
- **APIs**: Section 7) API Reference
- **User Flows**: Section 6) App Routes & UX Flows

---

**Project Status**: ✅ Production Ready
**Last Updated**: 2026-03-31
**Version**: 1.0 Stable
**Maintained by**: TCET Center of Excellence Team
**Next Review**: Upon completion of next enhancement cycle
