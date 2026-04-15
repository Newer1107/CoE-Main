# Cron Endpoints Guide

This document explains every cron endpoint in this project, how to run them, and what parameters are supported.

## Quick Answer: Retry Emails From Cron

Use the email queue cron endpoint repeatedly:

- `GET /api/cron/email-queue`
- Include `x-cron-secret: <CRON_SECRET>` header (or `?secret=<CRON_SECRET>` query)
- Optional: `?limit=<number>` to control batch size (default `50`, max `500`)

Example:

```bash
curl -X GET "http://localhost:3000/api/cron/email-queue?limit=100" \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

How retries work:

- Jobs with status `PENDING` or `RETRY` and `nextAttemptAt <= now` are picked.
- Failed sends are moved to `RETRY` until attempts reach `maxAttempts` (default from `EMAIL_MAX_ATTEMPTS`, fallback `5`).
- Backoff is exponential and capped at 60 minutes: 1, 2, 4, 8, 16, ... minutes.
- Jobs in `FAILED` are exhausted and are not retried automatically by cron.

If a job is already `FAILED`, there is no built-in API parameter to force retry. You must reset it in DB/admin tooling (for example set status back to `RETRY`, clear lock/error as needed, and set `nextAttemptAt = now()`).

---

## Shared Auth Rules For Cron Routes

All cron routes are GET routes and require one of these:

1. `CRON_SECRET` configured and request provides matching secret:
- Header: `x-cron-secret: <CRON_SECRET>`
- Or query param: `?secret=<CRON_SECRET>`

2. If `CRON_SECRET` is not configured, fallback is admin auth (`ADMIN` user).

In production, always set `CRON_SECRET` and use header-based auth.

---

## Running Cron Endpoints

## 1) Local Development

Start app:

```bash
npm run dev
```

Call endpoint manually:

```bash
curl -X GET "http://localhost:3000/api/cron/reminder?secret=YOUR_CRON_SECRET"
```

PowerShell equivalent:

```powershell
Invoke-WebRequest -Method GET `
  -Uri "http://localhost:3000/api/cron/email-queue?limit=50" `
  -Headers @{ "x-cron-secret" = "YOUR_CRON_SECRET" }
