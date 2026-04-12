# Committee Evaluation Module - Implementation and End-to-End Workflow

## Purpose
This document explains what has been implemented for the Committee Evaluation module, how the workflow runs from setup to final scoring, and how each role should use the system.

The module is intentionally isolated from hackathon, open-problem, and facility-booking business logic.

## What We Implemented

### 1) Dedicated Roles and Access
- Added role support for Evaluator.
- Role-based routes and guards:
  - Admin: manages event, tracks, evaluators, rubric, and results.
  - Evaluator: views assigned students and submits rubric scores.
  - Student: registers for committee evaluation and views final score.

### 2) Dedicated Committee Data Model
The following committee-specific entities were implemented:
- CommitteeEvent
- CommitteeTrack
- CommitteeRegistration
- CommitteeRubricItem
- CommitteeScore

Recent enhancement:
- Rubric item weight support was added.
- Weighted score computation is now used for final result generation.

### 3) Complete API Surface for Committee
Implemented APIs include:

Admin APIs
- GET/POST /api/committee/admin/event
- PATCH /api/committee/admin/tracks/[id]
- POST /api/committee/admin/evaluators
- POST/PUT /api/committee/admin/rubric
- GET /api/committee/admin/results

Student APIs
- GET /api/committee/event
- POST /api/committee/register
- GET /api/committee/my-registration

Evaluator APIs
- GET /api/committee/evaluator/students
- POST /api/committee/evaluator/score

### 4) Full UI Flows
- Admin panel page: /admin/committee
- Student dashboard page: /dashboard/committee
- Evaluator dashboard page: /evaluator/dashboard
- Evaluator scoring page: /evaluator/score/[registrationId]

### 5) Navigation and Discoverability
- Navigation links were added so roles can directly reach committee pages.
- Book Facility button and dropdown stability were also refined in navbar updates done during this phase.

## Workflow - From Setup to Student Result

## Phase A: Admin Setup
1. Admin creates one active committee event.
2. Admin adds tracks while creating event.
3. Admin assigns or updates room numbers per track.
4. Admin creates evaluator accounts.
5. Admin creates rubric criteria with:
   - Criterion label
   - Maximum score
   - Weight
   - Display order
6. Rubric is locked automatically once scoring starts.

Important rule:
- After first score submission is recorded, rubric edits are blocked to preserve fairness and consistency.

## Phase B: Student Registration
1. Student opens /dashboard/committee.
2. If active event exists, student selects a track and registers.
3. Student can see:
   - Event name
   - Selected track
   - Track room (or pending room text)

Registration rules:
- Student can only register in active event.
- Duplicate registration for same active event is blocked.

## Phase C: Evaluator Scoring
1. Evaluator opens /evaluator/dashboard.
2. Evaluator sees tracks and student list.
3. Evaluator opens Score Student screen.
4. For each rubric criterion, evaluator enters:
   - Score (bounded by max score)
   - Optional feedback
5. Scores are saved per combination of:
   - registrationId
   - rubricItemId
   - evaluatorId

Behavior:
- If evaluator submits again, existing score rows are updated (upsert behavior).
- Evaluator sees criterion max score and weight while scoring.

## Phase D: Weighted Result Calculation
Final student outcome now uses weighted rubric logic.

For each rubric item:
- Take average of all evaluator scores for that item.
- Convert to normalized item performance: average divided by max score.
- Multiply by item weight.

Then:
- Sum weighted item values across all criteria.
- Divide by total rubric weight.
- Convert to percentage and round to 2 decimals.

Final weighted percentage formula:
Weighted Percentage = ((Sum over rubric items of ((Average Score / Max Score) x Weight)) / Total Weight) x 100

Completion rule:
- Result is treated as completed only when all rubric items have at least one score for that student.

## Phase E: Result Visibility

Admin View
- Admin results page shows:
  - Student and track
  - Per-rubric score details
  - Weighted result percentage
  - Completion status
- CSV export includes weighted score and completion status.

Student View
- Student dashboard now shows evaluation block with:
  - Final Weighted Score (after completion)
  - In-progress message while evaluation is not fully completed

## Validation and Guardrails Implemented

Role Authorization
- Admin-only endpoints reject non-admin requests.
- Evaluator-only endpoints reject non-evaluator requests.
- Student-only endpoints reject non-student requests.

Input Validation
- Event creation requires title and at least one track.
- Rubric requires at least one criterion.
- Max score must be positive integer.
- Weight must be positive number.
- Scoring cannot exceed criterion max score.

Data Integrity
- Unique student registration per active event.
- Unique score row per evaluator per student per criterion.
- Rubric lock after scoring begins.

## Operational Notes for Committee Team

Recommended execution order for each evaluation cycle:
1. Create active event.
2. Define tracks and rooms.
3. Create evaluator accounts.
4. Define and verify rubric criteria with weights.
5. Ask students to register.
6. Start evaluator scoring.
7. Monitor admin results and export when required.
8. Students can view final weighted score in their committee dashboard after evaluation completion.

## Technical Paths Reference

Primary pages
- /admin/committee
- /dashboard/committee
- /evaluator/dashboard
- /evaluator/score/[registrationId]

Primary APIs
- /api/committee/admin/event
- /api/committee/admin/tracks/[id]
- /api/committee/admin/evaluators
- /api/committee/admin/rubric
- /api/committee/admin/results
- /api/committee/event
- /api/committee/register
- /api/committee/my-registration
- /api/committee/evaluator/students
- /api/committee/evaluator/score

## Current Status
- Weighted scoring is implemented and active.
- Student-facing score visibility is implemented on /dashboard/committee.
- Build verification has passed.

If needed, a short one-page committee SOP can be created from this document for non-technical members.
