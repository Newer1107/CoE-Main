# Ticketing System Implementation Summary

This document summarizes the production-grade ticketing system implemented in the platform.

## Scope Delivered

The system now automatically generates, stores, delivers, and verifies digital tickets for:

1. Facility booking confirmations
2. Hackathon selections (accepted participants)

## Core Capabilities Implemented

### 1. Automatic ticket creation triggers

Tickets are issued automatically when:

1. A booking is confirmed via admin booking confirm API
2. A hackathon claim is accepted via single review or bulk sync review APIs

No manual ticket generation step is required.

### 2. Unique ticket identity

Each ticket has:

1. A unique human-readable ticket ID (`ticketId`)
2. A strict association to a real user
3. Association to a concrete booking or hackathon claim
4. Uniqueness constraints to prevent collisions and duplicate issuance

### 3. Professional ticket PDF generation

Generated PDFs include:

1. Organization branding (TCET Center of Excellence)
2. Ticket title
3. User name
4. Booking/event subject
5. Date/time
6. Unique ticket ID
7. Instruction text
8. Embedded QR code containing ticket ID

### 4. Persistent ticket storage

Each PDF is uploaded to object storage (MinIO) and persisted in DB via `pdfObjectKey`.

Tickets remain retrievable even if user loses email.

### 5. Reliable email delivery

After ticket creation, system sends ticket-issued email with a stable download link.

Email dispatch uses the existing resilient mail queue/retry architecture.

### 6. Ticket lifecycle state machine

Implemented statuses:

1. `ACTIVE`
2. `USED`
3. `CANCELLED`

### 7. Verification system with anti-reuse

Verification endpoint checks ticket validity and enforces one-time consumption:

1. Valid `ACTIVE` ticket => marked `USED`
2. `USED` ticket => rejected
3. `CANCELLED` ticket => rejected
4. Unknown ticket ID => rejected

The consume step is atomic (`updateMany` conditional on `ACTIVE`) to prevent replay/race reuse.

### 8. Failure handling

Implemented behavior:

1. If storage/DB ticket creation fails, ticket is not considered created
2. If email fails, ticket still exists and remains retrievable
3. Trigger flows surface ticket-issuance failures explicitly (no silent pass)

### 9. Reusable architecture

Ticket logic is centralized in one reusable service module and reused by booking + hackathon flows.

This avoids duplicated business logic across routes.

## Database Changes

### Migration

`prisma/migrations/20260403100518_add_ticketing_system/migration.sql`

### New enums

1. `TicketType`: `FACILITY_BOOKING`, `HACKATHON_SELECTION`
2. `TicketStatus`: `ACTIVE`, `USED`, `CANCELLED`

### New model

`Ticket` model with:

1. `ticketId` (unique)
2. `type`, `status`
3. `userId`
4. `bookingId` (optional, unique)
5. `claimId` (optional)
6. `title`, `subjectName`, `scheduledAt`
7. `pdfObjectKey`, `qrValue`
8. `issuedAt`, `usedAt`, `cancelledAt`
9. `metadata`

### Key constraints/indexes

1. `ticketId` unique
2. `bookingId` unique (one booking ticket)
3. `(claimId, userId, type)` unique (one hackathon ticket per accepted participant per claim)
4. status and issued indexes for query performance

## New API Endpoints

### User endpoints

1. `GET /api/tickets/my`
   - Lists current user tickets with download URL

2. `GET /api/tickets/[ticketId]/download`
   - Secure PDF retrieval
   - Allowed for ticket owner, admin, faculty

### Verification and lifecycle endpoints

1. `POST /api/tickets/verify`
   - Admin/faculty only
   - Verifies + consumes ticket (marks as `USED`)

2. `PATCH /api/tickets/[ticketId]/cancel`
   - Admin/faculty only
   - Marks ticket as `CANCELLED`

## Trigger Integrations

### Booking flow

Updated `PATCH /api/admin/bookings/[id]/confirm`:

1. Confirms booking
2. Issues booking ticket
3. Sends booking confirmation email
4. Returns `ticketId` in response

Updated facility booking lifecycle safety:

1. `PATCH /api/admin/bookings/[id]/reject` now defensively cancels any active ticket for that booking
2. `DELETE /api/bookings/[id]` (student cancel) now defensively cancels any active ticket for that booking
3. Booking reject/cancel actions emit activity logs for traceability

### Hackathon flow (single review)

Updated `PATCH /api/innovation/faculty/claims/[id]/review`:

1. On `ACCEPTED` + hackathon claim, issues tickets for all claim members
2. Fails explicitly if ticket issuance fails

### Hackathon flow (bulk sync)

Updated `PATCH /api/innovation/faculty/claims/sync`:

1. On judging stage accepted decisions, issues tickets for accepted claims
2. Aggregates and surfaces ticket issuance failures explicitly

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

1. High-entropy ticket IDs to reduce guessability
2. Verification checks real DB ticket existence and state
3. One-time consume transition prevents reuse
4. Download access control (owner/admin/faculty)
5. Ticket tied to real user + booking/claim references

## Future-Ready Design Notes

Current design supports future expansion for:

1. Admin scanning UI
2. Attendance analytics
3. Revocation workflows
4. Reporting by ticket status/type/time windows

## Validation Status

1. Migration created and applied successfully
2. Prisma client regenerated
3. Full production build passes
4. New ticket routes are registered in build output
