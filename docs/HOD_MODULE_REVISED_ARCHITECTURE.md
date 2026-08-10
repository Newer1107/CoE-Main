> ## ⚠️ ARCHIVED — pre-implementation proposal (partially superseded)
>
> This document is an **architecture proposal written before implementation**.
> Parts of it have since shipped differently in CoE-Main; the project-dashboard
> pieces (HOD dashboard, DepartmentConfiguration, guide invitations) live in a
> separate repository and are not verifiable here. Do **not** use this file as
> a work order.
>
> **What actually shipped in CoE-Main (source of truth):**
> - `FacultyProfile.isHod` — implemented, migration
>   `20260709081652_add_is_hod_to_faculty_profile`
> - `Department` model with `Department.hodUserId`, `User.departmentId` and
>   `User.isCoordinator` — implemented in migration `20260807143558_migration`
>   (note: the plan argued *against* a Department table; reality created one)
> - HOD assignment API: `PATCH /api/admin/faculty/[id]/hod` (a dedicated
>   endpoint, where the plan proposed reusing `PATCH /api/faculty/profile`)
> - `isHod` is propagated in the shared token payload
>   (`buildSharedTokenPayload` in `src/lib/shared-auth.ts`) and used in
>   admin/impersonation routes
> - There is **no `/hod` dashboard in CoE-Main**; faculty surfaces live under
>   `/faculty` (FacultyPortalClient) and the admin panel

# HOD Module — Revised Architecture & Implementation Plan

> **Status:** Architecture Proposal — Pre-implementation  
> **Principle:** Extend, don't redesign. No unnecessary models. No new auth paradigms.

---

## Table of Contents

