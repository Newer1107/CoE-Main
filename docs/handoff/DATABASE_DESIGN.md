# Database Design

## Overview

The CoE Portal uses **MySQL** as its database, accessed through **Prisma ORM** (Object-Relational Mapping). Prisma provides type-safe database queries from TypeScript.

## Why Prisma?

```typescript
// Without Prisma (raw SQL):
const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);

// With Prisma:
const user = await prisma.user.findUnique({ where: { email } });
// Result is FULLY typed — TypeScript knows all fields
```

Prisma generates TypeScript types from the schema, so:
- You get auto-completion for field names
- TypeScript catches typos at compile time
- You never write raw SQL

## Schema Location

**File: `prisma/schema.prisma`** (985 lines, **42 models**, 21 enums)

## Key Design Decisions

### 1. No Session Table

There is **no `Session` model** in the database. Sessions are managed entirely through JWT tokens stored in httpOnly cookies. This is called a **stateless** authentication design — the server doesn't need to remember who's logged in; it just verifies the JWT signature on each request.

**Why**: Fewer database queries, simpler scaling, no session cleanup needed.

### 2. Google Identity Stored Directly on User

There is no separate `Account` or `Provider` model. The Google OAuth identity (`googleId`) is stored directly on the `User` model. This is simpler than the multi-provider pattern (like NextAuth uses) because this project only supports one external provider.

### 3. Enum-Driven Status Management

Many models use enums for status fields instead of boolean flags:

```prisma
enum BookingStatus { PENDING, CONFIRMED, REJECTED, CANCELLED }
enum ClaimStatus { IN_PROGRESS, SUBMITTED, SHORTLISTED, ACCEPTED, REVISION_REQUESTED, REJECTED }
enum EventStatus { UPCOMING, ACTIVE, JUDGING, CLOSED }
```

This makes the valid states explicit and prevents invalid transitions.

## Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Booking : creates
    User ||--o{ NewsPost : creates
    User ||--o{ Grant : creates
    User ||--o{ Event : creates
    User ||--o{ Announcement : creates
    User ||--o{ Problem : authors
    User ||--o{ HackathonEvent : creates
    User ||--o{ StudentProfile : has
    User ||--o{ FacultyProfile : has
    User ||--o{ Application : submits
    User ||--o{ ClaimMember : joins
    User ||--o{ Ticket : owns
    User ||--o{ HostingRequest : requests
    User ||--o{ Notification : receives
    User ||--o{ Industry : belongs_to

    Otp ||--o{ User : verifies
    Otp {
        string email
        string code
        datetime createdAt
    }

    Booking ||--o| Ticket : has
    Booking {
        int studentId
        datetime date
        string timeSlot
        string lab
        json facilities
        BookingStatus status
    }

    Ticket ||--o{ TicketAttendance : tracks
    Ticket {
        string ticketId
        TicketType type
        TicketStatus status
        string pdfObjectKey
        string qrValue
    }

    Problem ||--o{ Claim : contains
    Problem ||--o{ Application : accepts
    Problem ||--o{ ProblemQuestion : has
    Problem ||--o{ InternshipTask : has
    Problem ||--o{ InternshipMessage : has
    Problem ||--o{ InternshipMeeting : has
    Problem ||--o{ InternshipDocument : has
    Problem }|--|| HackathonEvent : belongs_to

    Claim ||--o{ ClaimMember : includes
    Claim ||--o{ Ticket : has
    Claim ||--o{ RubricScore : scores
    Claim ||--o{ SessionDocument : uploads
    Claim {
        ClaimStatus status
        int innovationScore
        int technicalScore
        int finalScore
        boolean isAbsent
    }

    User ||--o{ Certificate : receives
    HackathonEvent ||--o{ Certificate : issues
    Certificate {
        string serial   // CERT-<year>-<eventId>-<A|P><userId>
        string type      // ACHIEVEMENT | PARTICIPATION
        string nameOverride
    }

    RubricCategory ||--o{ RubricScore : defines

    Application ||--o{ ApplicationAnswer : has
    Application {
        ApplicationStatus status
        string feedback
    }

    StudentProfile ||--o{ Application : linked_to
    StudentProfile {
        string skills
        string experience
        string resumeUrl
    }

    HackathonEvent ||--o{ HackathonInterest : has
    HackathonEvent ||--o{ HackathonSessionUploadLock : has

    HostingRequest ||--o{ HostingRequestStatusHistory : logs

    ImpersonationSession {
        string id
        int adminId
        int targetUserId
        ImpersonationStatus status
    }

    EmailJob {
        string toEmail
        string subject
        string category
        string status
        int attempts
        string lastError
    }

    Industry ||--o{ User : employs
    Industry ||--o{ Problem : sponsors
```

## All Enums

```prisma
enum Role                  { ADMIN, FACULTY, STUDENT, INDUSTRY_PARTNER }
enum UserStatus            { ACTIVE, PENDING, REJECTED }
enum BookingStatus         { PENDING, CONFIRMED, REJECTED, CANCELLED }
enum ClaimStatus           { IN_PROGRESS, SUBMITTED, SHORTLISTED, ACCEPTED, REVISION_REQUESTED, REJECTED }
enum EventStatus           { UPCOMING, ACTIVE, JUDGING, CLOSED }
enum ApplicationStatus     { SUBMITTED, SELECTED, REJECTED }
enum ProblemStatus         { OPENED, CLOSED, ARCHIVED }
enum ProblemMode           { OPEN, CLOSED }
enum ProblemType           { OPEN, INTERNSHIP, FACULTY_INTERNSHIP }
enum ProblemApprovalStatus { PENDING_APPROVAL, APPROVED, REJECTED }
enum ImpersonationStatus   { ACTIVE, ENDED, EXPIRED }
enum TicketType            { FACILITY_BOOKING, HACKATHON_SELECTION }
enum TicketStatus          { ACTIVE, USED, CANCELLED }
enum MemberAttendanceStatus { NOT_PRESENT, PRESENT }
enum GrantCategory         { GOVT_GRANT, SCHOLARSHIP, RESEARCH_FUND, INDUSTRY_GRANT }
enum EventMode             { ONLINE, OFFLINE, HYBRID }
enum InternshipTaskStatus  { PENDING, IN_PROGRESS, COMPLETED }
enum InternshipDocumentType { FILE, LINK }
enum MeetingRecurrenceType { NONE, DAILY, WEEKLY, BIWEEKLY, MONTHLY }
enum NotificationType      { ... }
enum HostingRequestStatus  { PENDING, APPROVED, REJECTED, CHANGES_REQUESTED, ... }
enum DatabaseType          { MYSQL, POSTGRESQL }
```

## Core Models

### User (`users` table)

The central model. Every person who uses the system is a User.

```prisma
model User {
  id         Int        @id @default(autoincrement())
  name       String
  email      String     @unique
  phone      String?
  password   String                          // bcrypt-hashed
  role       Role                            // ADMIN, FACULTY, STUDENT, INDUSTRY_PARTNER
  uid        String?                         // College UID (e.g., "24-COMPD13-28")
  googleId   String?    @unique              // Google OAuth ID
  isVerified Boolean    @default(false)      // Email verified via OTP
  status     UserStatus @default(ACTIVE)     // ACTIVE, PENDING, REJECTED
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  industryId Int?
  industry   Industry?  @relation(fields: [industryId], references: [id])

  // Relations (simplified):
  bookings          Booking[]
  newsPosts         NewsPost[]
  problemsAuthored  Problem[]
  applications      Application[]
  studentProfile    StudentProfile?
  facultyProfile    FacultyProfile?
  // ... more business relations
}
```

**Important fields for authentication:**
- `password` — Always non-null. Google users get a random hex string.
- `role` — Determines what the user can do.
- `googleId` — If set, user can log in with Google.
- `isVerified` — Email verified through OTP.
- `status` — Account-level gate. `PENDING` means needs admin approval.

### Booking (`bookings` table)

```prisma
model Booking {
  id           Int           @id @default(autoincrement())
  studentId    Int
  student      User          @relation(fields: [studentId], references: [id])
  purpose      String        @db.Text
  date         DateTime
  timeSlot     String
  facilities   Json          // Array of facility names
  lab          String
  status       BookingStatus @default(PENDING)
  adminNote    String?
  reminderSent Boolean       @default(false)
  ticket       Ticket?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}
```

**Lifecycle:** `PENDING → CONFIRMED | REJECTED | CANCELLED`

### Otp (`otps` table)

```prisma
model Otp {
  id        Int      @id @default(autoincrement())
  email     String
  code      String   // 6-digit code
  createdAt DateTime @default(now())
}
```

- No foreign key to User — looked up by email string
- TTL is enforced in application code (10 minutes)
- Old OTPs are deleted before creating new ones

### Problem (`problems` table)

The most complex model. Represents innovation problems (open problems, hackathon problems, internships).

```prisma
model Problem {
  id                 Int                   @id @default(autoincrement())
  title              String
  description        String                @db.Text
  tags               String?
  isIndustryProblem  Boolean               @default(false)
  industryName       String?
  problemType        ProblemType           @default(OPEN)
  approvalStatus     ProblemApprovalStatus @default(APPROVED)
  mode               ProblemMode           @default(OPEN)
  status             ProblemStatus         @default(CLOSED)
  createdById        Int
  createdBy          User                  @relation("ProblemAuthor")
  industryId         Int?
  eventId            Int?                  // Hackathon problem
  event              HackathonEvent?
  supportDocumentKey String?
  difficulty         String?
  sdgTags            Json?
  departmentId       Int?
  notificationSent   Boolean               @default(false)
  // ... questions, claims, applications, internship relations
}
```

### Certificate (`certificates` table)

```prisma
model Certificate {
  id           Int      @id @default(autoincrement())
  userId       Int
  eventId      Int
  type         String   // ACHIEVEMENT | PARTICIPATION
  title        String
  detail       String?
  fileKey      String?  // MinIO: certificates/{eventId}/{TYPE}/{serial}.pdf
  serial       String   @unique  // CERT-<year>-<eventId>-<A|P><userId>
  issuedAt     DateTime @default(now())
  nameOverride String?  // Admin-corrected name shown on the PDF

  @@unique([userId, eventId, type])
}
```

### LearningResource (`learning_resources` table)

```prisma
model LearningResource {
  id          Int      @id @default(autoincrement())
  title       String
  category    String
  type        String   // PDF | LINK | YOUTUBE | GITHUB | TEMPLATE | WINNING_PROJECT
  url         String?
  fileKey     String?
  difficulty  String?
  tags        Json?
  createdById Int
  createdAt   DateTime @default(now())
}
```

### EmailJob (`email_jobs` table)

```prisma
model EmailJob {
  id                Int       @id @default(autoincrement())
  toEmail           String
  subject           String
  htmlBody          String    @db.LongText
  category          String
  mode              String    @default("IMMEDIATE")  // IMMEDIATE or BULK
  status            String    @default("PENDING")     // PENDING, PROCESSING, RETRY, SENT, FAILED
  priority          Int       @default(50)
  attempts          Int       @default(0)
  maxAttempts       Int       @default(5)
  nextAttemptAt     DateTime?
  lastAttemptAt     DateTime?
  sentAt            DateTime?
  lockedAt          DateTime?
  lastError         String?   @db.Text
  providerMessageId String?
  dedupeKey         String?   @unique
  metadata          Json?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@map("email_jobs")
}
```

## Indexes

Important indexes that affect query performance:

```prisma
// User lookup by auth method
@@index([googleId])

// Booking queries by student
@@index([studentId]) on Booking

// Innovation queries
@@index([status]) on Problem
@@index([status]) on Claim
@@index([eventId, status]) on Problem

// Email queue processing
@@index([status, nextAttemptAt]) on EmailJob

// Quick lookups
@@index([email]) on Otp
@@index([adminId, status]) on ImpersonationSession
```

## Naming Conventions

| Convention | Example | Rule |
|-----------|---------|------|
| **Model name** | `HackathonEvent` | PascalCase, singular |
| **Table name** | `hackathon_events` | snake_case, plural, via `@@map` |
| **Field name** | `createdById` | camelCase |
| **Column name** | `created_by_id` | snake_case (Prisma auto) |
| **Enum name** | `BookingStatus` | PascalCase |
| **Enum values** | `PENDING`, `CONFIRMED` | UPPER_SNAKE_CASE |
| **Relation field** | `createdBy` | camelCase, references model |
| **Index** | `@@index([status])` | On frequently queried fields |

## Migration Workflow

Migrations are managed with the safe wrapper scripts in `package.json` (never plain `prisma migrate dev`):

```bash
# 1. Edit schema.prisma

# 2. Check migration status
npm run db:migrate:status

# 3. Create a migration file
npm run db:migrate:create -- --name describe_change

# 4. Apply pending migrations
npm run db:migrate        # = npm run db:migrate:apply (prisma migrate deploy equivalent)

# NEVER run `npx prisma migrate dev` — it may reset your database!
```

Other schema-related scripts:
- `npm run db:generate` — regenerate the Prisma client (`prisma generate`)
- `npm run certificates:backfill` — re-run certificate issuance (`npx tsx --env-file=.env scripts/backfill-certificates.ts [--reset] [eventId ...]`; `--reset` deletes existing rows + PDFs **scoped to the events being re-run**)

## Common Queries Reference

```typescript
// Find user by email (unique field)
const user = await prisma.user.findUnique({ where: { email } });

// Find user by email OR UID
const user = await prisma.user.findFirst({
  where: { OR: [{ email }, { uid }] }
});

// Count with filter
const count = await prisma.booking.count({ where: { status: 'PENDING' } });

// Create with relation
const booking = await prisma.booking.create({
  data: {
    studentId: user.id,
    purpose: "Project meeting",
    date: new Date(),
    // ...
  }
});

// Update
await prisma.booking.update({
  where: { id: 123 },
  data: { status: 'CONFIRMED' }
});

// Delete
await prisma.booking.delete({ where: { id: 123 } });

// Transaction (atomic operations)
await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUnique({ where: { email } });
  const created = await tx.user.create({ data: { ... } });
});
```

## Dashboard Database

The Project Dashboard has its **own separate database** with its own Prisma schema. It shares no tables with the CoE Portal. Users are synchronized between the two databases via the internal sync API.

> Note: the dashboard application itself is **external** (`project-dashboard/` is gitignored — it is not part of this repository). The sync contract lives in `src/lib/dashboard-sync.ts` (`DASHBOARD_URL` + `SYNC_SECRET`).
