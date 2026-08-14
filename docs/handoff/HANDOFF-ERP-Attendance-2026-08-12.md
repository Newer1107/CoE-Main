# HANDOFF — TCET CoE-Main ERP Attendance Work (2026-08-12)

**Read this first.** Fresh agent: this doc gets you current. Do NOT re-derive from scratch — verify state, then continue.

---

## 1. What this project is

TCET CoE-Main hackathon portal (Next.js 16 + Prisma + MySQL + MinIO). Repo: `/home/raunak/CoE-Main` (branch `main`, GitHub: Newer1107/CoE-Main, Deploy COE workflow auto-deploys on push). Dev server: `npx next start -p 6356` (dev DB `coe_db_dev`). Prod: https://tcetcercd.in (host `tcetcercd-main`).

Today's work: **ERP attendance sync** — students fetch their TCET ERP attendance into the portal. Everything below is LIVE on prod and in testing phase (banner shown to students).

Full session report (implemented/tried/roadblocks): `docs/erp-attendance-session-report-2026-08-12.md` (repo, also saved to the knowledge graph: `projects/coe-main/CoE ERP Attendance — Session Report 2026-08-12`).

---

## 2. Architecture (files)

- `scripts/erp_fetch.py` — Python fetcher (rapidocr OCR, DNS pin, 4 attempts, exit 2 = all failed with reason lines `attempt N/4 failed: <reason>`). Modes: `fast` (fetch→OCR→login→rows), `solve <cap>` (resume saved session), `captcha` (fetch session + captcha image only), `probe`, `fetch/login/report/shot`. **Python 3.14 quirk: OCR confidence must be `float()`-cast.** Preprocessing: 3 variants (grayscale/binarized/inverted).
- `scripts/sync-erp-attendance.ts` — queue worker (pm2 daemon `erp-sync`): SKIP LOCKED claim (3s poll), CLAIM_BATCH=2 (ERP_WORKERS), token-bucket, 90s fetcher timeout, circuit breaker (network-level only), **data-quality pause** (10 consecutive empties → 10-min pause + auto-probe; publishes `erp_paused_until` epoch-seconds to `attendance_stats`), retry-once-on-empty, wrong-captcha → fresh captcha card once, watchdog (loop stall >90s → exit → pm2 restart), timeouts on all DB awaits, unhandled-rejection backstop.
- `src/lib/erp-attendance.ts` — `deriveErpUid` (email local part → `S`+upper), `parseErpOutput`, `CircuitBreaker`, `encryptErpPassword`/`decryptErpPassword` (AES-256-GCM keyed from JWT_ACCESS_SECRET), `reverseErpUid`, `shouldRetryEmptySolve`, `bumpAttendanceStat`.
- API routes: `src/app/api/attendance/route.ts` (GET data+`hasPassword`+`erpPaused`), `…/refresh/route.ts` (POST, rate limit 2/5min via `attendance_refresh_limits` table, 429+retryAfterSeconds), `…/status/route.ts` (GET job+erpPaused), `…/password/route.ts` (POST, live ERP probe validates), `…/captcha/route.ts` (GET image from `/tmp/erp/<jobId>/captcha.png`, POST answer → QUEUED+captchaText).
- UI: `src/components/hackathons/AttendanceSection.tsx` (all states: password form, captcha card, live progress + spinner, instant "ERP not responding" via erpPaused, friendly error map per lastError, failedBox above last-good table, "sync complete while away" banner via localStorage, rate-limit countdown, testing banner, timestamped footer). Mounted in `PortalClient.tsx`.
- Admin: `ErpStatsCard.tsx` (counters in Analytics tab), `RegistrationsChart.tsx` (SVG, Overview tab), `/api/admin/attendance-stats`.
- Navbar: Attendance·NEW button (mobile card + desktop dropdown, STUDENT only).
- Checks: `scripts/checks/erp-checks.ts` — **10 asserts, run: `npx tsx --env-file=.env scripts/checks/erp-checks.ts`** (expect ALL CHECKS PASSED (10)).
- Tables: `attendance_snapshots`, `attendance_sync_jobs` (+`captchaText`, `claimantId`), `attendance_stats` (key/value incl. `erp_paused_until`), `attendance_refresh_limits`. User columns: `erpPasswordEnc`, `erpPasswordSetAt` (user insisted: nothing else on users table).

---

## 3. Current state (verified live this session)

