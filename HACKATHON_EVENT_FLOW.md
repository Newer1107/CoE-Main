# Hackathon Event Lifecycle Flow (Create to Close)

This document explains the full system flow for hackathon events in this codebase, including:
- what happens after event creation
- status transitions
- who receives which emails
- how team ticketing works
- how attendance is marked
- what happens on event close

## 1) Core Data Model and Statuses

Main models involved:
- HackathonEvent
- Problem (linked to event)
- Claim (team registration and submission)
- ClaimMember (team roster)
- Ticket (team ticket for hackathon selection)
- TicketAttendance (per-member attendance row)
- EmailJob (email queue tracking)
- HackathonInterest (optional interest tracking before registration)

Event statuses:
- UPCOMING
- ACTIVE
- JUDGING
- CLOSED

Claim statuses seen in hackathon flow:
- IN_PROGRESS
- SUBMITTED
- SHORTLISTED
- ACCEPTED
- REVISION_REQUESTED
- REJECTED

Ticket statuses:
- ACTIVE
- USED
- CANCELLED

Member attendance statuses:
- NOT_PRESENT
- PRESENT

## 2) Actors and Permissions

- Admin:
  - creates event
  - changes event status
  - screens and judges claims
  - can verify tickets and mark attendance
  - can view all event interest and submission data
- Student:
  - can mark interest
  - can register team for event (must be lead)
  - can submit registration PPT
  - can view/download own ticket if they are ticket owner (normally team lead)
- Faculty (and Admin):
  - can verify ticket at check-in
  - can mark present team members through ticket verify API

## 3) Stage-by-Stage Flow

## Stage A: Event Creation (Admin)

API:
- POST /api/innovation/events

What happens:
1. Admin submits event details (title, description, start/end time, submission lock time).
2. Event is created with default status UPCOMING and registrationOpen true.
3. Problems for that event are created in bulk.
4. Optional PPT/PDF briefing file is uploaded and key stored.

Emails sent:
- None at creation time.

## Stage B: Optional Interest Tracking (Students)

API:
- POST /api/innovation/interest
- PATCH /api/innovation/interest
- GET /api/innovation/admin/interests (Admin view)

What happens:
1. Student clicks I am Interested:
   - creates HackathonInterest row (idempotent; duplicate request returns already interested).
2. Student can optionally add details (teamName, teamSize) using PATCH.
3. Admin can view per-event interest totals and student details (name, uid, phone, email).

Emails sent:
- None by interest endpoints.

## Stage C: Team Registration (Students)

API:
- POST /api/innovation/events/{id}/register
- GET /api/innovation/users/lookup (team UID validation helper)

What happens:
1. Student (must be lead) submits form data:
   - teamName, teamSize, teamLeadUid, memberUids, problemId, pptFile.
2. Validations enforce:
   - event exists and registration still open
   - event not closed and not past end time
   - teamSize equals lead plus members
   - no duplicate member UIDs
   - lead UID must match logged-in student UID
   - all members are active, verified students
   - no selected member is already in any claim for this event
3. Claim is created with members:
   - lead role for current user
   - member role for others
4. Registration PPT is uploaded and claim set to SUBMITTED.

Emails sent:
- No registration-confirmation email in this route currently.

## Stage D: Screening Decisions (Admin)

Primary API (bulk):
- PATCH /api/innovation/faculty/claims/sync with stage SCREENING

Alternative API (single claim review path):
- PATCH /api/innovation/faculty/claims/{id}/review

Bulk screening behavior:
1. Admin submits decisions per claim (SHORTLISTED or REJECTED).
2. Claim statuses are updated.
3. Screening result emails are sent to all member emails of each claim.
4. For SHORTLISTED claims, hackathon selection ticket is issued.
5. Queue drain is attempted after sync (processEmailQueue with limit 50).

Single review behavior:
1. Admin updates one claim (ACCEPTED or REJECTED etc based on schema).
2. Review email is sent to claim member emails.
3. If ACCEPTED and claim belongs to event, selection ticket is issued.

Emails sent:
- HACKATHON_SCREENING_RESULT to team members (bulk sync path).
- Innovation claim review email to team members (single review path).

## Stage E: Ticket Issuance for Selected Team

Service:
- issueHackathonSelectionTicketsForClaim

What happens when a team is selected/accepted:
1. One team ticket is created for the claim (type HACKATHON_SELECTION).
2. Ticket owner is team lead (userId stored on ticket).
3. Ticket PDF is generated with QR and uploaded to object storage.
4. TicketAttendance rows are created for each claim member with NOT_PRESENT.
5. Ticket issued email is sent to team lead email, with:
   - ticket details
   - attached PDF
   - team member table in email body

Important ownership detail:
- Only ticket owner sees it in GET /api/tickets/my.
- Admin or Faculty can still access/download the ticket directly.

Emails sent:
- TICKET_ISSUED (immediate send with PDF attachment).

## Stage F: Event Status Progression and Cron Jobs

Status transition rules:
- UPCOMING -> ACTIVE
- ACTIVE -> JUDGING or CLOSED
- JUDGING -> CLOSED
- CLOSED -> no next state

Manual status API:
- PATCH /api/innovation/admin/events/{id}/status

Cron API:
- GET /api/cron/innovation-reminder
  - mode UPCOMING_ALL_STUDENTS
  - mode ACTIVATE_REGISTERED
  - mode ENDING_REMINDER
  - mode ALL (default)

