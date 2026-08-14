# Google Form → Hackathon Import — System Design

Goal: import college Google Form hackathon registrations into the portal as event
teams, with **zero teams left behind** and **every field utilized**. Generic for any
form-driven event, built into the hackathon ops module (Phase 1).

Real data grounding (SIH 2026 form, 312 rows): 312 unique leader emails but only
~230 real teams (same team submitted under multiple members' emails); 178 gmail
leaders; members have no emails; 50 missing mentors; 7 missing PS; class-local
roll numbers.

---

## 1. Data model (additive, one migration)

```
Claim +=
  importKey       String?   @unique   // sha256(row id + leader email + timestamp) — idempotency
  sourceEmail     String?             // form submission email (may differ from owner account)
  leaderPhone     String?             // normalized phone from the form
  sourceProblem   String?   @db.Text  // original PS text (kept verbatim)
  mentorName      String?             // form mentor free text
  roster          Json?               // members without accounts: [{name, rollNo, branch, year, cls}]
  mergedFrom      Json?               // duplicate submissions merged into this team:
                                      //   [{email, leaderName, timestamp}] — nothing lost
  claimTokenHash  String?   @unique   // HMAC token for unlinked leaders to claim their team
  claimedAt       DateTime?
  @@index([eventId, status])  // (via Problem → event; keep claim-level lookup fast)
```

- `ClaimMember` (account-linked) still used for leaders/members we CAN resolve.
- `roster` + `mergedFrom` are the "no student left behind" carriers: every person
  from every submission exists somewhere (canonical roster or merged list).
- No schema change to `Problem` — imported rows map onto event problems; unmatched
  PS goes to a per-event catch-all problem (auto-created on first import: "Open
  Innovation — Imported").

## 2. Import pipeline (admin, per event)

### 2.1 Upload & parse
`POST /api/innovation/events/[id]/ops/import?mode=preview|commit` (ADMIN, multipart xlsx/csv)
- Parse with **fuzzy header auto-map**: `"Name of the team leader"` → leaderName,
  `"ROLL NO "` → leaderRoll, `"TEAM MEMBER 1 NAME & ROLL NO"` → member1, etc.
  Unknown headers listed; mapping shown in preview and storable per-event
  (`HackathonEvent.config.importColumnMap`) so re-imports skip re-mapping.
- Normalize every cell: phones (excel float → digits), emails (lowercase/trim),
  rolls (string), names (title-trim), timestamps (excel serial → ISO).

### 2.2 Cluster & dedupe (union-find)
- Nodes = rows. Edges = **any shared member roll number**, OR same leader email,
  OR same (leaderRoll + normalized PS).
- Canonical row per cluster = earliest timestamp. Others → `mergedFrom` (their
  email/leader/timestamp preserved) and marked merged in the report.
- Junk rows (non-numeric leader roll with no member overlap, placeholder names,
  "123" rolls, the known garbage row) → **quarantine list** in the report — never
  silently dropped: coordinator can "import anyway" or "discard (remembered)".

### 2.3 Link & map
- **Leader → User**: match by email (tcetmumbai.in). Match → create ClaimMember
  role LEADER. No match → team imported with `sourceEmail` + claim token.
- **Members → User**: match by exact email if a member cell ever contains one
  (rare) or by uid-format roll when it matches the portal's uid pattern. All other
  members → `roster` JSON. (Matching by class-local roll is unsafe — never used.)
- **PS → Problem**: normalized keyword overlap with the event's problem titles;
  score ≥ threshold → assign; else catch-all problem; `sourceProblem` always kept.

### 2.4 Preview → commit
- Preview shows: teams found, merged duplicates, linked/unlinked leaders, members
  in roster, missing PS/mentor counts, quarantine list, per-problem distribution.
- Commit = one `$transaction` (all claims + members + roster), idempotent via
  `importKey` (re-import updates nothing already present; report lists skipped).

## 3. Zero-team-left-behind mechanisms

| Case | Mechanism |
|---|---|
| Same team, multiple submissions | Union-find cluster → one claim, all others in `mergedFrom` (emails kept) |
| Garbage / placeholder rows | Quarantine list in report — coordinator decides; decision remembered |
| Leader has no portal account | Claim token (HMAC, emailed to `sourceEmail`) + **auto-claim on login**: any login whose email matches an unlinked claim's `sourceEmail` links it automatically |
| Missing PS | Catch-all problem + flag list for reassignment; original text kept |
| Missing mentor | `mentorName` kept + "unassigned mentor" admin list (Phase 2 assign UI) |
| Member has no account | `roster` entry; **member self-join**: on login, a user whose email/uid matches a roster entry sees "Join my imported team" — auto-approved on exact match |
| Non-tcetmumbai email leaders | Still imported + claim token sent to that email; they register and claim |

No row is ever dropped from the system: canonical, merged, or quarantined — all
three lists are visible and persisted.

## 4. Utilization of every field

- **Branch / year / class** → participant analytics (existing analytics module),
  venue grouping (Phase 1 venues), roster display.
- **Phones** → `leaderPhone` contact list: WhatsApp/SMS broadcast hooks (reuses the
  WhatsApp Business API tooling) for venue, results, notices.
- **Mentor** → `mentorName` → Phase 2 mentor assignment (faculty links).
- **PS text** → problem mapping + per-problem analytics; `sourceProblem` retained.
- **Team size** → venue capacity planning (Phase 1).
- **Timestamps** → canonical-row selection (earliest wins) + submission analytics.

## 5. API surface (all ADMIN except claim endpoints)

```
POST /api/innovation/events/[id]/ops/import?mode=preview|commit   multipart file
GET  /api/innovation/events/[id]/ops/import/report                last import summary
POST /api/innovation/events/[id]/ops/import/claim                 {token} → links leader
GET  /api/import/claim?token=…                                    landing (validates + logs in)
POST /api/innovation/events/[id]/ops/import/join                  {rosterIdx} member self-join
```
- Claim token = HMAC-signed (JWT_ACCESS_SECRET) `{claimId, email}` — no DB token
  column beyond the hash; expires 7 days; re-issuable by admin.
- Auto-claim on login: in the login/register success path, `sourceEmail = session
  email AND claimTokenHash != null` → link silently, notify via portal banner.

## 6. Edge cases (enforced in code, not just UI)

- **Re-import same file** → all rows skipped by `importKey`; report shows "0 new".
- **Import into event with existing claims** → only new `importKey`s created; no
  touching existing claims (matching by sourceEmail could merge — v2, documented).
- **Cluster spanning two different PS texts** (member overlap, different PS) →
  canonical keeps earliest PS; conflict listed in report for coordinator review.
- **Two leaders, same email, different teams** → separate claims (email not the
  cluster key alone — combined with roll/member overlap).
- **Phone normalization** (excel 7.0052279E9, "+91 83298 15655", "‪84240 74786‬") →
  digits-only, strip leading 91/0, store E.164-ish string; duplicates flagged.
- **Member appears in two different teams' rosters** (genuine cross-team member) →
  allowed (roster is metadata), flagged in report for coordinator awareness.
- **Claim token used twice** → second use 409 (tokenHash cleared on first claim).
- **Quarantine decision persistence** → stored in `HackathonEvent.config.importQuarantine`
  (list of skipped row keys) so a later re-import skips them silently but visibly.

## 7. Phasing

1. **Import core**: parse + auto-map + normalize + union-find dedupe + roster +
   catch-all problem + preview/commit + idempotency. (This alone gets SIH in.)
2. **Claim & join**: claim tokens + claim email + auto-claim on login + member
   self-join + quarantine persistence.
3. **Utilization**: mentor assign (Phase 2), venue grouping, WhatsApp/SMS contact
   hooks, analytics for imported teams (branch/year/PS breakdowns).

## 8. Verification

- `scripts/checks/hackathon-ops-checks.ts` additions: union-find cluster count on
  a synthetic 10-row set (known expected clusters), idempotency (double import →
  0 new), token claim once-only, roster-vs-account linking rules.
- Dev E2E with the REAL SIH file on `coe_db_dev`: expect ~230 teams, merged list,
  quarantines, unlinked leaders with tokens, catch-all problem assignment; report
  numbers cross-checked against the raw sheet.
- Screenshots: admin import preview + report; student "claim my team" + "join"
  flows (desktop + 390px).
- Prod: one additive migration; existing events untouched.
