# Scoring System — Full Implementation Reference

## 1. Data Model

### RubicCategory (`rubric_categories`)

| Column | Type | Purpose |
|---|---|---|
| `id` | Int (PK) | Auto-increment |
| `eventId` | Int | FK → HackathonEvent |
| `key` | String | Unique per event (e.g. `p1_1`, `p3_3`) |
| `label` | String | Human-readable question text |
| `weight` | Int | **Parent: 20/20/25/20/15** (determines contribution to final score). **Child: 1** (each YES = 1 toward the param's 5/5 numerator) |
| `order` | Int | Display ordering |
| `isCritical` | Boolean | `true` = critical question (C), `false` = supporting (S). A critical NO may constrain recommendation |
| `parentCategoryId` | Int? | `null` = parent parameter row. Set = child question under that parent |

**Hierarchical structure (SIH event 7):**

```
Parent: Problem Understanding & Impact (weight=20, order=1, parentCategoryId=null)
├── p1_1  Problem Definition          (weight=1, isCritical=true)
├── p1_2  User Need                   (weight=1, isCritical=true)
├── p1_3  Evidence                    (weight=1, isCritical=false)
├── p1_4  Problem–Solution Fit        (weight=1, isCritical=true)
└── p1_5  Impact                      (weight=1, isCritical=false)

Parent: Innovation & Differentiation (weight=20, order=2)
├── p2_1  Existing Landscape          (C)
├── p2_2  Market Gap                  (C)
├── p2_3  USP                         (C)
├── p2_4  Innovation                  (S)
└── p2_5  Competitive Advantage       (S)

Parent: Technical Excellence (weight=25, order=3)
├── p3_1  Architecture                (C)
├── p3_2  Technology Choice           (C)
├── p3_3  Technical Depth             (C)
├── p3_4  Robustness                  (S)
└── p3_5  Technology Advantage        (S)

Parent: Validation, Feasibility & Scalability (weight=20, order=4)
├── p4_1  Working Solution            (C)
├── p4_2  Validation                  (S)
├── p4_3  Evidence of Results         (C)
├── p4_4  Feasibility                 (S)
└── p4_5  Scale                       (S)

Parent: Solution Quality, UX & Presentation (weight=15, order=5)
├── p5_1  User Experience             (S)
├── p5_2  Product Value               (C)
├── p5_3  Demonstration               (C)
├── p5_4  Communication               (C)
└── p5_5  Team Defence                (S)
```

Total: **16 Critical, 9 Supporting**

### RubicScore (`rubric_scores`)

| Column | Type | Purpose |
|---|---|---|
| `id` | Int (PK) | |
| `claimId` | Int | FK → Claim |
| `rubricCategoryId` | Int | FK → RubicCategory (the child question) |
| `score` | Int | **Binary: 1 = YES, 0 = NO** |
| `comment` | String? | Single comment per team (stored on one row, reused for display) |
| `round` | Int | Judging round (supports multi-round revisiting) |

Unique on `(claimId, rubricCategoryId, round)`.

### Claim (`claims`)

Relevant score fields:
- `finalScore: Int?` — computed on event close (0–100)
- `score: Int?` — mirrors finalScore for backward compat
- `feedback: String?` — not used for binary system

---

## 2. Event Lifecycle & Scoring Flow

```
UPCOMING → ACTIVE → JUDGING → CLOSED
                         ↑
                    Judges score here
```

### Phase: JUDGING

1. **Judges access** `/judging` → JudgePortal loads their assigned event + claims
2. **Judge scores** each team by clicking YES/NO on 25 questions (binary toggle)
3. **Save** sends `{ rubricValues: { [childCategoryId]: 0|1 }, comment: "string" }` to `POST /api/innovation/judge/claims/[id]/score`
4. **Backend** upserts one `RubicScore` row per child category (score=0 or 1)
5. **Rounds**: judges can score the same event multiple rounds (round counter advances via coordinator panel); only the LAST round's scores count for final calculation

### Phase: CLOSED (triggered by coordinator/admin)

When the admin moves the event to CLOSED:

1. **All IN_PROGRESS claims → SUBMITTED**
2. **Binary score calculation** for every claim with rubric scores:
   - Load all `RubicCategory` rows for the event
   - Build parent→child mapping
   - For each claim's last round scores:
     - Group child scores by parent
     - Count YES answers per parent (score > 0 = YES)
     - `paramScore = (YES count / 5) × parentWeight`
     - `finalScore = sum(paramScores)` → rounded to integer, 0–100
   - Write `finalScore` and `score` on the Claim
3. **Leaderboard** computed (ranked by `finalScore` desc, then `score` desc)
4. **Email results** sent to every team member with: team name, score, rank, leaderboard link
5. **Certificates** auto-issued in background (achievement for top-3, participation for present members)

---

## 3. Score Calculation — The Binary Formula

```
For each parent parameter P (5 total):
  YES_count(P) = count of child scores where score > 0
  paramScore(P) = (YES_count(P) / 5) × P.weight

finalScore = Σ paramScore(P)  →  max 100
```

**Example:**
- Problem Understanding: 3/5 YES → (3/5) × 20 = 12
- Innovation: 4/5 YES → (4/5) × 20 = 16
- Technical: 5/5 YES → (5/5) × 25 = 25
- Validation: 3/5 YES → (3/5) × 20 = 12
- UX/Presentation: 4/5 YES → (4/5) × 15 = 12
- **Total: 12 + 16 + 25 + 12 + 12 = 77 / 100**

---

## 4. APIs

### `POST /api/innovation/judge/claims/[id]/score`

Judge saves scores for one team.

**Request:**
```json
{
  "rubricValues": {
    "26": 1,
    "27": 0,
    "28": 1,
    "...": "0 or 1"
  },
  "comment": "Single comment for the team"
}
```

**Key validation:**
- Claim must belong to the event
- Judge must be assigned to the event (via JudgeAssignment)
- Venue scope enforced (if judge is venue-scoped, claim must be in their venue)
- Event must be in JUDGING status
- Score values validated against category existence (not range — binary 0/1 accepted)

**Storage:**
- One `RubicScore` upsert per category in `rubricValues`
- Comment stored on each row (denormalized for query simplicity)

### `GET /api/innovation/judge/claims`

Returns the judge's scoped queue:
- `categories`: all RubicCategory rows for the event (parents + children)
- `claims`: filtered by venue scope, each with `rubricScores` for current round
- `round`: current judging round number
- `maxRound`: configured max rounds

### `GET /api/innovation/events/[id]/ops/scores`

Coordinator panel scoreboard (ScoresTab):
- Returns categories, claims with rubricScores, problems, round
- Coordinator can override any score with a reason (logged as `[OVERRIDE]` prefix in comment)

### `PATCH /api/innovation/admin/events/[id]/status` (CLOSED transition)

The binary score calculation lives here (lines 88–134 of status/route.ts).

---

## 5. UI Components

### JudgePortal (`/judging`)

Binary rubric interface for judges:
- 5 parameter sections (parent categories), each with 5 YES/NO toggle buttons
- Critical questions marked with gold star ★
- One comment textarea per team (not per question)
- Save button sends all 25 binary values + comment in one request
- Pre-fills from existing scores (clicking a saved YES/NO highlights it)
- Toggle behavior: click active state to clear (undefined), click other to switch

### ScoresTab (`/admin/events/[id]` → Scores tab)

Coordinator review panel:
- Shows each claim with rubricScores grouped by category
- Displays `totalFor(claim)` = sum of all scores (for binary, this is the YES count)
- Coordinator can override any individual score with a reason
- Shows presentation slots and problem assignments
- Binary score is NOT displayed as weighted here — the raw YES count is shown

### Leaderboard (`/innovation/events/[id]`)

Student-facing results page:
- Only visible when event is CLOSED (or config `leaderboard.visibleAfter: "LIVE"`)
- Shows: rank, team name, problem, score, members
- Optionally shows judge comments (gated by `config.ops.commentsToStudents`)
- Score comes from `claim.finalScore` (the weighted calculation, not raw sum)

---

## 6. Key Gotchas

1. **`RubicScore.score` is binary (0/1)** — the API accepts any integer, but the UI sends only 0 or 1
2. **`finalScore` is computed, not sum** — the old system summed scores directly; the new binary system computes weighted param scores. The close-event handler does the conversion
3. **Rounds** — only the LAST round's scores count for final calculation. Previous rounds are preserved in DB but ignored for finalScore
4. **Override scores** — coordinator can override individual question scores with `[OVERRIDE]` prefix in comment. These overrides count in the finalScore calculation
5. **Critical questions** — currently the isCritical flag is stored but NOT enforced in the scoring engine. A critical NO does not cap the score — it's a UI indicator only. Recommendation gating was described in the PDF but not yet implemented
6. **Comment** — stored on every RubicScore row for the team (denormalized). The leaderboard only shows comments when `config.ops.commentsToStudents` is true and event is CLOSED
7. **Legacy fields** — `Claim.innovationScore`, `technicalScore`, etc. still exist from old events. The new binary system uses `finalScore` + `score` only

---

## 7. File Map

| File | Role |
|---|---|
| `prisma/schema.prisma` | RubicCategory + RubicScore models |
| `src/app/api/innovation/judge/claims/[id]/score/route.ts` | Judge saves scores (POST) |
| `src/app/api/innovation/judge/claims/route.ts` | Judge loads claims + categories (GET) |
| `src/components/judging/JudgePortal.tsx` | Judge binary scoring UI |
| `src/app/api/innovation/admin/events/[id]/status/route.ts` | Close event → binary score calc → email results |
| `src/components/admin/CoordinatorPanel.tsx` (ScoresTab) | Coordinator score review + overrides |
| `src/app/api/innovation/events/[id]/ops/scores/route.ts` | Scores API (GET + PUT override) |
| `src/app/api/innovation/events/[id]/leaderboard/route.ts` | Leaderboard (visible when CLOSED) |
| `src/app/innovation/events/[id]/page.tsx` | Event page with leaderboard + student view |
| `src/app/hackathons/[id]/EventDetailClient.tsx` | Hackathon event page (leaderboard section) |