1. [Core Design Principles](#1-core-design-principles)
2. [Current Architecture Audit](#2-current-architecture-audit)
3. [HOD Is NOT A Separate Role](#3-hod-is-not-a-separate-role)
4. [Department Model — No Normalization](#4-department-model--no-normalization)
5. [Academic Year / Department Configuration](#5-academic-year--department-configuration)
6. [Database Design](#6-database-design)
7. [Synchronization Design](#7-synchronization-design)
8. [Authorization Design](#8-authorization-design)
9. [Faculty Guide Workflow](#9-faculty-guide-workflow)
10. [Analytics](#10-analytics)
11. [Business Rules](#11-business-rules)
12. [Edge Cases](#12-edge-cases)
13. [HOD Dashboard Architecture](#13-hod-dashboard-architecture)
14. [API Changes](#14-api-changes)
15. [File Modification List](#15-file-modification-list)
16. [Implementation Roadmap](#16-implementation-roadmap)
17. [Risks and Trade-offs](#17-risks-and-trade-offs)

---

## 1. Core Design Principles

1. **COE Main is the single source of truth** — for users, HOD assignments, and department ownership.
2. **Extend existing systems** — reuse sync pipeline, invitation system, analytics engines, email queue.
3. **Avoid unnecessary database models** — no Department table, no AcademicYear table (separate concepts), no analytics cache.
4. **No new authorization paradigms** — no new Role enum value, no new guard functions.
5. **Minimal schema changes** — additive fields only, no migrations that break existing data.
6. **Reuse existing infrastructure** — `syncDashboardUser()`, `upsertDashboardUser()`, `PendingProjectAssignment`, `dispatchEmail()`, `HealthEngine`, `AttentionEngine`.

---

## 2. Current Architecture Audit

### 2.1 COE Main — What Exists

| Component | File | Current State |
|---|---|---|
| User model | `prisma/schema.prisma:149-195` | `role: Role` enum (ADMIN, FACULTY, STUDENT, INDUSTRY_PARTNER). No HOD. No `isHod`. |
| FacultyProfile | `prisma/schema.prisma:348-361` | `department: String?` — free-text from hardcoded dropdown (12 branch names). No FK. |
| Sync payload | `src/lib/dashboard-sync.ts:26-34` | `SyncUserPayload` has `department?: string \| null` — field exists but **never populated**. |
| Sync trigger | `src/app/api/admin/faculty/[id]/approve/route.ts:31` | Calls `syncDashboardUser()` after faculty approval. Does NOT pass department. |
| Faculty approval | `src/app/api/admin/faculty/[id]/approve/route.ts` | Sets `status: ACTIVE`, sends email, syncs. |
| Faculty profile | `src/app/api/faculty/profile/route.ts` | GET/POST/PATCH. `department` is free-text. |
| Admin users API | `src/app/api/admin/users/route.ts` | Lists users with optional `?role=` and `?status=` filters. |
| Admin users detail | `src/app/api/admin/users/[id]/route.ts` | Returns full user + facultyProfile + relations. |
| Email service | `src/lib/mailer.ts` + `src/lib/email-delivery.ts` | 20+ templates, queue with bounce detection. |
| Internal lookup | `src/app/api/internal/users/lookup/route.ts` | `GET ?uid=` — returns `{ name, email, uid, role, status }`. |

### 2.2 Project Dashboard — What Exists

| Component | File | Current State |
|---|---|---|
| User model | `prisma/schema.prisma:181-212` | `role: Role` (ADMIN, TEACHER, STUDENT). `department: String?` — free-text. No `isHod`. |
| Role mapping | `src/lib/coe-auth.ts:13-18` | `mapCoERoleToDashboard()` — FACULTY→TEACHER, ADMIN→ADMIN, STUDENT→STUDENT. INDUSTRY→null. |
| Sync upsert | `src/lib/resolve-user.ts:51-193` | `upsertDashboardUser()` — creates/updates User, resolves PendingProjectAssignment. Already handles `department` field. |
| Auth guard | `src/lib/coe-guard.ts` | `requireRole(role)` — checks user.role against allowed roles. |
| Teacher workspace | `src/server/actions/teacher-dashboard.ts` | 726-line engine: HealthEngine, AttentionEngine, RecommendationEngine, BriefGenerator, ReviewReadinessEngine, ActivitySummarizer. |
| Pending invitations | `prisma/schema.prisma:260-282` | `PendingProjectAssignment` — email, memberRole, status, deliveryStatus, bounce fields. |
| Email queue | `prisma/schema.prisma:284-299` + `src/lib/email-queue.ts` | `EmailQueue` model, queue processor with stagger delay, bounce detection pipeline. |
| Reusable components | `src/components/dashboard/` | `StatCard`, `ProjectCard`, `ActivityFeed`, `CompletionBar`, `TaskKanban`, `MilestoneTimeline`, `FileUploader`. |
| Sidebar | `src/components/layout/Sidebar.tsx` | Role-driven nav: ADMIN (8 items), TEACHER (4 items), STUDENT (4 items). |

### 2.3 Key Gaps

| Gap | Current State | Needed |
|---|---|---|
| HOD designation | No way to mark a teacher as HOD | `isHod: Boolean` on User/FacultyProfile |
| Department ownership | No mapping of HOD→department | HOD's existing `department` string is the ownership claim |
| Department config | No academic year or config | `DepartmentConfiguration` table (Dashboard only) |
| HOD dashboard | Doesn't exist | New page at `/hod` reusing Teacher workspace engine |
| Faculty guide workflow | Exists for projects only | Extend for department-level guide assignment |
| Sync propagation | `department` field unused | Populate `department` + new `isHod` in sync payload |

---

## 3. HOD Is NOT A Separate Role

### Decision

A HOD is a **Faculty/Teacher with `isHod = true`**. No new `Role` enum value.

### Rationale

| Approach | Pros | Cons |
|---|---|---|
| New `Role.HOD` | Clean role checks. Works with existing `requireRole()`. | HOD loses TEACHER identity. Breaks existing Teacher dashboard. Requires auth changes everywhere. |
| `isHod: Boolean` | Preserves TEACHER role. Teacher dashboard works unchanged. Minimal auth changes. Additive only. | Requires `isHod` check alongside role checks in new code. |

**Chosen: `isHod: Boolean`** — zero impact on existing authorization.

### COE Main — `FacultyProfile.isHod`

Only Faculty can become HOD. All faculty-specific metadata already lives on `FacultyProfile` (department, designation, expertise). Adding `isHod` there keeps faculty-specific fields together and avoids polluting the `User` model with a field that has no meaning for STUDENT, ADMIN, or INDUSTRY_PARTNER users.

```prisma
model FacultyProfile {
  // ... existing fields (department, designation, expertise, resumeUrl, isComplete) ...
  id           Int      @id @default(autoincrement())
  userId       Int      @unique
  user         User     @relation(fields: [userId], references: [id])
  department   String?
  designation  String?
  expertise    String?  @db.Text
  resumeUrl    String?
  profileLinks Json?
  isComplete   Boolean  @default(false)
  isHod        Boolean  @default(false)   // NEW
  updatedAt    DateTime @updatedAt
  @@map("faculty_profiles")
}
```

HOD assignment is an admin action that updates the FacultyProfile record — set `isHod = true`. HOD removal sets `isHod = false`.

### Project Dashboard — `User.isHod`

The Dashboard has no `FacultyProfile` model. Both `department` and `isHod` must live on `User` since that is the sync target.

```prisma
model User {
  // ... existing fields ...
  isHod Boolean @default(false)   // NEW
}
```

The sync payload flattens `FacultyProfile.isHod` → `SyncUserPayload.isHod` → Dashboard `User.isHod`.

### Comparison: `User.isHod` vs `FacultyProfile.isHod`

| Criterion | `User.isHod` | `FacultyProfile.isHod` |
|---|---|---|
| Schema simplicity | One field on central model | Field on faculty-specific model — cleaner separation |
| Semantic correctness | `isHod` on STUDENT is meaningless | Only FACULTY rows have FacultyProfile — no wasted field |
| Sync impact | Direct `user.isHod` in payload | Must query FacultyProfile to populate `isHod` — but sync already queries FacultyProfile for `department` |
| Query complexity | `SELECT * FROM User WHERE isHod = true` — single table | `SELECT * FROM FacultyProfile WHERE isHod = true JOIN User` — join needed for full user data, but HOD list is infrequent |
| Maintainability | Field lives on User forever — even for non-faculty roles | Field naturally scoped to faculty. Adding faculty-specific fields in future doesn't bloat User |
| Dashboard mapping | Matches Dashboard's single-table User model | Requires explicit mapping in sync payload — but sync already flattens FacultyProfile fields |

**Recommendation: `FacultyProfile.isHod` in COE Main, `User.isHod` in Dashboard.**

The sync already fetches FacultyProfile to populate `department`. Adding `isHod` to the same query costs nothing. The Dashboard receives both as flat fields in the sync payload and stores them on its User model (which has no FacultyProfile equivalent). This keeps COE Main's schema semantically clean while the Dashboard remains practical.

### Role Mapping — No Change

`mapCoERoleToDashboard()` stays unchanged. `FACULTY → TEACHER` regardless of `isHod`.

### Authorization Pattern

```typescript
// Existing teacher check (unchanged):
const isTeacher = user.role === "TEACHER";

// New HOD check (additive):
const isHOD = user.role === "TEACHER" && user.isHod;

// HOD page guard (reuses existing requireRole):
const user = await requireRole("TEACHER");
if (!user.isHod) throw new Error("Forbidden");
```

No existing authorization code is modified. All HOD checks are additive.

---

## 4. Department Model — No Normalization

### Decision

Continue using the existing `department: String` free-text field. Do NOT create a `Department` table.

### Rationale

| Factor | Assessment |
|---|---|
| Department names | Already standardized via hardcoded frontend dropdown (12 branches) |
| Department CRUD | No business requirement yet |
| Query performance | `WHERE department = 'Computer Engineering'` with index is fast enough for current scale |
| Migration risk | Adding FK + data migration for 12 departments vs. zero-migration approach |
| Future-proofing | Can normalize later by adding `departmentId` FK IF department CRUD becomes needed |

### Current Department List (from `FacultyProfileClient.tsx`)

```
B.E. Computer Engineering
B.E. Information Technology
B.E. Electronics & Tele-Communication
B.E. Electronics and Computer Science
B.E. Mechanical Engineering
B.E. Civil Engineering
B.E. Computer Science and Engineering (Cyber Security)
B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)
B.Tech - Artificial Intelligence & Machine Learning
B.Tech - Artificial Intelligence & Data Science
B.Tech - Internet of Things (IoT)
B.Tech - Computer Science & Engineering (CSE-IOT)
```

### Index (Dashboard)

```sql
CREATE INDEX idx_users_department ON users(department, role, isActive);
```

This supports queries like:
```typescript
prisma.user.findMany({
  where: { department: "Computer Engineering", role: "TEACHER", isActive: true }
});
```

---

## 5. Academic Year / Department Configuration

### Decision

A single `DepartmentConfiguration` model on the **Project Dashboard only**. COE Main does not need academic year data.

### Rationale

- The Dashboard owns project groups, divisions, statistics, academic cycles.
- COE Main is a user/content/innovation portal — not a project management system.
- A single config table replaces `AcademicYear` + `AcademicYearDepartment` + `Department` — all three concepts collapse into one.

### Schema (Dashboard only)

```prisma
model DepartmentConfiguration {
  id                String   @id @default(cuid())
  academicYear      String   // Canonical format: "2025-2026"
  department        String
  divisionCount     Int      @default(0)
  studentCount      Int      @default(0)
  projectGroupCount Int      @default(0)
  isActive          Boolean  @default(true)
  configuredByUserId String?  // FK to User
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([academicYear, department])
  @@index([department, academicYear])
  @@map("department_configurations")
}
```

### Academic Year — Canonical Format

Use exactly one format across the entire application: **`"YYYY-YYYY"`** (e.g., `"2025-2026"`).

| Component | Format | Example |
|---|---|---|
| API parameters | `"2025-2026"` | `GET /api/hod/configuration?academicYear=2025-2026` |
| Database storage | `"2025-2026"` | `academicYear: "2025-2026"` |
| Form input | `"2025-2026"` | Dropdown or validated text input |
| Validation regex | `/^\d{4}-\d{4}$/` | Rejects "2025-26", "25-26", "2025/2026" |

This prevents duplicate logical years stored with different string representations (e.g., "2025-2026" and "2025-26" both representing the same academic year).

### Centralized Academic Year Helper

Create a single shared helper to generate and validate academic years so every page, API, and database write uses the same representation:

```typescript
// project-dashboard/src/lib/academic-year.ts

const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{4}$/;

/**
 * Generate the canonical academic year string for a given year.
 * Example: generateAcademicYear(2025) → "2025-2026"
 */
export function generateAcademicYear(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

/**
 * Validate that a string matches the canonical academic year format.
 */
export function isValidAcademicYear(value: string): boolean {
  return ACADEMIC_YEAR_REGEX.test(value);
}

/**
 * Get the current academic year based on the date.
 * Academic year starts in June (month >= 6).
 */
export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  // Academic year in India typically starts mid-year (June/July)
  const startYear = now.getMonth() >= 5 ? year : year - 1;
  return generateAcademicYear(startYear);
}
```

**Usage everywhere:**

```typescript
import { getCurrentAcademicYear, isValidAcademicYear } from "@/lib/academic-year";

// API validation
const schema = z.object({
  academicYear: z.string().refine(isValidAcademicYear, {
    message: "Academic year must be in format YYYY-YYYY (e.g., 2025-2026)",
  }),
});

// Default form value
const currentYear = getCurrentAcademicYear();

// Database write
await prisma.departmentConfiguration.create({
  data: { academicYear: getCurrentAcademicYear(), ... },
});
```

### Why one table instead of three

| Separate Tables Approach | Single Table Approach |
|---|---|
| `Department` table (dept CRUD) | Department name is a string column |
| `AcademicYear` table (year CRUD) | Academic year is a string column |
| `AcademicYearDepartment` (junction) | Combined into one row |
| 3 tables, 2 FKs, data migration needed | 1 table, 0 FKs, 0 data migration |
| Department normalization forced | Department stays free-text |
| Year management across tables | Year is just a column value |

The single table covers the current business requirement — "one configuration per department per academic year" — without over-engineering.

---

## 6. Database Design

### 6.1 COE Main — Schema Changes

**`prisma/schema.prisma`:**

```prisma
model FacultyProfile {
  // ... all existing fields unchanged (department, designation, expertise, resumeUrl, isComplete) ...
  isHod     Boolean  @default(false)   // NEW — single boolean flag
}
```

That's it. **One field added to FacultyProfile. Zero new models. Zero changes to User. Zero existing fields changed.**

### 6.2 Project Dashboard — Schema Changes

**`prisma/schema.prisma`:**

```prisma
model User {
  // ... all existing fields unchanged ...
  isHod     Boolean  @default(false)   // NEW
}

model PendingProjectAssignment {
  // ... all existing fields unchanged ...
  invitationType InvitationType @default(PROJECT)    // NEW — PROJECT | GUIDE
}

model DepartmentConfiguration {         // NEW — only new model
  id                String   @id @default(cuid())
  academicYear      String              // Canonical format: "2025-2026"
  department        String
  divisionCount     Int      @default(0)
  studentCount      Int      @default(0)
  projectGroupCount Int      @default(0)
  isActive          Boolean  @default(true)
  configuredByUserId String?             // FK to User — who configured this row
  configuredBy      User?    @relation(fields: [configuredByUserId], references: [id])
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([academicYear, department])
  @@index([department, academicYear])
  @@map("department_configurations")
}

enum InvitationType {
  PROJECT
  GUIDE
}
```

**Audit fields rationale:**

| Field | Purpose | Justification |
|---|---|---|
| `configuredByUserId` (FK → User) | Who set up this department config | Enables audit trail. Proper relation means the user reference is type-safe and joinable. |
| `createdAt` | When config was first created | Already present. Marks initial configuration date. |
| `updatedAt` | When config was last modified | Already present (Prisma `@updatedAt`). Tracks modification time. |

`updatedBy` is **not** included. The updatedAt timestamp + existing audit trail (who is logged in during the request) provides sufficient context. Adding a second user reference field adds complexity without proportional audit value for a configuration record that changes infrequently.

### 6.3 Required Migrations

```
# COE Main
npx prisma migrate dev --name add_is_hod_to_faculty_profile
-- Adds isHod Boolean @default(false) to FacultyProfile

# Project Dashboard
npx prisma migrate dev --name add_is_hod_and_department_config
-- Adds isHod Boolean @default(false) to User
-- Creates department_configurations table
```

Both are additive-only, zero-downtime migrations. No data conversion needed. No existing rows affected.

### 6.4 Total Schema Changes

| Project | New Fields | New Models | New Enums | Modified Fields |
|---|---|---|---|---|
| COE Main | 1 (`FacultyProfile.isHod`) | 0 | 0 | 0 |
| Dashboard | 2 (`User.isHod`, `PendingProjectAssignment.invitationType`) | 1 (`DepartmentConfiguration`) | 0 | 0 |
| **Total** | **3** | **1** | **0** | **0** |

### 6.5 Schema Change Justification — Every Field Must Have a Consumer

| Field | Consumer | Why Required | Can Existing Support It? |
|---|---|---|---|
| `FacultyProfile.isHod` | HOD assignment API, sync payload, AdminPanelClient | Marks which faculty member is HOD. No existing field or inference can determine this. | No — no existing boolean or role bit conveys HOD status |
| `User.isHod` (Dashboard) | HOD layout guard, sidebar, dashboard queries | Dashboard needs to know HOD status without joining COE Main. Sync propagates it. | No — Dashboard has no FacultyProfile |
| `PendingProjectAssignment.invitationType` | HOD guide management UI, email templates, query filtering | Distinguishes project invitations from guide invitations. Self-documenting. | No — existing records are all PROJECT. Without this, querying the table cannot distinguish invitation sources. |
| `DepartmentConfiguration` table | HOD configuration page | Stores department-level academic year config (divisions, student counts, group counts) | No — no existing table stores this data |
| `DepartmentConfiguration.academicYear` | DepartmentConfiguration page | Identifies which academic year this config applies to | No |
| `DepartmentConfiguration.department` | DepartmentConfiguration page | Identifies which department this config applies to | Already stored on User.department but as a single value — not configurable per year |
| `DepartmentConfiguration.divisionCount` | DepartmentConfiguration page | Number of divisions (A, B, C...) in this department | No |
| `DepartmentConfiguration.studentCount` | DepartmentConfiguration page + analytics | Total students for guide capacity planning | No |
| `DepartmentConfiguration.projectGroupCount` | DepartmentConfiguration page + analytics | Number of project groups for guide assignment | No |
| `DepartmentConfiguration.configuredByUserId` (FK → User) | Audit trail | Records who configured a department for a given academic year. FK to User ensures type safety and enables join queries. | request-level auth context identifies the "who" during the operation, but this FK makes it auditable years later even if the configuring user is no longer active. |
| `DepartmentConfiguration.isActive` | Read-only enforcement, year transitions | Marks current year as editable, past years as read-only | No |

---

## 7. Synchronization Design

### 7.1 Extended Sync Payload

**`src/lib/dashboard-sync.ts` (COE Main):**

```typescript
export type SyncUserPayload = {
  email: string;
  name: string | null;
  role: string;
  department?: string | null;
  uid?: string | null;
  status: string;
  isActive?: boolean;
  isHod?: boolean;              // NEW
};
```

### 7.2 Sync Trigger Points (Complete)

| Trigger | Call Site | What Changes | When |
|---|---|---|---|
| Faculty approval | `faculty/[id]/approve/route.ts` | Now passes `department` (from FacultyProfile) + `isHod: false` | Admin approves faculty |
| Faculty profile update | `faculty/profile/route.ts` (PATCH) | `department` changed, `isHod` changed (via admin panel) | Faculty updates profile OR admin changes HOD status |
| HOD assignment | `faculty/profile/route.ts` (PATCH) | `isHod: true` + `department: "Computer Engineering"` | Admin updates faculty profile via existing API |
| HOD removal | `faculty/profile/route.ts` (PATCH) | `isHod: false` + `department: null` | Admin clears HOD via existing API |
| Department change | `faculty/profile/route.ts` (PATCH) | Sync triggered with new department | Faculty transfers departments |

**Key design decision:** No new HOD-specific API endpoints. HOD assignment/removal is a profile update through the existing `PATCH /api/faculty/profile` endpoint. The sync fires automatically after any faculty profile change. This reuses the existing admin → faculty profile → sync flow without introducing parallel APIs.

### 7.3 Sync Implementation — Centralized `syncFaculty()` Helper

Avoid calling `syncDashboardUser()` from multiple routes with duplicated payload construction. Create a single helper:

```typescript
// src/lib/dashboard-sync.ts

export async function syncFaculty(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, role: true, uid: true, status: true },
  });
  if (!user) return;

  const facultyProfile = await prisma.facultyProfile.findUnique({
    where: { userId },
    select: { department: true, isHod: true },
  });

  return syncDashboardUser({
    email: user.email,
    name: user.name,
    role: user.role,
    department: facultyProfile?.department ?? null,
    uid: user.uid,
    status: user.status,
    isActive: user.status === 'ACTIVE',
    isHod: facultyProfile?.isHod ?? false,
  });
}
```

Every sync trigger simply calls `syncFaculty(userId)` — no duplicate payload construction anywhere:

| Trigger | Call Site | Code |
|---|---|---|
| Faculty approval | `faculty/[id]/approve/route.ts` | `await syncFaculty(faculty.id)` |
| Faculty profile update | `faculty/profile/route.ts` (PATCH) | `await syncFaculty(user.id)` |
| HOD assignment (via profile update) | Same as above — `isHod` is set via profile PATCH, then sync fires | `await syncFaculty(user.id)` |
| HOD removal (via profile update) | Same as above | `await syncFaculty(user.id)` |
| Department change | Same as above | `await syncFaculty(user.id)` |

This guarantees every synchronization event always sends an identical payload structure with all available fields populated from the authoritative source (database).

### 7.3 Dashboard `upsertDashboardUser()` Extension

**`project-dashboard/src/lib/resolve-user.ts`:**

```typescript
export async function upsertDashboardUser(input: SyncUserInput): Promise<ResolvedUser | null> {
  // ... existing logic ...

  // NEW: Handle isHod
  if (input.isHod !== undefined) {
    updateData.isHod = input.isHod;
  }

  // NEW: Handle department (already in the input type, just ensure it's used)
  if (input.department !== undefined) {
    updateData.department = input.department;
  }

  // ... rest of existing logic (role mapping, pending assignment resolution) ...
}
```

### 7.4 Idempotency

`upsertDashboardUser()` already handles idempotent updates — if the user exists, it selectively updates only changed fields. Multiple sync calls with the same data produce no duplicate state. The `@@unique([email])` constraint on User prevents duplicates.

---

## 8. Authorization Design

### 8.1 Zero Changes to Existing Authorization

| Component | Change | Reason |
|---|---|---|
| `authenticate()` | None | Still reads JWT — JWT doesn't carry `isHod` (it's in DB) |
| `authorize()` | None | Still checks `role` only |
| `requireRole()` | None | Still checks `role` only |
| Role enum | None | No new HOD value |
| `mapCoERoleToDashboard()` | None | FACULTY still maps to TEACHER |
| Middleware | None | Still injects `x-coe-role` as TEACHER |

### 8.2 Additive HOD Checks

All HOD-specific authorization is additive — it lives ONLY in the HOD dashboard code.

### 8.3 Centralized `requireHOD()` Helper

```typescript
// project-dashboard/src/lib/coe-guard.ts

export async function requireHOD() {
  const user = await requireCoeUser();

  if (user.role !== "TEACHER") {
    throw new Error("Unauthorized — HOD access requires TEACHER role");
  }

  if (!user.isHod) {
    throw new Error("Unauthorized — user is not a Head of Department");
  }

  return user;
}
```

This fits naturally into the existing guard pattern:
- `requireCoeUser()` — any authenticated user
- `requireRole("TEACHER")` — any teacher
- `requireHOD()` — teacher + HOD (new)

Usage in HOD layout:
```typescript
// project-dashboard/src/app/(dashboard)/hod/layout.tsx

export default async function HODLayout({ children }) {
  await requireHOD();  // throws if not TEACHER + isHod
  return <>{children}</>;
}
```

Benefits:
- Single source of truth for HOD authorization logic
- If HOD criteria change (e.g., ADMIN should also access HOD pages), change one place
- Follows existing `requireRole()` pattern
- Natural fit with the `coe-guard.ts` module where authorization helpers live

### 8.4 Sidebar Visibility

```typescript
// project-dashboard/src/components/layout/Sidebar.tsx

// HOD navigation appears for TEACHER + isHod
{userRole === "TEACHER" && userIsHod && (
  <>
    <SidebarLink href="/hod" label="HOD Dashboard" icon={Building2} />
    <SidebarLink href="/hod/guides" label="Faculty Guides" icon={Users} />
    <SidebarLink href="/hod/configuration" label="Department Config" icon={Settings} />
  </>
)}
```

Teacher sidebar stays exactly as-is. HOD links are appended below.

### 8.5 Department Scoping as a Strict Security Rule

**Rule:** Every HOD endpoint must derive the department from the authenticated user stored in the database. Never trust a department supplied by the client through request parameters or request bodies.

```typescript
// project-dashboard/src/app/(dashboard)/hod/layout.tsx

export default async function HODLayout({ children }) {
  const user = await requireHOD();

  // Department is derived from the authenticated user's database record.
  // The frontend CANNOT specify a department — even if the HOD manually
  // changes the URL path or adds query parameters, the scoping column is
  // always the user's stored department.
  const hodDepartment = user.department;

  if (!hodDepartment) {
    throw new Error("HOD has no department assigned — contact administrator.");
  }

  return (
    <>
      <DepartmentProvider department={hodDepartment}>
        {children}
      </DepartmentProvider>
    </>
  );
}
```

**Applies to every HOD-scoped query:**
```typescript
// Analytics — scoped by authenticated user's department, not by request params
const projects = await prisma.project.findMany({
  where: { department: user.department },
});

// Faculty guides — same rule
const guides = await prisma.user.findMany({
  where: { department: user.department, role: "TEACHER", isActive: true },
});

// Students — same rule
const students = await prisma.user.findMany({
  where: { department: user.department, role: "STUDENT", isActive: true },
});
```

**Why this is critical:**
- Prevents privilege escalation: HOD of Computer Engineering cannot access IT department data by manipulating the request
- Keeps query logic simple: no `?department=` parsing, no validation of which departments the user can access
- Follows existing pattern: the Teacher dashboard already scopes by `teacherId` from the authenticated user

---

## 9. Faculty Guide Workflow

### 9.0 Design Decision: `PendingProjectAssignment` vs Custom `FacultyGuideInvitation`

The architecture proposes reusing `PendingProjectAssignment`. This section evaluates whether that is the correct abstraction.

| Criterion | Option A: Reuse `PendingProjectAssignment` | Option B: New `FacultyGuideInvitation` |
|---|---|---|
| Semantic correctness | Guide invitation ≠ project assignment. Conceptually distinct. | Perfectly models a department administration workflow. |
| Bounce detection | Full pipeline already exists and is tested. Zero new code. | Must duplicate BounceFetcher, Parser, Validator, Matcher, Processor, or abstract a shared interface. ~500 lines of new/modified code. |
| Auto-activation | `upsertDashboardUser()` auto-resolves. Already handles transaction safety. | Must build separate auto-resolution logic or hook into existing flow. |
| Email queue | Uses existing `dispatchEmail()` with proven reliability. | Same queue — but needs new email category management. |
| Schema change | 0 new models. | 1 new model + migration. |
| Future separation | Adding a `type` field to distinguish project invites from guide invites is a 1-field migration. | Already separated — but at the cost of duplicated infrastructure. |
| Invitation list query | Single query covers all pending invites — HOD filters by `memberRole: "GUIDE"`. | Queries across two tables — more complex dashboard aggregation. |

**Recommendation: Option A — Reuse `PendingProjectAssignment`.**

The primary justification is **not** fewer lines of code. It is:

1. **The bounce detection pipeline is non-trivial.** The Dashboard has 6 dedicated modules (`BounceFetcher`, `BounceParser`, `BounceValidator`, `BounceMatcher`, `BounceProcessor`, `NotificationService`) tightly coupled to `PendingProjectAssignment`. Duplicating or abstracting this for a new model introduces regression risk and maintenance burden.

2. **Faculty guides ARE project participants.** In the Dashboard's domain model, a faculty guide is a `ProjectMember` with role `GUIDE`. The invitation is an invitation to become a project member. The fact that the invitation is initiated by a HOD rather than a project teacher is a workflow difference, not a domain difference.

3. **Separation can be added later.** If guide invitations diverge significantly from project invitations in the future, a `type` field on `PendingProjectAssignment` cleanly separates them without requiring a migration from one model to another. Starting with reuse and separating later is safer than starting separate and merging later.

### 9.1 Reuse Existing Infrastructure

The existing `PendingProjectAssignment` + `ProjectMember` system handles invitation → auto-activation. HOD guide workflow builds on top of this.

### Invitation Type Discriminator (Recommended)

Add a lightweight discriminator to `PendingProjectAssignment` to distinguish project invitations from guide invitations:

```prisma
enum InvitationType {
  PROJECT
  GUIDE
}

model PendingProjectAssignment {
  // ... all existing fields ...
  invitationType InvitationType @default(PROJECT)   // PROJECT | GUIDE
}
```

This keeps the shared infrastructure (bounce detection, email queue, auto-activation) while making the data model self-documenting. HOD guide invitations use `invitationType: "GUIDE"`, existing project invitations use `invitationType: "PROJECT"`.

**Why add this now:** It's a single-field, non-breaking migration. It costs nothing to add upfront. It avoids confusion 6 months from now when someone queries `PendingProjectAssignment` and can't tell which entries are guide invitations vs project invitations.

| Existing Component | How It's Reused |
|---|---|
| `PendingProjectAssignment` | HOD creates assignment with `memberRole: "GUIDE"`, `status: "PENDING"` |
| `EmailQueue` + `dispatchEmail()` | Send invitation email using existing queue system |
| `upsertDashboardUser()` | Auto-resolves pending assignments when faculty registers |
| Bounce detection pipeline | Detects and notifies HOD of failed invitation deliveries |

### 9.2 Workflow Cases

#### Case 1: Faculty already registered in Dashboard

```
HOD searches by email → finds existing User (TEACHER role)
→ creates ProjectMember (role: GUIDE) on a project or department group
→ sends confirmation notification
```

#### Case 2: Faculty exists in CoE but not Dashboard

```
HOD searches by email → calls GET /api/internal/users/lookup?uid=...
→ if found: syncDashboardUser() → wait → assign as guide
```

#### Case 3: Faculty not registered anywhere

```
HOD enters email + name → creates PendingProjectAssignment(status: PENDING)
→ dispatchEmail() sends invitation
→ faculty registers → upsertDashboardUser() auto-resolves assignment
→ sends activation notification to HOD
```

### 9.3 Duplicate Prevention

- `@@unique([projectId, email])` on `PendingProjectAssignment` prevents duplicate invitations.
- `@@unique([projectId, studentId])` prevents duplicate guide assignments.
- Re-invitation: update existing PENDING record, resend email.

### 9.4 Invitation Lifecycle

```
CREATED (status=PENDING)
  → email sent (deliveryStatus=null)
  → if bounced: deliveryStatus=BOUNCED, HOD notified
  → faculty registers: status=ASSIGNED, ProjectMember created
  → if expired (30 days): status=EXPIRED (cron cleanup)
```

---

## 10. Analytics

### 10.1 Reuse Existing Engines

The Teacher Dashboard has a full analytics engine in `src/server/actions/teacher-dashboard.ts` (726 lines):

| Engine | File | HOD Adaptation |
|---|---|---|
| `HealthEngine` | `src/lib/delivery/HealthEngine.ts` | Scope by department instead of teacherId |
| `AttentionEngine` | `src/lib/delivery/AttentionEngine.ts` | Score items by department-wide impact |
| `RecommendationEngine` | `src/lib/delivery/RecommendationEngine.ts` | Generate department-level recommendations |
| `BriefGenerator` | `src/lib/delivery/BriefGenerator.ts` | Department-wide daily brief |
| `ReviewReadinessEngine` | `src/lib/delivery/ReviewReadinessEngine.ts` | Reviews across all department projects |
| `ActivitySummarizer` | `src/lib/delivery/ActivitySummarizer.ts` | Activity across department |

### 10.2 Compute Live, Don't Cache

All department metrics are computed live on page load. No analytics cache, no precomputed tables, no cron jobs.

**Rationale:** Current project scale (~50 projects per department, ~200 students) makes live queries fast with proper indexes. Adding a cache layer introduces staleness bugs and sync complexity for marginal performance gain.

### 10.3 Required Indexes

```sql
CREATE INDEX idx_users_department ON users(department, role, isActive);
CREATE INDEX idx_projects_department ON projects(department, status);
CREATE INDEX idx_project_members_user ON project_members(userId, role);
```

### 10.4 Reusable Components

The HOD dashboard reuses existing components:

| Component | Usage |
|---|---|
| `StatCard` | KPI display (total projects, students, guides, completion %) |
| `ProjectCard` | Department project list with health indicators |
| `ActivityFeed` | Recent activity across department |
| `CompletionBar` | Department-wide completion progress |
| `ReviewForm` | Review management |

---

## 11. Business Rules

### HOD Assignment (Implementation Constraints)

| Rule | Enforcement |
|---|---|
| One teacher can be HOD of only one department | `isHod` is boolean — the teacher's `department` field on FacultyProfile determines WHICH department |
| A department can have only one HOD | Admin UI enforces: before assigning new HOD, verify no existing HOD in that department |
| New HOD assignment removes old HOD | Admin action: set `isHod=false` on old FacultyProfile, `isHod=true` on new, sync both |
| HOD removal preserves TEACHER role | Only `isHod` is changed — role stays `FACULTY`/`TEACHER` |
| Department ownership transfers | Old HOD's projects stay — new HOD sees all department projects |

**Critical: HOD reassignment MUST be transactional.** Never perform separate independent updates for "remove old HOD" then "assign new HOD". If the process crashes between operations, the department enters an invalid state.

```typescript
// Correct: single Prisma transaction
await prisma.$transaction(async (tx) => {
  // Step 1: Find current HOD for this department
  const currentHod = await tx.facultyProfile.findFirst({
    where: { department: targetDepartment, isHod: true },
  });
  // Step 2: Revoke old HOD (if exists)
  if (currentHod && currentHod.userId !== newHodUserId) {
    await tx.facultyProfile.update({
      where: { id: currentHod.id },
      data: { isHod: false },
    });
  }
  // Step 3: Assign new HOD
  await tx.facultyProfile.update({
    where: { userId: newHodUserId },
    data: { isHod: true },
  });
});

// Step 4: Sync AFTER transaction commits (NEVER inside)
await syncFaculty(oldHodUserId);
await syncFaculty(newHodUserId);
```

**Synchronization must never occur inside the database transaction.** Database transactions should be as short as possible. The sync is a fire-and-forget HTTP call with a 5-second timeout — putting it inside a transaction holds database locks for that duration, which is unacceptable.

### Role Transition Scenarios

#### Teacher becomes HOD
- Teacher Dashboard → unchanged. All teacher features remain available.
- HOD Dashboard → becomes available. Additional department management features appear.
- Sidebar → HOD links appear below existing teacher links.
- No permissions removed. Only additive.

#### HOD removed (demoted to teacher)
- HOD Dashboard → becomes inaccessible. Redirected to Teacher Dashboard.
- Sidebar → HOD links disappear.
- Teacher Dashboard → continues working exactly as before.
- Department → may temporarily have no HOD. This is a valid state.
- Faculty guides managed by this HOD → remain assigned. Projects are unaffected.

#### HOD leaves the institution (deactivated/deleted)
- Department → may have no HOD. The system does NOT require immediate reassignment.
- Admin sees "Department has no HOD" indicator in the admin panel.
- Faculty guides → remain assigned. Projects continue.
- Historical audit → `configuredBy` retains the departed HOD's reference for audit trail.

#### Faculty Guide becomes HOD
- Guide permissions → **remain**. Being HOD should add responsibilities, not remove existing guide permissions.
- Projects they guide → still visible in their Teacher Dashboard.
- HOD Dashboard → adds department-wide oversight on top of individual guide responsibilities.
- Enforcement: `isHod` is independent of `ProjectMember` role. No guide assignment is revoked on HOD promotion.

### Department

| Rule | Enforcement |
|---|---|
| Faculty belongs to one department | `FacultyProfile.department` is a single string |
| Department changes sync automatically | On profile update, `syncFaculty()` fires |
| HOD's department is their ownership scope | `User.department === "Computer Engineering"` AND `User.isHod === true` |
| Department names validated server-side | Every API accepting/updating a department validates against the canonical department list. Arbitrary strings are rejected. Prevents "Computer Engineering" vs "Computer Engg" vs "Comp Engineering" inconsistency. |
| Department is always derived from the authenticated user, never from the frontend | HOD dashboard queries: `WHERE department = user.department`. No `?department=` query param exists on any HOD endpoint. The scoping column is implicitly determined by who is logged in. Applies to: analytics, faculty guides, department configuration, projects, students, statistics. |

### Faculty Guides

| Rule | Enforcement |
|---|---|
| No duplicate guide assignments | `@@unique([projectId, userId])` on ProjectMember |
| No duplicate invitations | `@@unique([projectId, email])` on PendingProjectAssignment |
| Auto-activate pending invitations | `upsertDashboardUser()` resolves in transaction |
| Deactivated faculty flagged | `User.isActive === false` — HOD sees flagged guides |
| **Cross-department prevention** | Before assigning a guide, verify: (1) faculty exists, (2) faculty is active, (3) faculty's department matches the authenticated HOD's department. Cross-department assignments are rejected. |

### Department Configuration

| Rule | Enforcement |
|---|---|
| One config per (year + department) | `@@unique([academicYear, department])` |
| Previous years are read-only | `isActive === false` — UI disables edits |
| Current year is editable | `isActive === true` |
| **Configurations are never deleted** | Historical configurations are permanently preserved for reporting and reference. Instead of deletion, configurations are archived by setting `isActive = false` and marking the academic year as read-only. |

---

## 12. Edge Cases

| # | Scenario | Handling |
|---|---|---|
| 1 | HOD reassignment (HOD A → HOD B) | Set `isHod=false` on A, `isHod=true` on B. Sync both. Both keep TEACHER role. |
| 2 | Faculty transfers to different department | Update `FacultyProfile.department`. Sync to Dashboard. If was HOD, demote (isHod=false). |
| 3 | Faculty deactivated | Admin sets `status: REJECTED`. Sync sets `isActive: false` on Dashboard. |
| 4 | Faculty deleted | `onDelete` handles related records. Sync is moot (no user to sync). |
| 5 | Sync failure | Fire-and-forget. Dashboard self-heals on next user visit (middleware re-resolves). |
| 6 | Existing users missing department field | Faculty without profile: `department = null`. Migration sets `isHod = false` (default). |
| 7 | Existing user promoted to HOD | Admin sets `isHod = true`. Sync propagates. No data migration needed. |
| 8 | Existing HOD removed | Admin sets `isHod = false`. HOD dashboard becomes inaccessible. Teacher dashboard unchanged. |
| 9 | Duplicate guide invitations | `@@unique([projectId, email])` prevents. UI shows "Already invited." |
| 10 | Duplicate guide assignments | `@@unique([projectId, userId])` prevents. UI shows "Already a guide." |
| 11 | Historical academic years | Configs with `isActive = false` are read-only. No edits allowed. |
| 12 | Existing Dashboard users updated through sync | `upsertDashboardUser()` handles selectively — only changed fields update. |
| 13 | Idempotent synchronization | `upsertDashboardUser()` uses selective updates. Same payload = same result. |
| 14 | Concurrent sync requests | Transaction ensures atomicity. Last-write-wins is acceptable for this data. |
| 15 | Auto-activation after registration | `upsertDashboardUser()` resolves `PendingProjectAssignment` in the same transaction. |
| 16 | Faculty guide promoted to HOD | Guide permissions preserved. `isHod=true` on FacultyProfile. Teacher Dashboard + HOD Dashboard both accessible. ProjectMember (GUIDE) rows unchanged. |
| 17 | Department has no HOD (vacant) | Valid state. Admin sees vacancy indicator. No forced reassignment. Faculty guides remain assigned. Projects continue normally. |
| 18 | HOD changes department | `isHod=false` on old dept's FacultyProfile. `isHod=true` on new dept's. Sync both. Old department becomes vacant. |

---

## 13. HOD Dashboard Architecture

### 13.1 Page Structure

```
/hod                          → HOD Dashboard (overview)
/hod/guides                   → Faculty Guide Management
/hod/configuration            → Department Configuration
/hod/projects                 → Department Projects (shared teacher view, dept-scoped)
```

### 13.2 HOD Dashboard Page (`/hod`)

```
┌─────────────────────────────────────────────────────────┐
│  HOD Dashboard — Computer Engineering (2025-2026)        │
├─────────────────────────────────────────────────────────┤
│  [StatCard: Projects] [StatCard: Students]               │
│  [StatCard: Guides]     [StatCard: Avg Completion]       │
├─────────────────────────────────────────────────────────┤
│  Projects Health Overview                                │
│  ┌───────────────────────────────────────────────────┐   │
│  │ ProjectCard │ ProjectCard │ ProjectCard │ ...     │   │
│  └───────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  Faculty Guides                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Guide name │ Projects │ Students │ Last Active   │   │
│  └───────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  Recent Activity                                         │
│  ┌───────────────────────────────────────────────────┐   │
│  │ ActivityFeed entries                              │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 13.3 Data Flow

```
Page load:
  1. requireCoeUser() → verify TEACHER + isHod
  2. Get HOD's department from User.department
  3. Query Dashboard DB:
     - DepartmentConfiguration for current config
     - Projects WHERE department = hod.department
     - Users WHERE department = hod.department AND role = TEACHER
     - PendingProjectAssignment WHERE status = PENDING
  4. Compute analytics via HealthEngine (adapted for department scope)
  5. Render with StatCard, ProjectCard, ActivityFeed
```

### 13.4 Reused Components

Every UI component on the HOD dashboard is reused from the existing Teacher workspace:

| Component | Source | HOD Adaptation |
|---|---|---|
| Page layout | `TeacherDashboardClient.tsx` pattern | Same structure, dept-scoped data |
| KPI cards | `StatCard.tsx` | Same component, different data |
| Project health | `ProjectHealthCard.tsx` | Filtered by department |
| Activity feed | `ActivityFeed.tsx` | Same component |
| Progress bars | `CompletionBar.tsx` | Same component |
| Loading skeleton | `TeacherDashboardSkeleton.tsx` | Same component |

---

## 14. API Changes

### 14.1 COE Main — Modified Endpoints (Reuse existing)

Instead of creating separate HOD management endpoints, extend the existing faculty profile API and admin user management:

| Endpoint | Change | Why |
|---|---|---|
| `PATCH /api/faculty/profile` | Accept `isHod` in request body. Sync triggers on update. | HOD assignment is a profile update. No new endpoint needed. |
| `GET /api/admin/users?role=FACULTY` | Already returns faculty users. No changes needed — HOD status is visible via `facultyProfile.isHod`. | Admin panel already lists faculty. |
| `GET /api/admin/users/[id]` | Already returns `facultyProfile` with `department`. `isHod` now visible there. | Admin user detail already includes profile. |
| `PATCH /api/admin/faculty/[id]/approve` | Populate `department` + `isHod` in sync call. | Existing approval flow now syncs HOD status. |

**No new endpoints on COE Main.** HOD assignment is done through the existing faculty profile update API. The admin panel's existing Faculty tab shows the faculty list — an "Assign as HOD" action calls `PATCH /api/faculty/profile` with `{ isHod: true }`.

### 14.2 COE Main — Sync

| File | Change |
|---|---|
| `src/lib/dashboard-sync.ts` | Add `isHod?: boolean` to `SyncUserPayload` |
| `src/lib/dashboard-sync.ts` | Populate `department` + `isHod` from FacultyProfile in all sync calls |

### 14.3 Dashboard — New Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/hod/department-stats` | GET | `requireHOD()` | Department-level statistics |
| `/api/hod/guides` | GET | `requireHOD()` | List faculty guides in department |
| `/api/hod/guides/assign` | POST | `requireHOD()` | Assign existing faculty as guide |
| `/api/hod/guides/invite` | POST | `requireHOD()` | Invite unregistered faculty via PendingProjectAssignment |
| `/api/hod/configuration` | GET | `requireHOD()` | Get department config for current year |
| `/api/hod/configuration` | PUT | `requireHOD()` | Update department config |

### 14.4 Dashboard — Modified Endpoints

| Endpoint | Change |
|---|---|
| `POST /api/internal/users/upsert` | Handle `isHod` in body, pass to `upsertDashboardUser()` |
| `GET /api/internal/users/upsert` | Return `isHod` in user response if present |

---

## 15. File Modification List

### 15.1 COE Main (7 files — down from 10)

| # | File | Change |
|---|---|---|
| 1 | `prisma/schema.prisma` | Add `isHod Boolean @default(false)` to `FacultyProfile` |
| 2 | `src/lib/dashboard-sync.ts` | Add `isHod?: boolean` to `SyncUserPayload`; populate `department` + `isHod` from FacultyProfile |
| 3 | `src/app/api/faculty/profile/route.ts` | PATCH handler: accept `isHod` field. Trigger sync after update. |
| 4 | `src/app/api/admin/faculty/[id]/approve/route.ts` | Populate `department` + `isHod` in sync call |
| 5 | `src/app/faculty/profile/FacultyProfileClient.tsx` | No changes needed — profile form already exists |
| 6 | `src/app/admin/AdminPanelClient.tsx` | Add "Assign as HOD" checkbox in faculty detail/user management UI |
| 7 | `src/app/admin/page.tsx` | No changes needed (AdminPanelClient handles rendering) |

**Removed from v1:**
- ~~`src/app/api/admin/hod/assign/route.ts`~~ → Replaced by `PATCH /api/faculty/profile`
- ~~`src/app/api/admin/hod/remove/route.ts`~~ → Replaced by `PATCH /api/faculty/profile`
- ~~`src/app/api/admin/hod/list/route.ts`~~ → Use existing `GET /api/admin/users?role=FACULTY`
- ~~`src/app/api/admin/hod/search-faculty/route.ts`~~ → Use existing `GET /api/admin/users` with search

### 15.2 Project Dashboard (10 files)

| # | File | Change |
|---|---|---|
| 1 | `prisma/schema.prisma` | Add `isHod Boolean` to User; add DepartmentConfiguration model |
| 2 | `src/lib/resolve-user.ts` | Handle `isHod` in `upsertDashboardUser()` |
| 3 | `src/lib/coe-guard.ts` | Add `requireHOD()` helper |
| 4 | `src/app/api/internal/users/upsert/route.ts` | Extract `isHod` from sync body |
| 5 | `src/components/layout/Sidebar.tsx` | Add HOD nav links (conditional on isHod) |
| 6 | `src/app/(dashboard)/hod/page.tsx` | **NEW** — HOD dashboard page |
| 7 | `src/app/(dashboard)/hod/layout.tsx` | **NEW** — HOD layout + `requireHOD()` guard |
| 8 | `src/app/(dashboard)/hod/guides/page.tsx` | **NEW** — Faculty guide management |
| 9 | `src/app/(dashboard)/hod/configuration/page.tsx` | **NEW** — Department configuration |
| 10 | `src/server/actions/hod-dashboard.ts` | **NEW** — Department-scoped queries |

---

## 16. Implementation Roadmap

### Step 1: Database Migrations (no code dependencies)
```
COE Main:     add isHod to FacultyProfile (1 field)
Dashboard:    add isHod to User + DepartmentConfiguration model (2 changes)
```

### Step 2: COE Main Sync (minimal)
```
- dashboard-sync.ts: add isHod to SyncUserPayload, populate from FacultyProfile
- faculty/[id]/approve: populate department + isHod in sync call
- faculty/profile PATCH: trigger sync on update (department or isHod changed)
```

### Step 3: COE Admin UI (extend existing)
```
- AdminPanelClient Faculty tab: add "Assign as HOD" toggle next to faculty detail
- Reuses existing PATCH /api/faculty/profile to set isHod
- No new HOD management tab — folded into existing Faculty section
```

### Step 4: Dashboard Sync + Auth
```
- upsertDashboardUser(): handle isHod + department from sync payload
- coe-guard.ts: add requireHOD() helper
- Internal upsert API: extract isHod from body
```

### Step 5: Dashboard HOD Pages
```
- /hod page with department stats (reusing StatCard, ProjectCard, ActivityFeed)
- /hod/guides with faculty management (reusing PendingProjectAssignment)
- /hod/configuration with DepartmentConfiguration CRUD
- Sidebar navigation (conditional on isHod)
```

### Step 6: Faculty Guide Workflow
```
- Reuse PendingProjectAssignment for invitations
- Guide assignment via ProjectMember
- Auto-activation on registration (already handled by upsertDashboardUser)
```

### Step 7: Email + Notification Integration
```
- HOD guide invitation email template (reusing dispatchEmail)
- Bounce detection handles delivery failures (existing pipeline)
- HOD notified on guide activation (existing notification system)
```

### Step 8: Testing + QA
```
- Integration tests for sync flow (isHod propagation)
- HOD assignment → sync → Dashboard verification
- Guide invitation → registration → auto-activation
- Edge cases: concurrent HOD changes, department transfers, vacant department
```

---

## 17. Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Free-text department causes data inconsistency | Low — dropdown is controlled in UI | Validate against known department list on API |
| `isHod` not in JWT means extra DB lookup per request | Low — HOD dashboard loads once per session | Resolve user once in layout, pass via context/headers |
| Sync failure leaves stale HOD state | Low — fire-and-forget | Next user visit triggers re-resolve via middleware headers |
| No Department FK means no referential integrity | Low | Department names from controlled dropdown — validation is at API level |
| Single DepartmentConfiguration may not cover all future needs | Medium | This is intentionally minimal. Can extend with additional fields or split into multiple models later if genuinely needed. |
| HOD reassignment requires two sync calls | Low — admin action is infrequent | One admin button triggers both syncs in sequence |

---

## 18. Final Validation Checklist

Before merging, verify these 15 scenarios end-to-end:

| # | Scenario | Expected Outcome | Verification Method |
|---|---|---|---|
| 1 | New faculty becomes HOD | `isHod=true` on FacultyProfile. Sync propagates to Dashboard. HOD dashboard accessible. Teacher dashboard unchanged. | API call + Dashboard login as HOD |
| 2 | Existing HOD replaced (HOD A → HOD B in same dept) | Single transaction: A.isHod=false, B.isHod=true. Both synced. A sees only Teacher Dashboard. B sees Teacher + HOD Dashboard. | Check FacultyProfile for both, verify Dashboard access for both |
| 3 | Department temporarily has no HOD | `isHod=false` on only HOD. Department shows "vacant" indicator. All department projects/guides continue working. | Remove HOD, verify Dashboard still works for dept members |
| 4 | Department transfer (faculty moves from Comp to IT) | `department` updated on FacultyProfile. Sync propagates. If was HOD, demoted (`isHod=false`). | Update department, verify sync, verify HOD status cleared |
| 5 | Faculty approval | `syncFaculty()` called after approval. Dashboard user created/updated with department + isHod. | Approve pending faculty, verify Dashboard shows user |
| 6 | Existing Dashboard user receives HOD status after sync | `upsertDashboardUser()` sets `isHod=true` on existing user. HOD sidebar appears on next page load. | Promote existing teacher, trigger sync, refresh Dashboard |
| 7 | Existing Dashboard user receives department update after sync | `upsertDashboardUser()` updates `department` field. Next page load reflects new department. | Change faculty dept, trigger sync, verify Dashboard |
| 8 | Guide invitation auto-resolves after registration | Faculty registers → `upsertDashboardUser()` → PendingProjectAssignment resolved → ProjectMember created. | Create invitation, register as that faculty, verify assignment |
| 9 | Duplicate guide assignment prevented | Second assignment attempt → API returns error. `@@unique` constraint catches at DB level. | Assign same guide twice, verify second attempt fails |
| 10 | Duplicate invitation prevented | Second invitation to same email for same project → API returns error. `@@unique` constraint catches. | Invite same email twice, verify second attempt fails |
| 11 | Historical department configurations remain intact | Config with `isActive=false` is read-only. Deletion is blocked. Previous year configs still queryable. | Create config, archive it (set isActive=false), verify it persists |
| 12 | HOD cannot access another department's data | All HOD queries scoped by `user.department`. Manually changing the department in the request has no effect — scoping column is the authenticated user's department. | Login as Comp HOD, attempt to access IT department data |
| 13 | Teacher permissions unchanged after becoming HOD | Teacher Dashboard, project management, showcase — all still functional. Role is still TEACHER. | Login as promoted HOD, verify all teacher features still work |
| 14 | Teacher permissions unchanged after ceasing to be HOD | HOD demoted. HOD Dashboard inaccessible. Teacher Dashboard continues exactly as before. | Demote HOD, verify teacher features intact |
| 15 | Synchronization is idempotent | Calling `syncFaculty(userId)` multiple times with same data produces the same Dashboard state. No duplicate users, no incorrect state. | Call sync 3x in a row, verify Dashboard state unchanged |

---

*End of Revised Architecture Proposal*
