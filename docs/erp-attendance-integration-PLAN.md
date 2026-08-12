# ERP Attendance Integration — Implementation Plan

**Feature:** Read-only ERP attendance inside the CoE portal (student profile tab + optional admin class view)
**Status:** Pending approval (proposal: `erp-attendance-integration-proposal.md`) · This document = engineering plan
**Stack context:** Next.js 16 (App Router, `src/`) · Prisma + MySQL · self-hosted via pm2 (`tcetcercd-main`) · crons guarded by `CRON_SECRET` · scripts via `npx tsx`

---

## 1. Architecture

```
Student profile (Attendance tab)
        │  GET /api/attendance          POST /api/attendance/refresh
        ▼                                        ▼
┌─────────────────┐                    ┌──────────────────────────┐
│  Attendance API │◄──────────────────►│  Sync queue (MySQL)      │
└────────┬────────┘                    └───────────┬──────────────┘
         │ read                                   │ poll (worker loop,
         ▼                                        │  concurrency 5)
┌─────────────────┐                    ┌──────────▼──────────────┐
│ AttendanceSnap- │                    │ scripts/sync-erp-       │
│ shot (MySQL)    │                    │ attendance.ts           │
└─────────────────┘                    │  spawns python fetcher  │
                                       │  per job (child_process)│
                                       └──────────┬──────────────┘
                                                  ▼
                              erp_attendance.py (proven fetcher:
                              fetch → OCR captcha → login → parse)
```

**Key decisions**
- **Keep the Python fetcher as-is** (proven: ~7s, OCR conf ~1.0). Porting OCR to TS = onnxruntime-node, unnecessary risk. The TS side only spawns it and parses its stdout rows.
- **Queue-backed sync, not request-time fetch.** A 7s outbound call inside a Next.js route is fragile (pm2 timeouts, ERP flakiness). The route enqueues; the worker pool drains; the UI polls status.
- **DB is always the render path.** The page never waits on the ERP.

## 2. Data model

```prisma
model AttendanceSnapshot {
  id         Int      @id @default(autoincrement())
  uid        String                        // ERP ID = "S" + email local part
  subject    String
  type       String                        // TH | PR | TU
  present    Int
  total      Int
  percentage Float
  periodStart DateTime?                    // from report header, when present
  periodEnd   DateTime?
  fetchedAt  DateTime @default(now())
  @@index([uid])
}

model AttendanceSyncJob {
  id        Int      @id @default(autoincrement())
  uid       String
  status    String   @default("QUEUED")    // QUEUED | RUNNING | SUCCESS | FAILED
  attempts  Int      @default(0)
  lastError String?
  createdAt DateTime @default(now())
  startedAt DateTime?
  finishedAt DateTime?
  @@index([uid, status])
}
```

- Migration: `npx prisma migrate dev` on dev; `migrate deploy` on prod (deploy pipeline does this automatically).
- No changes to `User`/`StudentProfile`.

## 3. Sync service

**`scripts/sync-erp-attendance.ts`** (pattern: existing `scripts/backfill-certificates.ts`):
- Loop: claim up to 5 `QUEUED` jobs (`UPDATE ... SET status='RUNNING' WHERE id IN (SELECT ... LIMIT 5)` — atomic claim via `updateMany` guarded by `status='QUEUED'`, stamped with a claimant id so a second worker instance never double-claims), spawn one `python3 erp_attendance.py <uid>` per job via `child_process`, concurrency 5, with a **per-job temp dir**.
- The fetcher **self-retries up to 4× with fresh sessions** (transient 404s, POST timeouts — pentest M6; a timed-out POST burns the single-use captcha, so a retry must restart the whole cycle, which the script does).
- On success: upsert `AttendanceSnapshot` rows (delete old rows for that uid, insert fresh, in a `$transaction`), mark job `SUCCESS`.
- On failure (exit 2 / timeout 90s / parse fail): `attempts+1`; retry once after 30s; then `FAILED` with `lastError` (log error code only — never the data).
- Run modes: (a) drain loop when invoked by cron, (b) `--daemon` for continuous draining. Start via the existing cron infra (`CRON_SECRET`-guarded route or cron entry every 2 min during 6:00–23:00).

**Circuit breaker (global backoff):** the worker tracks consecutive attempt failures across ALL jobs. After 3 in a row (any cause: 404 wave, timeouts, ban), it stops claiming jobs for 10 minutes and logs `CIRCUIT_OPEN`. Without this, a down ERP turns one student's click into 4 requests × N queued students = a self-inflicted flood against a dead box. Reset counter on first success.

