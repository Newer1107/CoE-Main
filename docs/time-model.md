# Application Time Model

This document defines the application's official temporal model. Every DateTime value in the codebase belongs to exactly one of three temporal categories. Each category has specific rules for parsing, storage, and display.

---

## Temporal Categories

### Calendar Date

A year-month-day without time-of-day or timezone significance.

**Examples**: `Grant.deadline`, `Booking.date`, `InnovationProgram.eventDate`, `content Event.date`

**Storage**: MySQL `DATETIME(3)` at midnight UTC.

**Parsing**: Use `parseCalendarDate()` from `src/lib/time.ts`. Accepts `"YYYY-MM-DD"` format only. Per ECMAScript spec, ISO date-only strings are parsed as midnight UTC.

**Display**: Format as date only — never include a time component.

**Allowed helpers**:
- `parseCalendarDate(string): Date` — parse from `type="date"` input

**Disallowed helpers**:
- `parseLocalWallClock()` — would incorrectly apply IST offset
- `parseUTCIso()` — expects timezone indicator
- `new Date(string)` directly — must use `parseCalendarDate`

---

### Local Wall Clock Time

A date-plus-time that represents a clock reading in India Standard Time (IST, UTC+05:30).

**Examples**: `InnovationProgram.startTime/endTime`, `InternshipMeeting.datetime`, `InternshipTask.deadline`, `Booking.timeSlot` (as part of reconstruction)

**Storage**: Stored as the correct UTC epoch (via `parseLocalWallClock` or `bookingDateTimeFromIST` which appends `+05:30` before parsing).

**Parsing**: Use `parseLocalWallClock()` from `src/lib/time.ts`. Input must NOT contain a timezone indicator (`Z` or offset). The lack of timezone indicator means the string represents local wall-clock time, which is IST for this application.

**Display**: Always format in `Asia/Kolkata` using `formatDateTimeIST` or equivalent.

**Allowed helpers**:
- `parseLocalWallClock(string): Date` — parse from `type="datetime-local"` or combined `type="date"` + `type="time"` inputs
- `bookingDateTimeFromIST(Date, string): Date` — reconstruct from Calendar Date + IST time slot

**Disallowed helpers**:
- `parseCalendarDate()` — discards time component
- `parseUTCIso()` — requires timezone indicator, would reject valid input
- `new Date(string)` directly — TZ-dependent, must use shared helper

---

### Absolute Instant

A fixed point on the global timeline, already correctly represented as a UTC instant.

**Examples**: `createdAt`, `updatedAt`, `issuedAt`, `usedAt`, `cancelledAt`, `checkedInAt`, `HackathonEvent.startTime/endTime` (when frontend pre-converts to UTC ISO), `Otp.createdAt`, all `EmailJob.*` timestamps

**Storage**: MySQL `DATETIME(3)` at the correct UTC epoch. These values are set via `@default(now())` or constructed from frontend-sent UTC ISO strings.

**Parsing**: Use `parseUTCIso()` from `src/lib/time.ts`. Input MUST contain a timezone indicator (`Z` or `+HH:MM`). The function passes the string directly to `new Date()` which is deterministic for strings with timezone indicators.

**Display**: Format in `Asia/Kolkata` for user-facing output. Use UTC for internal comparisons.

**Allowed helpers**:
- `parseUTCIso(string): Date` — parse from API payloads that already carry timezone indicators

**Disallowed helpers**:
- `parseCalendarDate()` — discards time component
- `parseLocalWallClock()` — would double-apply IST offset to an already-correct UTC value
- `new Date(string)` directly — should use `parseUTCIso` for validation and clarity

---

## Business Rules

### Booking

| Field | Category | Rationale |
|-------|----------|-----------|
| `Booking.date` | Calendar Date | Created from `type="date"` input via `new Date(year, month, day)`. Only the day matters. |
| `Booking.timeSlot` | Local Wall Clock (as string) | Hardcoded IST slots like `"09:00 - 11:00"`. No timezone mechanism. |
| `Booking.createdAt` | Absolute Instant | `@default(now())` — fixed point in time. |
| `Booking.updatedAt` | Absolute Instant | `@updatedAt` — fixed point in time. |

**Reconstruction**: `Booking.date` (Calendar Date) + `Booking.timeSlot` (IST wall-clock) → UTC instant via `bookingDateTimeFromIST()`.

### InnovationProgram

| Field | Category | Rationale |
|-------|----------|-----------|
| `InnovationProgram.eventDate` | Calendar Date | Created from `type="date"` input. |
| `InnovationProgram.startTime` | Local Wall Clock | Created from `type="time"` input, combined with eventDate. Must be parsed via `parseLocalWallClock()`. |
| `InnovationProgram.endTime` | Local Wall Clock | Same pattern as startTime. |

