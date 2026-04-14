# Industry Internship Module: Implementation and Process Guide

## 1. Purpose and Scope

This document explains how the Industry Internship module is implemented in the current CoE system, how users move through the workflow, and which backend/frontend parts support each step.

The module was built as an extension of the existing Innovation system (not a separate parallel product), so it reuses existing entities like:

- `problems`
- `applications`
- `problem_questions`
- `application_answers`
- faculty review APIs and screens

## 2. Core Design Principle

The internship flow is implemented by adding role/type/approval metadata over existing innovation tables and workflows.

Instead of creating duplicate tables such as `internship_problems` or `internship_applications`, the system distinguishes internship records using:

- `Problem.problemType = INTERNSHIP`
- `Problem.approvalStatus` for admin moderation
- `User.role = INDUSTRY_PARTNER` for ownership and permissions

Benefits:

- One unified review and application engine
- Lower maintenance and less schema drift
- Consistent UX and API behavior across open problems and internships

## 3. Data Model Changes

### 3.1 Prisma schema updates

Implemented in `prisma/schema.prisma` and migration `prisma/migrations/20260414120000_add_industry_internship_module_extensions/migration.sql`.

Added/extended:

- `Role`
  - added `INDUSTRY_PARTNER`
- `ProblemType`
  - `OPEN`
  - `INTERNSHIP`
- `ProblemApprovalStatus`
  - `PENDING_APPROVAL`
  - `APPROVED`
  - `REJECTED`
- `Problem` model fields:
  - `problemType`
  - `approvalStatus`
- DB indexes:
  - `problems_problemType_idx`
  - `problems_approvalStatus_idx`

### 3.2 Existing entities reused

No new internship-specific problem/application tables were created.

The following existing entities power the module:

- `Problem`
- `ProblemQuestion`
- `Application`
- `ApplicationAnswer`
- `StudentProfile`

## 4. Roles and Responsibilities

### 4.1 ADMIN

- Creates industry partner accounts
- Approves/rejects internship opportunities
- Can view internal/pending internship opportunities

### 4.2 INDUSTRY_PARTNER

- Creates internship opportunities
- Can only create `problemType = INTERNSHIP`
- Cannot attach internship opportunities to hackathon events
- Reviews applications for problems they own

### 4.3 STUDENT

- Views approved internship opportunities on public listing
- Applies through existing application flow
- Sees internship submissions in `My Submissions`

### 4.4 FACULTY

- Uses existing innovation workflow
- Internship workflow review primarily follows ownership model (problem creator)

## 5. End-to-End Workflow

## 5.1 Admin creates industry partner account

API:

- `POST /api/admin/industry-partners`

Implementation:

- Admin-only authorization
- Validates payload with `industryPartnerCreateSchema`
- Hashes password and creates user with role `INDUSTRY_PARTNER`

## 5.2 Industry partner creates internship opportunity

UI:

- `/innovation/faculty/problems/create`
- Role-aware form in `CreateProblemClient`

API:

- `POST /api/innovation/problems`

Behavior:

- Industry partner requests are forced server-side to `problemType = INTERNSHIP`
- Internship defaults to `approvalStatus = PENDING_APPROVAL`
- `industryName` required for internship opportunities
- Event-linked internship creation is blocked
- Optional support PDF and custom questions are supported

## 5.3 Admin moderation of internship opportunity

UI:

- `/innovation/faculty` (admin view includes pending internship approvals)
- Admin panel has dedicated Industry Internship tab for operations and quick access

API:

- `PATCH /api/innovation/problems/[id]`

Behavior:

- Only admin can change `approvalStatus`
- Internship opportunities can be approved or rejected
- `problemType` is immutable after creation

## 5.4 Public visibility

Students/public only see internship opportunities when all are true:

- `problemType = INTERNSHIP`
- `approvalStatus = APPROVED`
- `status = OPENED`
- `mode = OPEN`
- `eventId = null`

UI entry points:

- `/industry-internship`
- Innovation landing quick links
- Navbar Programs dropdown
- Home popup labels internship opportunities explicitly

## 5.5 Student application

API:

- `POST /api/innovation/applications`

Validation:

