# Re-Collection Registration — System Design (Excel → Portal, no re-typing)

Decision: students re-register for the hackathon ON THE PORTAL. Data already implied
by a student's portal UID (branch, year, division, roll no) is **derived, never
re-asked**. The Excel becomes a **reconciliation checklist + outreach list**, not a
data source. Generic for any event.

## 1. What the portal already knows (audit result)

| Data | Where it lives | Re-ask? |
|---|---|---|
| Name, email | `User` | No (session) |
| Phone | `User.phone` (profile) | Prefill, editable |
| Branch, year, division, roll | **Encoded in `User.uid`** ("24-COMPD13-28") | **No — derived** |
| Team name, members | Existing register flow (members by **portal UID**, validated as registered students) | No — already UID-based |
| Problem statement | Event `Problem` dropdown (register → `Claim.problemId`) | No — dropdown, not free text |
| Mentor | **Not collected anywhere** | **New field** |

The portal's register flow already collects members by UID — which is exactly the
"don't ask what the UID encodes" principle. The only real gaps: leader phone
(prefill), mentor (new), and the UID→details derivation itself.

## 2. UID derivation layer (pure, shared)

`src/lib/student-info.ts` — `deriveStudentInfo(uid): { branch, yearOfAdmission, division, roll, currentYear, program }`

- Parse `YY-BRANCH-DIV-ROLL` (e.g. `24-COMPD13-28`):
  - `24` → year of admission → **currentYear** = SE/TE/BE via admission-year
    arithmetic (4-yr BTech; 3-yr BCA; 2-yr MCA handled by branch map)
  - `COMP` → branch name via code map (COMP/CSE/IT/AI&ML/AI&DS/E&CS/E&TC/IOT/
    MECH/MME/CIVIL/BCA/MCA/BVOC)
  - `D13` → division, `28` → class roll no
- **Snapshot rule**: derived info is snapshotted onto the claim at registration
  (`Claim.derivedInfo`), so future uid edits or parser changes never corrupt
  historical teams; analytics/venues read the snapshot.
- Unparseable uid (faculty, industry, old formats) → derivation returns null →
  the form shows a small manual fallback (branch/year/division/roll inputs),
  flagged as `manualOverride`.

## 3. Registration form changes (student, event page)

Extend the existing register flow — no new wizard:

1. **"Confirmed from your UID" strip** (read-only): branch · year · division ·
   roll — shown above the form, derived from the session uid. Manual fallback only
   when derivation fails.
2. **Leader phone**: prefilled from `User.phone` (or profile), editable, required.
3. **Team name**: existing field (required — was missing from the Excel).
4. **Members**: existing UID-based slots (name auto-resolves on valid member uid;
   branch/year/division/roll of each member derived + snapshotted). Members who
   aren't portal users get the existing "register these users first" guidance —
   this is the one real friction vs the Excel and is intentional (portal-verified
   teams).
5. **Problem statement**: existing event-problem dropdown.
6. **Mentor**: NEW optional text field (kept free-text like the Excel; Phase 2
   faculty-linking later).

`POST /api/innovation/events/[id]/register` gains `{ mentor?, leaderPhone? }`;
response includes `derived: deriveStudentInfo(uid)` for the strip.

## 4. Excel → reconciliation checklist (utilize, don't duplicate)

**Reference import** (admin, same pipeline as the import design — parse, normalize,
union-find dedupe — but writes reference rows, NOT claims):

```
model ImportReference {
  id            Int      @id @default(autoincrement())
  eventId       Int
  sourceKey     String   @unique   // sha256(row) — idempotent re-import
  leaderEmail   String
  leaderName    String
  leaderPhone   String?            // → outreach channel
  leaderRoll    String?
  branch        String?
  year          String?
  division      String?
  problemText   String?            // for coordinator awareness
  mentor        String?
  memberNames   Json?              // original roster, kept for comparison
  matchedClaimId Int?              // set when the team re-registers on the portal
  matchedAt     DateTime?
  @@index([eventId, matchedClaimId])
  @@map("import_references")
}
```

**Auto-match**: in the register success path, lookup `ImportReference` by
normalized leader email (or branch+roll fallback) → set `matchedClaimId`.
Leader sees a small banner: "We found your Excel submission — this registration
replaces it."

**Reconciliation UI** (admin, event ops): table of reference teams with status
`re-registered ✓` / `pending`; filters (branch, PS); **"not yet re-registered"
export** (name, phone, email) → WhatsApp/SMS nudge via the existing WhatsApp API
tooling. This is the zero-team-left-behind mechanism in the re-collect model:
the Excel phones become the follow-up channel.

## 5. Zero-team-left-behind (re-collect model)

| Risk | Mechanism |
|---|---|
| Team never re-registers | Reconciliation list + phone/email outreach (Excel phones) — persistent until matched |
| Student submits twice on portal | Existing unique(userId, eventId) rule → "already registered" |
| Member lacks portal account | Blocked with clear guidance (register first) + admin outreach list for those names from the Excel |
| Gmail leader (no portal account) | Can't log in → appears in reconciliation as pending forever → outreach by phone; account creation guided |
| UID unparseable | Manual fallback fields + `manualOverride` flag |
| Excel row already matched, student edits team | Reference stays matched (claim id stable); edits don't unlink |
| Re-import same Excel | Idempotent via `sourceKey`; existing matches preserved |

## 6. Utilization recap

- Excel phones → outreach (the entire point of keeping the Excel)
- UID-derived branch/year/division/roll → analytics + venue grouping (Phase 1)
- Mentor text → Phase 2 mentor assignment
- Member uids → verified rosters with derived details
- Reference matching → reconciliation metrics ("X of ~230 teams re-registered")

## 7. Delivery order

1. `deriveStudentInfo` + checks (branch map, year arithmetic, unparseable cases)
2. Form extension (phone prefill, mentor, derived strip, snapshot on register)
3. Reference import + auto-match + reconciliation UI + outreach export
4. (Phase 2 hook) mentor assignment from collected text

## 8. Verification

- Checks: uid parser fixtures (`24-COMPD13-28`, `23-CSE-A-05`, BCA/MCA variants,
  garbage → null), snapshot immutability, auto-match on email + branch+roll,
  idempotent reference re-import, duplicate register 409.
- Dev E2E: register a team as a test student → derived strip correct, snapshot
  written; import the real SIH Excel as references → match the test claim → others
  pending → export outreach list.
- Screenshots: registration form (desktop + 390px), reconciliation table,
  matched banner.
- Prod: one additive migration (`ImportReference` + `Claim.derivedInfo`/mentor/
  leaderPhone); existing flows untouched.