```

## 2) Production Scheduler

Use any scheduler (Vercel Cron, GitHub Actions, cloud scheduler, server crontab) to hit the endpoint URL periodically.

Recommended patterns:

- `email-queue`: frequent (every 1-5 min depending on email volume)
- `reminder`: every 5-10 min
- `innovation-reminder`: every 5-10 min
- `problem-statement-notification`: every 5-15 min

Adjust frequencies based on load and desired latency.

---

## Endpoint Reference

## A) GET /api/cron/email-queue

Purpose:
- Drains queued emails from `email_jobs` table.
- Processes due jobs (`PENDING`, `RETRY`, stale `PROCESSING`).

Query parameters:

- `secret` (optional): cron secret if not using header.
- `limit` (optional): integer batch size.
  - Default: `50`
  - Max: `500`
  - Invalid/non-positive values fallback to `50`.

Headers:

- `x-cron-secret` (recommended)

Response (success):

```json
{
  "success": true,
  "message": "Email queue processed successfully.",
  "data": {
    "processed": 42,
    "sent": 39,
    "failed": 1,
    "retried": 2,
    "skipped": 0
  }
}
```

Notes:

- `failed` means attempts exhausted.
- `retried` means deferred for another retry window.

---

## B) GET /api/cron/reminder

Purpose:
- Sends booking reminders for confirmed bookings starting within next 30 minutes.
- Marks `booking.reminderSent = true` once sent.
- Cleans OTP rows older than 10 minutes.

Query parameters:

- `secret` (optional): cron secret.

Headers:

- `x-cron-secret`

Response (success):

```json
{
  "success": true,
  "message": "Cron executed. N reminder(s) sent."
}
```

---

## C) GET /api/cron/innovation-reminder

Purpose:
- Handles innovation event email workflows and event state transitions.

Query parameters:

- `secret` (optional): cron secret.
- `mode` (optional): controls which workflow runs.
  - `ALL` (default)
  - `UPCOMING_ALL_STUDENTS`
  - `ACTIVATE_REGISTERED`
  - `ENDING_REMINDER`
- `eventId` (optional): positive integer, scopes processing to one event.

Mode behavior:

- `UPCOMING_ALL_STUDENTS`:
  - Sends upcoming event broadcast to active students for upcoming events.
- `ACTIVATE_REGISTERED`:
  - Activates events where `startTime <= now` (UPCOMING -> ACTIVE).
  - Emails registered participants.
- `ENDING_REMINDER`:
  - Sends reminder for active events ending in next 30 minutes.
  - Marks `claim.reminderSent = true` for covered claims.
- `ALL`:
  - Runs all three workflows.

Examples:

```bash
curl -X GET "http://localhost:3000/api/cron/innovation-reminder?mode=ALL" -H "x-cron-secret: YOUR_CRON_SECRET"
curl -X GET "http://localhost:3000/api/cron/innovation-reminder?mode=UPCOMING_ALL_STUDENTS&eventId=12" -H "x-cron-secret: YOUR_CRON_SECRET"
curl -X GET "http://localhost:3000/api/cron/innovation-reminder?mode=ACTIVATE_REGISTERED&eventId=12" -H "x-cron-secret: YOUR_CRON_SECRET"
curl -X GET "http://localhost:3000/api/cron/innovation-reminder?mode=ENDING_REMINDER&eventId=12" -H "x-cron-secret: YOUR_CRON_SECRET"
```

Response (success):

```json
{
  "success": true,
  "message": "Innovation cron executed successfully.",
  "data": {
    "mode": "ALL",
    "eventId": null,
    "upcomingEventsNotified": 0,
    "upcomingNotificationsSent": 0,
    "activatedEvents": 0,
    "reminderEvents": 0,
    "remindersSent": 0,
    "activeNotificationsSent": 0
  }
}
```

Validation errors:

- If `eventId` is provided and is not a positive integer -> HTTP `400`.

---

## D) GET /api/cron/problem-statement-notification

Purpose:
- Finds open standalone problem statements not yet notified.
- Notifies active verified students.
- Marks `problem.notificationSent = true` after send.

Query parameters:

- `secret` (optional): cron secret.

Headers:

- `x-cron-secret`

Response (success):

```json
{
  "success": true,
  "message": "Problem statement notification cron executed successfully.",
  "data": {
    "processedProblems": 3,
    "emailsDispatched": 450,
    "errors": []
  }
}
```

Possible no-op success responses:

- No new problems to notify.
- No active verified students.

---

## Email Queue Controls and Parameters

Environment variables used by queue behavior:

- `EMAIL_MAX_ATTEMPTS` (default `5`)
- `EMAIL_PRIORITY_IMMEDIATE` (default `100`)
- `EMAIL_PRIORITY_BULK` (default `20`)

Cron parameter for queue processing:

- `/api/cron/email-queue?limit=<1..500>`

Operational meanings:

- `processed`: jobs claimed in this run.
- `sent`: successfully delivered.
- `retried`: failed this attempt but scheduled again.
- `failed`: exhausted retries.
- `skipped`: race/lock prevented claim.

---

## Practical Retry Playbook

If emails are delayed or failing:

1. Run queue drain manually with larger `limit`:

```bash
curl -X GET "http://localhost:3000/api/cron/email-queue?limit=200" -H "x-cron-secret: YOUR_CRON_SECRET"
```

2. Repeat until `processed` is near `0`.

3. Inspect admin snapshot endpoint (`GET /api/admin/emails`) for statuses (`PENDING`, `RETRY`, `FAILED`).

4. If many `FAILED` rows exist:
- Fix root cause first (SMTP OAuth token, credentials, network, provider limits).
- Then requeue failed rows using DB/admin operation (no direct cron query param exists for this).

5. Keep scheduler frequency high enough for expected throughput.

---

## Example Scheduler Calls

```bash
# Every 5 min: booking reminders
GET /api/cron/reminder

# Every 5 min: innovation lifecycle jobs
GET /api/cron/innovation-reminder?mode=ALL

# Every 2 min: queue drain
GET /api/cron/email-queue?limit=100

# Every 10 min: problem statement notifications
GET /api/cron/problem-statement-notification
```

All calls should send:

- Header `x-cron-secret: <CRON_SECRET>`

---

## Troubleshooting

`403 Forbidden`:
- Secret mismatch or missing admin auth fallback.

Queue not draining:
- Scheduler not hitting `/api/cron/email-queue` often enough.
- `nextAttemptAt` still in future for retry jobs.

Many `FAILED` jobs:
- `maxAttempts` exhausted; fix SMTP/auth first, then requeue manually.

Duplicate notifications concern:
- Queue uses dedupe keys for bulk sends; ensure calling systems provide stable dedupe behavior where relevant.
