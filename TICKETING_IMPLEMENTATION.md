# Ticketing System Implementation Summary

This document describes the production ticketing system implemented in the platform.
It reflects the current implementation (see `src/lib/tickets.ts`, `prisma/schema.prisma`); treat code as the source of truth.

## Scope Delivered

The system automatically generates, stores, delivers, and verifies digital tickets for:

1. Facility booking confirmations
2. Hackathon selections (accepted teams)

## Core Capabilities Implemented

### 1. Automatic ticket creation triggers

Tickets are issued automatically when:

1. A booking is confirmed via `PATCH /api/admin/bookings/[id]/confirm`
2. A hackathon claim is **shortlisted** during bulk screening via `PATCH /api/innovation/faculty/claims/sync` (stage `SCREENING`, decision `SHORTLISTED`) — this is the primary hackathon ticket trigger
3. A hackathon claim is accepted via the single-review route `PATCH /api/innovation/faculty/claims/[id]/review` (`ACCEPTED` + claim has an event → `issueHackathonSelectionTicketsForClaim`)

No manual ticket generation step is required.

### 2. Unique ticket identity

Each ticket has:

1. A unique human-readable ticket ID (`ticketId`) with format `<PREFIX>-YYYYMMDD-<20 hex chars>`, where the prefix is `BKG` for facility bookings and `HKT` for hackathon team tickets (generated in `src/lib/tickets.ts` with collision retry)
2. A strict association to a real user (the booking student / team lead)
3. Association to a concrete booking (`bookingId`) or hackathon claim (`claimId`)
4. Uniqueness constraints: `ticketId` unique, `bookingId` unique, and `@@unique([claimId, type])` — exactly **one team ticket per hackathon claim** (not per participant)

### 3. Professional ticket PDF generation

Generated PDFs (pdf-lib, A4 portrait) include:

1. Organization branding (TCET Centre of Excellence — navy header bar)
2. Ticket title (e.g. "Hackathon Team Ticket", "Booking Ticket")
3. User name
4. Booking/event subject
5. Date/time (IST-formatted `scheduledAt`)
6. Unique ticket ID
7. Instruction text
8. Embedded QR code encoding the **verification URL** (`/admin?tab=operations&ops=tickets&ticketId=...`), not the raw ID

### 4. Persistent ticket storage

Each PDF is uploaded to object storage (MinIO) under `tickets/<year>/<month>/<ticketId>.pdf` and persisted in DB via `pdfObjectKey`.

Tickets remain retrievable even if the user loses the email (`GET /api/tickets/[ticketId]/download`).

### 5. Reliable email delivery

After ticket creation, the system sends a ticket-issued email (`sendTicketIssuedEmail` in `src/lib/mailer.ts`) with the PDF attached and a stable download link. For hackathon team tickets the email is sent to the team lead and CCs/mentions all team members. If email dispatch fails, the ticket still exists and the failure is recorded via `logActivity('TICKET_EMAIL_DISPATCH_FAILED')`.

### 6. Ticket lifecycle state machine

Implemented statuses (`TicketStatus`):

1. `ACTIVE`
2. `USED`
3. `CANCELLED`

### 7. Verification system with anti-reuse

`POST /api/tickets/verify` (admin-only) supports two modes:

**Facility tickets** — one-time consumption:

1. Valid `ACTIVE` ticket => atomically marked `USED` (with `usedAt` + `lastVerifiedByUserId`/`lastVerifiedAt` in metadata)
2. `USED` ticket => rejected (`ALREADY_USED`)
3. `CANCELLED` ticket => rejected
4. Unknown ticket ID => rejected (`NOT_FOUND`)
5. Hackathon-type tickets submitted here => rejected (`WRONG_TICKET_TYPE`)

The consume step is atomic (`updateMany` conditional on `ACTIVE`) to prevent replay/race reuse.

**Hackathon team tickets** — per-session check-in:

- `verifyTicketForCheckIn(ticketId, session)` validates the ticket, the event window (`OUTSIDE_EVENT_WINDOW` outside `startTime`/`endTime`) and the requested session (1..`totalSessions`)
- `markHackathonTeamMembersPresent` marks attendance for the present `ClaimMember`s on the ticket's `TicketAttendance` rows for that session
- Per-member, per-session attendance is stored in `TicketAttendance` (unique on `[ticketId, claimMemberId, session]` and `[userId, claimId, session]`); `POST /api/attendance` provides a bulk mark-present endpoint (admin/faculty)

### 8. Failure handling

Implemented behavior:

1. If storage/DB ticket creation fails, the uploaded PDF is deleted and the ticket is not considered created
2. If email fails, ticket still exists and remains retrievable
3. Trigger flows surface ticket-issuance failures explicitly (no silent pass)

### 9. Reusable architecture

Ticket logic is centralized in `src/lib/tickets.ts` and reused by booking + hackathon flows.

This avoids duplicated business logic across routes.

## Database Changes

### Migrations

- `prisma/migrations/20260403100518_add_ticketing_system/migration.sql`
- `prisma/migrations/20260403143000_team_ticket_member_attendance/migration.sql`
- `prisma/migrations/20260410113000_add_multi_session_attendance/migration.sql`