### HackathonEvent (event window + submission deadline)

| Field | Category | Rationale |
|-------|----------|-----------|
| `HackathonEvent.startTime` | Absolute Instant | Created from frontend-pre-converted UTC ISO strings; defines the event window start. |
| `HackathonEvent.endTime` | Absolute Instant | Defines the event window end; also gates claim submission and ticket check-in. |
| `HackathonEvent.submissionLockAt` | Absolute Instant (nullable) | Optional hard deadline for claim submissions, enforced server-side in the claim submit route (`PATCH /claims/[id]/submit` rejects after `submissionLockAt`, after `endTime`, or once the event is `CLOSED`). Created from `type="datetime-local"` input pre-converted to UTC ISO. |
| `HackathonEvent.totalSessions` | Integer (not a time) | Number of check-in sessions for ticket attendance. |

**Window checks that consume these fields:**
- Ticket check-in (`verifyTicketForCheckIn` in `src/lib/tickets.ts`) rejects outside `startTime`–`endTime` (`OUTSIDE_EVENT_WINDOW`) and rejects sessions outside `1..totalSessions` (`INVALID_SESSION`).
- Cron auto-activation (`/api/cron/innovation-reminder`) transitions `UPCOMING → ACTIVE` when `startTime` arrives.

### Internship

| Field | Category | Rationale |
|-------|----------|-----------|
| `InternshipMeeting.datetime` | Local Wall Clock | Created from `type="datetime-local"` input. Must be parsed via `parseLocalWallClock()`. |
| `InternshipTask.deadline` | Local Wall Clock | Created from `type="datetime-local"` input. Must be parsed via `parseLocalWallClock()`. |

### Absolute Instants (All Models)

All `createdAt`, `updatedAt`, and event-log fields (`issuedAt`, `usedAt`, `cancelledAt`, `checkedInAt`):

| Field | Category | Rationale |
|-------|----------|-----------|
| `*.createdAt` | Absolute Instant | `@default(now())` — server-assigned, already UTC. |
| `*.updatedAt` | Absolute Instant | `@updatedAt` — server-assigned, already UTC. |
| `Ticket.issuedAt` | Absolute Instant | Set to `new Date()` on creation. Wall-clock, but used for ordering only. |
| `Ticket.usedAt` | Absolute Instant | Set to `new Date()` on consumption. |
| `Ticket.cancelledAt` | Absolute Instant | Set to `new Date()` on cancellation. |

---

## Engineering Rules

### Rule 1 — No Direct `new Date(string)` for Business Logic

Every `new Date(string)` call that parses user input must be replaced with the appropriate shared helper. The only exceptions are:
- `new Date()` (no arguments) — returns "now", epoch-based, safe
- `new Date(number)` — epoch-based construction, safe
- `new Date(year, month, day)` — Calendar Date construction, only in `booking/create/route.ts`

### Rule 2 — Single Source of Truth

Timezone constants exist in exactly one place: `src/lib/time.ts`, exported as `IST_OFFSET`.

### Rule 3 — No Timezone Conversion in Routes

Routes must not perform timezone conversion. All conversion happens in `src/lib/time.ts`. Routes call the appropriate parser and use the resulting Date.

### Rule 4 — No Duplicate Parsing Logic

Every temporal parsing operation must use the shared helpers. If a new parsing need arises, extend `src/lib/time.ts` — do not create ad-hoc parsing in routes.

### Rule 5 — Classification Before Implementation

Every new DateTime field must first be classified as one of:
- Calendar Date
- Local Wall Clock
- Absolute Instant

Choose the corresponding shared helper before writing any parsing code.

### Rule 6 — Parser Validation

Every parser in `src/lib/time.ts` validates its input format and fails fast with a descriptive error. Silent interpretation of ambiguous input is forbidden.

---

## Architecture Summary

```
src/lib/time.ts          ← ONE shared module
  IST_OFFSET             ← ONE timezone constant
  parseCalendarDate()    ← Calendar Date parser
  parseLocalWallClock()  ← IST wall-clock parser
  parseUTCIso()          ← Absolute Instant parser
  bookingDateTimeFromIST ← Booking reconstruction (CD + LWC → UTC)

6 consumers:
  cron/reminder/route.ts
  lib/tickets.ts
  innovation/programs/route.ts
  innovation/programs/[id]/route.ts
  meetings/route.ts
  tasks/route.ts

SAFE (no change needed):
  All @default(now()) / @updatedAt fields
  All frontend-pre-converted UTC ISO paths
  All epoch-based comparisons
  All Calendar Date -> new Date("YYYY-MM-DD") paths
```