**Critical fix required before concurrency: parameterize the Python script's temp paths.** Today the script uses fixed `/tmp/erp_jar.pkl`, `/tmp/erp_vs.txt`, `/tmp/erp_captcha.png` — two concurrent runs clobber each other's session cookies and captchas. Change to per-run dir (`TMPDIR`/`--workdir <dir>` arg, e.g. `/tmp/erp/<jobId>/`). Single-instance use (current `fast` flow) is unaffected.

## 4. API surface

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/attendance` | portal session | Returns snapshot rows for `uid` (derived server-side from session email — **never from client input**) + `lastSyncedAt` + `syncStatus` of latest job |
| `POST /api/attendance/refresh` | portal session | Enqueue job if no QUEUED/RUNNING job for uid (dedupe); return `{ jobId, status }` |
| `GET /api/attendance/status` | portal session | Job status for uid (for UI polling) |

Admin (phase 2): `GET /api/admin/attendance?below=75` — admin role gate, class summary.

**uid derivation:** `email.split("@")[0]` → if no `@tcetmumbai.in` domain → tab hidden with "ERP account not linked to this email" message. (Verify against a sample of real user emails during dev — if some are `firstname.lastname@...` style, add an admin mapping table instead.)

## 5. UI (profile tab)

States: `no-sync-yet` · `queued` (progress: "Syncing… try again in ~15s", auto-poll status every 5s, max 2 min) · `success` (table + overall % + last-synced stamp + Refresh) · `failed` (keep last good snapshot if any + "ERP unreachable, retry later") · `empty` ("No attendance recorded for this period").

## 6. Edge cases (exhaustive)

| # | Case | Handling |
|---|---|---|
| 1 | **Concurrent syncs clobber temp files** | Per-job temp dir (see §3 critical fix) |
| 2 | **Student double-clicks Refresh / spam** | Dedupe: existing QUEUED/RUNNING job for uid → return same job, no new row |
| 3 | 100 students click at once | Queue + 5 workers ⇒ ~2.5–3 min drain; ERP sees ≤5 concurrent requests; DB/Next.js unaffected |
| 4 | ERP down / timeout / 404 wave / 500 | Fetcher self-retries 4× fresh; worker retries once more; **circuit breaker pauses the whole queue 10 min after 3 consecutive failures** — no self-inflicted flood; UI keeps last snapshot + "retry later" |
| 5 | **OCR misread (EMPTY_REPORT)** | Script exits 2 (guard added 2026-08-12); worker retries once; second failure = FAILED. Never store empty table over a good one |
| 6 | **Truly empty attendance (new semester, no classes yet)** | Report has period header but no subjects — same signature as #5. Discriminator: retry once; if still empty after a correct-captcha run, store nothing and surface "No attendance recorded" (manual check flag `reportShape: 'EMPTY_OK'` reviewed in dev) |
| 7 | **Non-TCET email / no ERP ID derivable** | Tab hidden + message; admin mapping table if needed |
| 8 | **ERP has no record for the ID** (transfer, typo) | Report renders no period header at all → distinct parse result; FAILED with "no record" error, UI shows "ERP has no record for this account — contact office" |
| 9 | **Job crashes mid-write** | Snapshot upsert is transactional (delete+insert in `$transaction`); RUNNING jobs older than 10 min are reclaimed as FAILED by the worker (stale-claim sweep) |
| 10 | **Portal user deleted/disabled** | Snapshots orphaned; cleanup sweep deletes snapshots for uids with no active user (weekly cron) |
| 11 | **ERP IP changes** (DNS pin 14.96.40.78) | Script reads pin from env/config, not hardcode; monitor job pings ERP weekly, alerts on failure |
| 12 | **Student changes email domain / password** | No password stored ⇒ nothing breaks; email change re-derives uid on next refresh (old snapshots cleaned by #10 or on-success replace) |
| 13 | **Refresh during bulk admin sync (phase 2)** | Same queue + per-uid dedupe; on-demand job and bulk job merge (one job per uid) |
| 14 | ERP returns an error page instead of report | Parser detects no rows / login form present → FAILED, no partial write |
| 15 | **ERP report format changes** (new columns, layout shift) | Parser stamps `parserVersion` + expected shape onto every parse; a shape that matches no known version fails loudly (`UNKNOWN_SHAPE`) instead of storing garbage — alert + keep last good snapshot |
| 16 | Period header missing dates | `periodStart/End` nullable; UI shows "synced at" (portal time) always, period dates when present |
| 17 | **Semester rollover** (period resets) | Snapshot rows carry `periodStart/End` from the report; new semester refresh replaces rows naturally; UI shows the report's period, so stale-semester data is visibly labeled |
| 18 | OCR model missing on prod host | Deploy step installs venv (rapidocr+pillow, ~60 MB) + DejaVu fonts; smoke test in CI/deploy verify runs `fast --selfcheck` |
| 19 | Rate limiting / ban risk | Never more than 5 in flight, min 1s gap between job starts (token bucket); circuit breaker doubles as ban protection (3 consecutive fails → 10 min pause) |
| 20 | Job queue growth unbounded | Sweep deletes jobs older than 7 days; FAILED jobs deleted after 48h (keep lastError only in logs) |
| 21 | **Feature needs emergency off** | Env flag `ATTENDANCE_ENABLED=false` hides the tab + 403s the API + pauses the worker — kill switch without a deploy; default on after approval |
| 22 | **Silent degradation** (ERP half-working: 60% success) | Per-hour success-rate metric; rate < 50% or circuit opens → alert to ops (and ERP IT contact); students see stale badge, never wrong data |
| 23 | Privacy | Logs/errors carry uid + status only, never attendance rows; API owner-only; no PII in sync logs |
| 24 | UI renders stale data as fresh | `lastSyncedAt` always shown; snapshot older than 24h gets amber "stale" badge + prompt to refresh |

## 7. Security

- No passwords collected or stored (ERP ignores them anyway — finding H1).
- Owner-only: uid always derived server-side from the session, never client-supplied.
- Approval gate: feature ships only after ERP/IT consent (see proposal §6). Mechanism relies on the disclosed auth defect — read-only attendance page only, nothing else.
- Audit: every refresh creates a queue row (who/when) — cheap audit trail.
- Admin view (phase 2) behind existing admin role; no new privilege.

## 8. Deployment notes (prod host `tcetcercd-main`)

1. `python3 -m venv ~/erp-sync/.venv && pip install rapidocr-onnxruntime pillow` (one-time)
2. Env: `ERP_FETCHER=~/erp-sync/erp_attendance.py`, `ERP_WORKERS=5`
3. Cron entry (existing infra): `sync-erp-attendance` every 2 min, `--drain` mode
4. `npx prisma migrate deploy` via existing deploy pipeline
5. Smoke test post-deploy: `curl` status route + one real refresh for a test account

## 9. Testing & verification

- **Unit:** uid derivation (edge emails), queue dedupe/claim logic, circuit breaker (3-fails → open → timeout → reset), parser on recorded report fixtures (good / empty / no-record / login-form / unknown-shape).
- **Integration (dev):** live refresh for own account (existing proven path); simulate ERP-down by pointing fetcher at a dead port → verify FAILED + stale-snapshot behavior + circuit opens after 3; 20-jobs-in-queue load run → verify drain ~30s, no temp-file collisions; `ATTENDANCE_ENABLED=false` → tab hidden, API 403, worker pauses.
- **UI:** screenshot verification at desktop + 390px per repo convention; all 6 UI states.
- **Per convention:** one runnable check per non-trivial module (assert-based demo for parser + queue + breaker).

## 10. Rollout

| Phase | Scope | Gate |
|---|---|---|
| 0 | Approval (proposal doc) | ERP/IT + HoC sign-off |
| 1 | Schema + fetcher parameterization + queue/worker + student tab | Dev verified with real account; screenshot review |
| 2 | Admin class view + below-75% summary + bulk nightly sync | HoC review on dev |
| 3 | Prod deploy | Explicit approval + DB impact check (new tables only, no existing data touched) |

## 11. Operations runbook (post-launch)

- **ERP unresponsive > 10 min:** circuit breaker holds; students see stale badge. Check `CIRCUIT_OPEN` in worker logs; alert goes to ops + ERP IT contact (the college owns the fix — findings H1/M6).
- **Success rate < 50%:** investigate per-error distribution (404 vs timeout vs OCR) from the hourly metric; likely ERP-side; do not tweak the worker blindly.
- **Format change (UNKNOWN_SHAPE):** parser needs updating — snapshot fixture of the new report, update parser + `parserVersion`, deploy. Old snapshots stay visible (stale badge) until refresh works.
- **Feature off:** set `ATTENDANCE_ENABLED=false`, redeploy not required; UI hides tab, API 403s, worker pauses. On-call only needs env access.
- **Rollback:** schema change is additive (two new tables); drop them + disable flag if a full revert is ever needed.