### New enums

1. `TicketType`: `FACILITY_BOOKING`, `HACKATHON_SELECTION`
2. `TicketStatus`: `ACTIVE`, `USED`, `CANCELLED`

### New models

`Ticket` with:

1. `ticketId` (unique)
2. `type`, `status`
3. `userId`
4. `bookingId` (optional, unique)
5. `claimId` (optional)
6. `title`, `subjectName`, `scheduledAt`
7. `pdfObjectKey`, `qrValue`
8. `issuedAt`, `usedAt`, `cancelledAt`
9. `metadata`

`TicketAttendance` (per-member per-session attendance) with:

1. `ticketId`, `claimId`, `userId`, `claimMemberId`
2. `session` (default 1), `status` (`NOT_PRESENT` | `PRESENT`)
3. `checkedInAt`, `checkedInByUserId`

### Key constraints/indexes

1. `ticketId` unique
2. `bookingId` unique (one ticket per booking)
3. `(claimId, type)` unique (one team ticket per claim per type)
4. Status/type/issuedAt indexes and attendance uniqueness for query performance

## New API Endpoints

### User endpoints

1. `GET /api/tickets/my`
   - Lists current user's tickets with download URL (student/faculty/admin)

2. `GET /api/tickets/[ticketId]/download`
   - Secure PDF retrieval
   - Allowed for ticket owner, admin, faculty

### Verification and lifecycle endpoints

1. `POST /api/tickets/verify`
   - Admin only
   - Facility: verifies + consumes ticket (marks `USED`)
   - Hackathon: per-session check-in + member attendance marking

2. `PATCH /api/tickets/[ticketId]/cancel`
   - Admin/faculty only
   - Marks ticket as `CANCELLED` (with `cancelledAt`)

3. `POST /api/attendance`
   - Admin/faculty only
   - Bulk mark hackathon team members present for a session

## Trigger Integrations

### Booking flow

`PATCH /api/admin/bookings/[id]/confirm`:

1. Confirms booking
2. Issues booking ticket (`issueFacilityBookingTicket`)
3. Sends booking confirmation email
4. Returns `ticketId` in response

Facility booking lifecycle safety:

1. `PATCH /api/admin/bookings/[id]/reject` defensively cancels any active ticket for that booking
2. Student booking cancellation defensively cancels any active ticket for that booking
3. Booking reject/cancel actions emit activity logs for traceability

### Hackathon flow (single review)

`PATCH /api/innovation/faculty/claims/[id]/review`:

1. On `ACCEPTED` + hackathon claim (`claim.problem.eventId` set), issues the team ticket (`issueHackathonSelectionTicketsForClaim`)
2. Fails explicitly if ticket issuance fails

### Hackathon flow (bulk sync)

`PATCH /api/innovation/faculty/claims/sync` (stage `SCREENING`):

1. On screening-stage `SHORTLISTED` decisions, issues tickets for shortlisted claims
2. Ticket failures are aggregated into `ticketFailures` and surfaced explicitly (no silent pass)

### Team ticket issuance details

`issueHackathonSelectionTicketsForClaim`:

- One ticket per claim, owned by the team LEAD member (first member with role `LEAD`, else first member)
- `TicketAttendance` rows are pre-created for every team member (session 1, `NOT_PRESENT`)
- Metadata carries claim/event/problem/team info; team members are included in the issued email

## Reusable Libraries Added/Updated

### New files

1. `src/lib/tickets.ts`
   - Ticket ID generation
   - PDF + QR generation
   - Storage upload
   - Email dispatch call
   - Verification/consume logic
   - Booking/hackathon issuance helpers

2. `src/app/api/tickets/my/route.ts`
3. `src/app/api/tickets/[ticketId]/download/route.ts`
4. `src/app/api/tickets/verify/route.ts`
5. `src/app/api/tickets/[ticketId]/cancel/route.ts`
6. `src/app/api/attendance/route.ts`

### Updated files

1. `prisma/schema.prisma`
2. `src/lib/mailer.ts` (ticket-issued email template)
3. `src/app/api/admin/bookings/[id]/confirm/route.ts`
4. `src/app/api/innovation/faculty/claims/[id]/review/route.ts`
5. `src/app/api/innovation/faculty/claims/sync/route.ts`

## Dependencies Added

1. `pdf-lib`
2. `qrcode`
3. `@types/qrcode`

## Security Characteristics

1. High-entropy ticket IDs (20 random hex chars) to reduce guessability
2. Verification checks real DB ticket existence and state
3. One-time consume transition prevents reuse (facility tickets)
4. Download access control (owner/admin/faculty)
5. Ticket tied to real user + booking/claim references
6. Verify/cancel/attendance endpoints are role-gated (admin/faculty)

## Future-Ready Design Notes

Current design supports future expansion for:

1. Admin scanning UI (QR already encodes the admin verification URL)
2. Attendance analytics (per-session `TicketAttendance` data)
3. Revocation workflows (`CANCELLED` state + cancel endpoint exist)
4. Reporting by ticket status/type/time windows

## Validation Status

1. Migrations created and applied
2. Prisma client regenerated
3. Full production build passes
4. Ticket routes are registered in build output
