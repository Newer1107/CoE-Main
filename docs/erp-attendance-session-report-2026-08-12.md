# TCET CoE-Main — ERP Attendance: Session Report (2026-08-12)

**Repo:** https://github.com/Newer1107/CoE-Main · **Prod:** https://tcetcercd.in · **Dev:** :6356 (coe_db_dev) / **Prod DB:** coe_db on tcetcercd-main

---

## 1. What we implemented (all live on prod)

| # | Feature | Details |
|---|---|---|
| 1 | **ERP attendance sync (Phase 1)** | Python/rapidocr fetcher → queue worker → snapshots in DB. Attendance tab in student portal: subject table grouped Theory/Practical/Tutorial, overall %, period, stale badge (>24h). |
| 2 | **Per-user ERP password** | One-time encrypted password (AES-256-GCM, key derived from JWT_ACCESS_SECRET), **live-validated against the ERP on save**, used only for that user's syncs. Stored off the users table per user preference. |
| 3 | **Human captcha fallback** | When OCR fails (OCR_FAIL/OCR_UNSURE/LOGIN FAILED/EMPTY_REPORT), the student gets the captcha image + input; the typed answer resumes the **exact saved ERP session** (cookies + viewstate) and completes the sync. |
| 4 | **Refresh rate limit** | 2 presses / 5 min per student — **server-enforced** (`attendance_refresh_limits` table, atomic reset/increment predicates, 429 + retryAfterSeconds). UI: button becomes `Wait Ns` countdown + red limit note. |
| 5 | **Daemon worker (pm2 `erp-sync`)** | Replaced the 2-minute cron: claims jobs every 3s, claim loop decoupled from processing, token-bucket spawn spacing, `ERP_WORKERS=2` concurrency cap (memory). |
| 6 | **Daemon hardening** | 15s/180s timeouts on every DB await in the loop, unhandled-rejection backstop, **watchdog** (claim loop stall >90s → process exits → pm2 restarts), breaker open/close logging. |
| 7 | **Data-quality pause** | 10 consecutive empty reports → 10-min pause with **auto-probe recovery** (after expiry the next claim probes the ERP: data → reset, empty → re-pause). Empties no longer trip the network breaker. |
| 8 | **Instant "ERP not responding" UI** | Worker publishes pause state (`erp_paused_until`, epoch seconds, in `attendance_stats`); both attendance APIs return `erpPaused`; the UI shows the honest message on the **first poll** (no waits). 60s age check kept as fallback for silent daemon deaths. Queued copy neutralized: *"Queued — waiting for the sync worker."* |
| 9 | **Retry-once-on-empty** | A correct captcha solve landing on an empty ERP node requeues once **without the solve flag** → fresh session, fresh node-lottery ticket. Capped at attempts 2; fast path unchanged. |
| 10 | **UX polish** | Spinning loader during sync; amber "Under development — testing phase" banner; **Attendance · NEW** navbar button (mobile Signed-In card + desktop dropdown, students only); live progress (queued / fetching / attempt N/2 / elapsed timer). |
| 11 | **Admin usage stats** | `attendance_stats` counters (tab views, refresh presses incl. deduped, captcha asks, password saves) + live `usersLinked` → **ERP Attendance Stats** card in admin → Innovation → Analytics. |
| 12 | **Admin registrations chart** | Student registrations per day (last 30 days) on admin Overview — hand-rolled SVG bar chart (navy bars, gold peak day, count labels, tooltips, total/peak summary). No chart library added. |
| 13 | **Host upgrade readiness** | pm2 auto-start enabled + `pm2 save`; host upgraded 3.3GB → 8GB RAM; everything auto-returned post-reboot (site 200, queue clean). |

**Deployed commits (today):** `a4ffdcf`, `d5e2d2f`, `3da21a9`, `ae7d8a0`, `627dbb2`, `9110ce9`, `ac01593`, `8ac0b09`, `0a70ff7`, `1e15a98`, `8f4af40`, `cdcc3d1`, `cdd2ece`, `0ec51d6`, `b9d783e`, `7279fd8`, plus PR #34 merge (`2a96b29`).

**Quality gates:** `scripts/checks/erp-checks.ts` — 10/10 asserts (parser fixtures, circuit breaker, queue claim/dedupe/reclaim/sweep, stats counter, rate limit, empty-retry predicate, pause state machine). tsc 0 errors, `npm run build` green.