### F1) Upcoming Broadcast

When run:
- Cron mode UPCOMING_ALL_STUDENTS or ALL.

Recipients:
- all active students in system (not just registered participants).

Email:
- category HACKATHON_EVENT_UPCOMING_ALL.

### F2) Activation Notifications

When run:
- Cron mode ACTIVATE_REGISTERED or ALL.
- Finds events where status is UPCOMING and startTime has passed.
- Atomically updates event to ACTIVE.

Recipients:
- participant emails from claim members in that event.

Email:
- category HACKATHON_EVENT_ACTIVE.

Also possible manually:
- Admin can set status to ACTIVE via admin status PATCH, which also sends active email to participants.

### F3) Ending Reminder (30 minutes before end)

When run:
- Cron mode ENDING_REMINDER or ALL.
- Finds ACTIVE events ending in next 30 minutes.
- Finds claims with reminderSent false.

Recipients:
- unique emails of members in those claims.

Email:
- category HACKATHON_EVENT_REMINDER.

Post-send update:
- claim.reminderSent set to true for those claims to avoid duplicate reminders.

## Stage G: Check-in and Attendance Marking via Ticket

Primary API:
- POST /api/tickets/verify

Who can perform check-in:
- ADMIN and FACULTY only.

Flow for hackathon ticket:
1. Verify call with ticketId only:
   - returns team, event, and member attendance rows.
   - no attendance state changed yet.
2. Verify call with ticketId plus presentClaimMemberIds:
   - marks those selected member rows as PRESENT.
   - stores checkedInAt and checkedInByUserId.
3. If all members become PRESENT and ticket is ACTIVE:
   - ticket status auto changes to USED.

Flow for facility booking ticket:
- same verify endpoint consumes ticket directly (ACTIVE -> USED).

Deprecated endpoint:
- PATCH /api/innovation/faculty/claims/{id}/attendance
- now returns message to use ticket check-in instead.

## Stage H: Judging and Final Results

Bulk judging API:
- PATCH /api/innovation/faculty/claims/sync with stage JUDGING

What happens:
1. Admin sends rubric scores and final decision per claim (ACCEPTED or REJECTED).
2. Weighted final score is calculated and stored.
3. Rubric result email sent to claim members.
4. Queue drain attempted after sync.

Emails sent:
- category HACKATHON_JUDGING_RESULT.

## Stage I: Event Closure

API:
- PATCH /api/innovation/admin/events/{id}/status with status CLOSED

What happens:
1. Any IN_PROGRESS claims in event are auto-updated to SUBMITTED.
2. Event status becomes CLOSED.
3. Leaderboard is computed from final scores/scores.
4. For each claim with members, closure result email is sent to member emails with:
   - team name
   - score
   - rank (if available)
   - leaderboard link
5. Queue drain attempted after closure action.

Emails sent:
- category HACKATHON_EVENT_CLOSED_RESULT.

Post-closure read access:
- GET /api/innovation/events/{id}/leaderboard is available only when event is CLOSED.

## 4) Email Queue Behavior in This Lifecycle

Email sending strategy:
- Most innovation lifecycle emails are queued through dispatchEmail in bulk mode.
- Ticket issued email uses direct immediate SMTP send with attachment and writes SENT or FAILED email job record.

Queue processing:
- processEmailQueue is invoked after:
  - innovation reminder cron
  - claims bulk sync
  - admin event status update
- queue supports retries with exponential backoff and stale PROCESSING recovery.

Admin visibility:
- GET /api/admin/emails shows paginated queue snapshot with filters (status, mode, category).

## 5) Recipient Matrix (Who Gets What)

1. Upcoming event broadcast:
- To all ACTIVE students.
- Trigger: cron mode UPCOMING_ALL_STUDENTS or ALL.

2. Event active notification:
- To registered participant emails (claim members).
- Trigger: cron activation or admin manual status ACTIVE.

3. Event ending reminder:
- To claim member emails with reminderSent false.
- Trigger: cron ending reminder window.

4. Screening result:
- To claim member emails.
- Trigger: bulk sync stage SCREENING.

5. Judging rubric result:
- To claim member emails.
- Trigger: bulk sync stage JUDGING.

6. Claim review result (single review route):
- To claim member emails.
- Trigger: claim review PATCH.

7. Ticket issued:
- To team lead email (ticket owner), with team member list and PDF attachment.
- Trigger: when ticket is generated after shortlist/accept.

8. Closed event result with score/rank:
- To claim member emails.
- Trigger: admin sets event status to CLOSED.

## 6) Attendance Answer (Direct)

Who gets attendance marking:
- Attendance is tracked per team member (ClaimMember), not as one team flag.
- Attendance rows are pre-created at ticket issuance (NOT_PRESENT).
- Admin or Faculty marks specific members as PRESENT through POST /api/tickets/verify with presentClaimMemberIds.
- When all members are PRESENT, the team ticket is auto-marked USED.

## 7) Operational Notes

- There is a mail function for winners (sendInnovationWinnerEmail), but this lifecycle currently uses closure score email and does not automatically call winner email.
- The alias sendInnovationEventJudgingEmail exists for backward compatibility, mapped to active-email function.
- Registration can be blocked even before CLOSED if registrationOpen is false or event endTime has passed.
- Interest tracking is optional and separate from actual registration; it does not create tickets.