- Student role required
- Complete student profile required
- Duplicate application prevented by `(userId, problemId)` uniqueness
- Only open/approved/non-event problems are application-eligible

Notes:

- Internship and open-problem applications share this exact endpoint
- Custom question answers are stored in `application_answers`

## 5.6 Industry partner reviews applications

API:

- `GET /api/innovation/faculty/applications`
- `PATCH /api/innovation/faculty/applications/[id]/review`

Behavior:

- Access includes `INDUSTRY_PARTNER`
- Non-admin users only see/review applications for their own problems
- Review statuses: `SUBMITTED`, `SELECTED`, `REJECTED`
- Notification emails are attempted on `SELECTED` and `REJECTED`

## 5.7 Student submission history and archive behavior

UI:

- `/innovation/my-submissions`

Data:

- Combines:
  - `/api/innovation/claims/my` (hackathon claims)
  - `/api/innovation/applications/my` (open + internship applications)

Internship submissions are shown and marked archived when lifecycle is no longer active, for example:

- problem status is not `OPENED`, or
- mode is not `OPEN`, or
- approval status is not `APPROVED`

## 6. Key API Reference (Internship-Relevant)

### Admin

- `POST /api/admin/industry-partners`
  - Create industry partner user account

### Problems

- `GET /api/innovation/problems`
  - Supports `problemType`, `approvalStatus`, `visibility`, `ownerOnly`, etc.
- `POST /api/innovation/problems`
  - Creates open or internship opportunities (role constrained)
- `PATCH /api/innovation/problems/[id]`
  - Update status/approval/details with role checks

### Applications

- `POST /api/innovation/applications`
  - Student applies to open/intership opportunities
- `GET /api/innovation/applications/my`
  - Student application history (used by My Submissions)
- `GET /api/innovation/faculty/applications`
  - Reviewer queue for owners/admin
- `PATCH /api/innovation/faculty/applications/[id]/review`
  - Reviewer decision + feedback

## 7. Frontend Surfaces

### Admin surfaces

- `/admin` -> Operations -> Industry Internship tab
  - Create partner account
  - View partner list
  - Quick links to internship pages

### Industry partner surfaces

- `/innovation/faculty`
  - Workspace and moderation for owned opportunities
- `/innovation/faculty/problems/create`
  - Internship creation flow
- `/innovation/faculty/applications`
  - Applicant review queue

### Student/public surfaces

- `/industry-internship`
  - Public internship listing
- `/innovation/my-submissions`
  - Internship submission history with archive labeling

## 8. Security and Validation Controls

Implemented controls include:

- Role-based API guards (`ADMIN`, `INDUSTRY_PARTNER`, `STUDENT`, `FACULTY`)
- Ownership checks for non-admin reviewer actions
- Admin-only approval status changes
- Immutable problem type after creation
- Enforced internship constraints:
  - Industry partner creation only
  - no hackathon event attachment
  - required industry name
- Student profile completeness checks before apply
- Duplicate application prevention

## 9. Current Known Constraints

- Badges and points are not implemented yet as first-class data fields for internship ranking/evaluation.
- Placeholder UX elements are present in some leaderboard-related surfaces to support future extension.

## 10. Planned Extension Path (Badges and Points)

To add points and badge systems later without breaking current flow:

1. Add persistent point/badge fields
- Option A: add fields on `Application`
- Option B: add normalized `application_badges` / `application_points_log` tables

2. Extend reviewer APIs
- Include badge assignment and point increments in review payload

3. Surface in student dashboards
- Show cumulative points and badge timeline in `My Submissions` and profile

4. Add admin analytics
- Distribution of badges/points by problem, partner, and time

## 11. Verification Checklist

Use this checklist for QA/UAT:

1. Admin can create industry partner account from admin Industry Internship tab.
2. Industry partner can create internship opportunity.
3. Newly created internship opportunity appears as pending approval for admin.
4. Admin approval makes it visible on `/industry-internship`.
5. Student can apply (only with complete profile).
6. Industry partner can review application from review workspace.
7. Student sees internship submission in `My Submissions`.
8. When internship lifecycle closes/rejects, student view marks it as archived.

---

If this workflow changes, update this file together with affected API and page components to keep implementation and documentation in sync.