---

## 2. What we tried and what happened

| Attempt | Result |
|---|---|
| Single-command prod setup (venv + cron + .env in one line) | Failed 3×: missing `python3-venv` (installed), my malformed quote (fixed), wrong cwd (auto-cd added). Eventually **replaced entirely by the pm2 daemon**. |
| **`.env` wipe disaster** (my `>` vs `>>` bug) | Prod `.env` destroyed. Recovery chain: runner env ✗, pm2 dump ✗, git history ✗, dev `.env` ✗ (JWT mismatch proven by minted-token probe → 401). **Recovered from `.next/standalone/.env`** — the build-time snapshot of the original env (30 keys incl. real JWT/MINIO/SMTP/GOOGLE/CRON secrets). Verified: token minted with restored secret → prod authed endpoint 200. |
| "Stuck on QUEUED" #1 | Hung interactive `$transaction` froze the claim loop (daemon online, silent). Manual restart drained in 20s. → timeouts + watchdog. |
| "Stuck on QUEUED" #2 | My own timeout fix introduced an unhandled-rejection crash loop (racing promise's loser rejected late). → `.catch` on the original promise + global unhandledRejection logger. |
| "Stuck on QUEUED" #3 (root cause) | **PARSE_EMPTY was tripping the network breaker** — 3 empties opened a 10-min claim pause, cyclically. → empties get their own data-quality pause; breaker guards only real outages. Breaker logging exposed it instantly. |
| "Correct captcha but ERP unreachable" | Raw HTML dump: `lblmsg` error class, empty period dates, table `display:none`, body identical for every account. **Diagnosis: the ERP is a multi-node LB mid-rollover** — same session flips empty↔full within seconds; two different post-auth crash messages (`Index was outside the bounds of the array` vs `Cannot find table 0`) prove different backends; the old period (01/07 → 12/08) ended **today**. |
| OCR improvement (3 preprocessing variants) | Conf 0.6 → 1.0 on hard captchas. Did **not** fix `LOGIN FAILED (mismatch)` — that's cross-node captcha validation, not OCR. |
| Force a specific ERP node? | **Not possible**: reachable frontend (14.96.40.78) routes per-connection; backend IPs not enumerable; alternate DNS IP (123.63.255.13) dead (4/4 timeouts). → retry-once + pauses instead of node-pinning. |
| Memory pressure | 5 concurrent rapidocr fetchers (~1.5–2GB RSS each) OOM-killed on the 3.3GB host (dmesg: python 2.9GB anon). → `ERP_WORKERS=2`; user upgraded host to 8GB. |
| Keep-alive session coherence (discussed, **not built**) | Would reuse one TCP connection per cycle (captcha→login→report) so the LB sticks to one backend: kills random captcha mismatches + mid-cycle flips. Doesn't fix the empty-node share; deferred until ERP stabilizes. |
| Notification hook (discussed, **not built**) | The only missing piece: students aren't nudged when a queued sync completes — they must revisit the page. |

---

## 3. Roadblocks (current)

1. **ERP backend inconsistency (main blocker, external)** — nodes mid-rollover: some serve old-period data, some an empty shell. This is **CASERP's side** (a message to the ERP admins is the real fix). Everything we built routes around it; nothing we do changes their nodes. Self-resolves when the rollover finishes or the new period publishes.
2. **Per-account password validation** — the "password ignored" defect exists **only** for `S1032241230`; every other student must enter their real ERP password (handled by the encrypted per-user flow).
3. **Captcha OCR imperfect** — rapidocr still misreads some draws → human-captcha fallback covers it but adds a step during the empty window.
4. **No completion notification** — queued jobs complete server-side (7-day lifetime, 10-min probe recovery) but students must return to the page to see results.
5. **Optional keep-alive refactor** — deferred fetcher surgery; worth it only if cross-node mismatches persist after the rollover.

---

## 4. Current state

- **Prod healthy**: site 200, daemon online (watchdog self-heals), queue drains instantly, pause flag live, students see the honest "ERP not responding" state instantly during pauses, admin sees live stats + chart.
- **Feature is in testing phase** (banner visible to students); everything degraded gracefully: empties → captcha-ask or honest pause; retries double the node-lottery odds.
- **The only thing between "works with hiccups" and "fully stable" is the ERP rollover completing.**