- Prod: site 200, daemon online, queue drains instantly, pause flag auto-clears.
- ERP: **multi-node LB mid-rollover** — nodes inconsistent: some serve old-period data (01/07→12/08), some empty shells. Flapping (was serving data at last check). **This is CASERP's side — the real remaining blocker.** We cannot force nodes (per-connection routing, alt IP dead). Retries/pause/UX route around it.
- Sync flow: refresh → QUEUED → daemon claims → fast (OCR fail → captcha card) → solve → empty → one fresh-node retry → honest FAILED or SUCCESS (snapshot stored atomically). Queued jobs complete automatically when ERP answers (10-min probe). Proven live: 14 auto-successes in one window.
- Deployed commits today: `a4ffdcf` → `e8ba19f` (all via Deploy COE). Latest: `e8ba19f` (sync-complete banner + timestamp).
- Quality: checks 10/10, tsc 0, build green.

---

## 4. Working way (CRITICAL — user-enforced rules)

1. **HARD RULE: implement → screenshot on dev (CDP) → user verifies → explicit "push" → ONLY THEN commit+push+deploy.** Never touch prod (incl. pm2 restarts, .env) without approval. Broken once (2026-08-12) — user reasserted strictly.
2. Verify DB impact before prod changes. Never rebuild prod `.env` in place (`>` bug wiped it once) — recovery source: `.next/standalone/.env` (build snapshot). After any .env rewrite: key count + JWT probe before reload.
3. Screenshot method: headless chrome CDP via `scripts/_*.tmp.mjs` (mint JWT with dev secret + `jsonwebtoken`, `Network.setCookie`, navigate `localhost:6356/hackathons/portal`, dismiss 'Later' modal, `Page.captureScreenshot`). Delete temp scripts after. User reviews on desktop + 390px mobile.
4. Prod ops via paramiko (venv `~/.hermes/venvs/erp/bin/python`), host `tcetcercd-main` (tailnet 100.66.254.8), user `tcetcercd`. **SSH/sudo password: ask Raunak (not in this file).** Non-TTY sudo: `echo <pw> | sudo -S`.
5. Deploy flow: `git push` → wait `gh run list` for "completed success" → verify `curl -s -o /dev/null -w "%{http_code}" https://tcetcercd.in/` = 200. After worker changes: `pm2 restart erp-sync --update-env` (+ `rm -rf scripts/__pycache__` on host).
6. Fetcher stays Python (NOT TS). ERP sessions die in minutes — use immediately. Logs carry error codes only, never attendance data or passwords. Never accept `uid` from client input (derive from session email).
7. Test account: `1032241230@tcetmumbai.in` → `S1032241230` (RAUNAK ARUN SINGH). ERP password default in fetcher is public in repo (flagged). Only this account ignores ERP password validation.
8. External output: no Hermes mentions, no emojis, professional.
9. After heavy work: log a Notion Tasks row + bump project Last worked (user rule).
10. ERP-state tables stay separate from users table (user preference).

---

## 5. Diagnose-first playbook (learned today)

- **"Stuck on QUEUED"** → check pm2 `erp-sync` uptime/restarts + daemon log (`pm2 logs erp-sync --lines 60 --nostream`) for `data-quality:` pause line, `breaker: OPEN`, watchdog exit, or `daemon loop error`. Pause = by design (10 min, auto-resumes). Breaker = 3 consecutive network-level failures. Then check `erp_paused_until` in attendance_stats.
- **PARSE_EMPTY everywhere** → ERP nodes empty (rollover). Probe: `ERP_USER=S1032241230 ~/.hermes/venvs/erp/bin/python scripts/erp_fetch.py fast --workdir /tmp/erp/x` — flips empty↔full per attempt = node lottery, not our bug.
- **LOGIN FAILED (mismatch)** → cross-node captcha validation or wrong saved password (UI shows password form). Not OCR.
- **Job not claimed** → daemon stall or pause; watchdog self-heals in ~2 min.
- Break the UI test data after use (delete seeded jobs) — dev DB only, never prod data.

---

## 6. Roadblocks / open items

1. **ERP rollover inconsistency** (external) — recommend user messages CASERP admins: "attendance report inconsistent across servers since rollover". Nothing more to do code-side.
2. **Notification hook** — DONE via localStorage banner (no push notifications; fine for now).
3. **Keep-alive session coherence** — deferred fetcher refactor; only worth it if mismatches persist post-rollover.
4. **Persistent OCR engine** — optional memory optimization (one model vs per-spawn), not needed on 8GB.
5. Possibly untrack `out-certs/` + `scripts/personal-certificates.ts` from the repo (user's personal certs; ask).

---

## 7. Suggested skills for the next agent

- `tcet-erp-attendance` (productivity) — USER-OWNED skill; do not curator-edit; contains original fetcher + ERP quirks.
- `webapp-screenshots` / `headless-browser-automation` — CDP screenshot flow used for the user-verify step.
- `hermes-agent` — only if configuring Hermes itself.
- `handoff` — for producing the next handoff.
