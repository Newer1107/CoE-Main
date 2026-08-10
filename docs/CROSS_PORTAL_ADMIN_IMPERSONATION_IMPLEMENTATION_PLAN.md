> ## ⚠️ ARCHIVED — superseded by the implemented feature
>
> This document is the **pre-implementation specification** for cross-portal
> admin impersonation. The feature is **fully implemented and live** in this
> repository. This file is kept for historical reference only — do **not**
> follow it as a work order.
>
> **Current implementation (source of truth):**
> - Schema: `ImpersonationSession` model + `ImpersonationStatus` enum in
>   `prisma/schema.prisma` (migrations `20260706070845_add_impersonation_sessions`,
>   `20260706070924_add_impersonation_session_active_unique`)
> - Token strategy: `isImpersonating` + `impersonation.sessionId` claims on all
>   three tokens (`src/lib/jwt.ts` — `buildImpersonationAccessTokenPayload`,
>   `src/lib/shared-auth.ts` — `buildSharedTokenPayload`)
> - API routes: `src/app/api/admin/impersonate/{start,stop,sessions,search,session-info}/route.ts`
> - UI: `src/components/ImpersonationBanner.tsx` (fixed amber banner, "Stop
>   impersonating" → returns to `/admin`); admin panel
>   (`src/app/admin/AdminPanelClient.tsx`) has the impersonate/search UI
> - Auth restrictions: ADMIN only, cannot impersonate self or
>   `INDUSTRY_PARTNER`, target must be ACTIVE, no nested impersonation;
>   refresh/logout handle session restoration (`src/app/api/auth/refresh/route.ts`)

# Cross-Portal Admin User Impersonation — Implementation Specification (Frozen)

> **Status:** Implementation Specification — **Frozen. Do not redesign, simplify, or modify architecture.**
>
> A coding agent with zero project context must be able to read only this document and implement the entire feature correctly.
>
> **No architectural decisions, no redesigns, no product choices, no invented behaviour.** Every condition, edge case, and implementation detail is specified below.
>
> A new implementer's sole responsibility is to translate this specification into code — not to make design decisions.

---

## Table of Contents

1. [Architecture Principles](#1-architecture-principles)
2. [Coding Standards](#2-coding-Standards)
3. [Current Authentication Architecture Analysis](#3-current-authentication-architecture-analysis)
4. [Token Strategy](#4-token-strategy)
5. [JWT Claim Design (Minimized)](#5-jwt-claim-design-minimized)
6. [Shared Token Behaviour](#6-shared-token-behaviour)
7. [Database Schema](#7-database-schema)
8. [Session Lifecycle](#8-session-lifecycle)
9. [Session Uniqueness & Race Conditions](#9-session-uniqueness--race-conditions)
10. [Session Switching (Start & Stop)](#10-session-switching-start--stop)
11. [Session Restoration](#11-session-restoration)
12. [Refresh Flow](#12-refresh-flow)
13. [Logout During Impersonation](#13-logout-during-impersonation)
14. [Authorization Rules](#14-authorization-rules)
15. [Middleware](#15-middleware)
16. [Header Design (Minimized)](#16-header-design-minimized)
17. [API Contracts](#17-api-contracts)
18. [Search Behaviour](#18-search-behaviour)
19. [Audit Trail](#19-audit-trail)
20. [UI Design](#20-ui-design)
21. [Project Dashboard Behaviour](#21-project-dashboard-behaviour)
22. [Notifications](#22-notifications)
23. [Edge Cases](#23-edge-cases)
24. [Failure Scenarios](#24-failure-scenarios)
25. [Security Review](#25-security-review)
26. [Testing Strategy](#26-testing-strategy)
27. [Implementation Sequence](#27-implementation-sequence)
28. [File-by-File Implementation Roadmap](#28-file-by-file-implementation-roadmap)
29. [Deployment Guide](#29-deployment-guide)
30. [Sequence Diagrams](#30-sequence-diagrams)

---

## 1. Architecture Principles

These principles are **immutable**. Future contributors must not violate them.

### Principle 1: Single Source of Truth

- The **database** (`ImpersonationSession` table) is the sole source of truth for impersonation state — admin identity, target identity, timestamps, status.
- The **JWT** carries only a reference (`sessionId`) to the database record, never a snapshot of the admin or target user.

### Principle 2: JWT Carries Identity, Not Session State

- The JWT's `id` and `role` fields reflect the **impersonated user** during impersonation.
- The JWT's `impersonation` object contains only `sessionId` — nothing else.
- All session metadata (admin name, target name, timestamps) is in the database.

### Principle 3: Authorization Remains Unchanged

- During impersonation, `authenticate()` and `authorize()` evaluate the **impersonated user's role**.
- No existing authorization code path is modified.
- No code may check `isImpersonating` to grant elevated privileges.

### Principle 4: Impersonation Is Transparent to Existing Permission Checks

- Existing permission checks (`authorize(user, 'ADMIN')`, `requireRole("ADMIN")`) work **without changes**.
- The system behaves exactly as if the impersonated user logged in themselves.

### Principle 5: Shared Token Remains the Bridge

- The `coe_shared_token` continues to carry cross-subdomain identity.
- During impersonation, it carries the impersonated user's identity + `isImpersonating` flag + `sessionId`.
- The Project Dashboard reads the same token it always has — no new cookies, no new verification paths.

### Principle 6: The Original Admin Identity Exists for Only Three Purposes

1. **Audit logging** — recording which admin impersonated whom
2. **Session restoration** — regenerating admin tokens when impersonation stops
3. **UI banner display** — showing "Original session: Dr. Admin"

No other code path may read `impersonation.impersonatedBy`.

---

## 2. Coding Standards

All implementation must follow these rules:

1. **No duplicated auth logic.** Reuse existing `authenticate()`, `authorize()`, `verifyAccessToken()`, `verifyRefreshToken()`, `generateAccessToken()`, `generateRefreshToken()`, `generateSharedToken()`, `buildSharedTokenPayload()`, `getSharedCookieOptions()`, `useSecureCookies()`.
2. **Reuse existing cookie utilities.** Use the same `response.cookies.set()` pattern and TTL constants (`ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `SHARED_TOKEN_TTL_SECONDS`).
3. **No hidden bypasses.** Never check `isImpersonating` to grant access.
4. **No TODOs.** No `// TODO`, `// FIXME`, `// HACK`, `// XXX`.
5. **No commented-out code.** Remove before committing.
6. **No `console.log` in production code.** Use structured logging if needed.
7. **Follow repository conventions.** TypeScript strict mode, existing naming patterns, existing file structure.
8. **Backward compatible.** Existing tokens (without `isImpersonating`) must continue to work. All existing tests must pass.
9. **TypeScript strict.** All new interfaces must be properly typed. No `any` for impersonation types.
10. **Error messages.** Use consistent format — existing `errorRes()` pattern for API routes, existing error pattern for dashboard.

---

## 3. Current Authentication Architecture Analysis

### 3.1 CoE Main — Token Architecture

CoE Main issues **three JWT tokens** on every authentication event:

| Token | Cookie | Signed With | TTL | Payload |
|---|---|---|---|---|
| `accessToken` | `accessToken` | `JWT_ACCESS_SECRET` | 8h (configurable) | `TokenPayload { id, role, name, email, uid?, industryId? }` |
| `refreshToken` | `refreshToken` | `JWT_REFRESH_SECRET` | 7d (configurable) | Same `TokenPayload` shape |
| `coe_shared_token` | `coe_shared_token` | `JWT_ACCESS_SECRET` | 7d (fixed) | `SharedTokenPayload { email, name, role, status }` |

**Key relationships:**
- `JWT_ACCESS_SECRET` === Project Dashboard's `COE_JWT_SECRET` — the dashboard verifies the shared token using the same secret.
- The `accessToken` cookie has domain=implicit (current subdomain) and is NOT accessible cross-subdomain.
- The `coe_shared_token` cookie has `domain: '.tcetcercd.in'` (production) / `domain: '.localhost'` (dev), enabling cross-subdomain sharing.

### 3.2 CoE Main — Authentication & Authorization Functions

**`authenticate(req: NextRequest): TokenPayload | null`**
1. Checks `Authorization: Bearer <token>` header first
2. Falls back to `accessToken` cookie
3. Verifies with `verifyAccessToken()` against `JWT_ACCESS_SECRET`
4. Returns decoded `TokenPayload` or `null`

**`authorize(user: TokenPayload, ...roles: string[]): boolean`**
- Exact role match OR `INDUSTRY_PARTNER` additive check (user has `industryId`)

**Layout user loading:**
- Root layout (`src/app/layout.tsx`) reads `accessToken` cookie server-side
- Verifies with `verifyAccessToken()`
- Passes `{ name, email, role, uid }` to Navbar
- Navbar computes role-based nav link visibility

### 3.3 Project Dashboard — Auth Architecture

**Trust model:** The dashboard trusts CoE Main via symmetric JWT verification using `COE_JWT_SECRET` (same value as `JWT_ACCESS_SECRET`).

**Middleware (`project-dashboard/src/middleware.ts`):**
- Reads `coe_shared_token` cookie from request
- Calls `verifyCoEToken(token)` using `jose.jwtVerify()` against `COE_JWT_SECRET`
- On success, injects request headers:
  - `x-coe-email` ← `payload.email`
  - `x-coe-name` ← `payload.name`
  - `x-coe-role` ← `payload.role`
  - `x-coe-status` ← `payload.status`
- On failure/missing token, redirects to `https://tcetcercd.in/login`

**User resolution (`project-dashboard/src/lib/resolve-user.ts`):**
- `resolveUserFromHeaders(headers)` extracts auth from injected headers
- `upsertDashboardUser(input)` maps CoE role to dashboard role and upserts into dashboard DB
- Dashboard DB is a **lazy-provisioned cache** — CoE Main is the system of record

**Authorization (`project-dashboard/src/lib/coe-guard.ts`):**
- `requireRole(role)` reads `headers()` → resolves user → checks role
- Used in every server action and layout guard

### 3.4 Gap Analysis

1. **No impersonation claims in any JWT payload** — Both `TokenPayload` and `SharedTokenPayload` carry only the real user's identity.
2. **No API to start or stop impersonation** — No admin endpoint exists to generate tokens for a different user.
3. **No audit trail** — No `ImpersonationSession` table or audit log.
4. **No UI in either app** — No search-and-impersonate flow in the admin panel.
5. **No shared-token propagation** — Dashboard has no code to interpret impersonation metadata.

---

## 4. Token Strategy

**Decision:** Embed impersonation claims inside existing JWTs (Option B).

See JWT Claim Design (section 5) for the exact payload structure.

### Rationale

| Concern | Resolution |
|---|---|
| Backward compatibility | Tokens without `isImpersonating` continue to work — `verifyAccessToken` returns them as-is |
| Dashboard trust | Dashboard already verifies `coe_shared_token` — no new verification path |
| No new cookies | Same `accessToken`, `refreshToken`, `coe_shared_token` cookies |
| No new secrets | Same `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` |
| Attack surface | No new token types = no new attack surface |

---

## 5. JWT Claim Design (Minimized)

### 5.1 Design Rationale

The JWT carries **only a session ID reference**, not a snapshot of admin or target user data.

**Why the JWT does NOT store admin name/email/role or target snapshot:**

1. **Staleness prevention** — If admin name/email/role changes while impersonation is active, the JWT would contain stale data. The database is always fresh.
2. **Security** — The JWT is self-contained and cannot be revoked. Session metadata in the DB can be updated independently.
3. **Size** — Keeping the JWT small reduces cookie overhead on every request.
4. **Single source of truth** — The `ImpersonationSession` table stores all session metadata. The JWT only references it.

### 5.2 Claims Present in the JWT

| Claim | Always | During Impersonation Only | Source |
|---|---|---|---|
| `id` (target user's ID) | ✅ | ✅ | DB `User.id` |
| `role` (target user's role) | ✅ | ✅ | DB `User.role` |
| `name` (target user's name) | ✅ | ✅ | DB `User.name` |
| `email` (target user's email) | ✅ | ✅ | DB `User.email` |
| `uid` (target user's UID, if any) | ✅ | ✅ | DB `User.uid` |
| `industryId` (target user's industry, if any) | ✅ | ✅ | DB `User.industryId` |
| `isImpersonating` | ❌ | `true` | Hardcoded |
| `impersonation.sessionId` | ❌ | UUID v4 | Newly created `ImpersonationSession.id` |

### 5.3 Claims Omitted from the JWT (and why)

| Omitted Claim | Reason |
|---|---|
| `impersonation.impersonatedBy.id` | Stored in DB `ImpersonationSession.adminId`. Must be looked up from DB. |
| `impersonation.impersonatedBy.name` | Stored in DB. Would become stale if admin updates their name. |
| `impersonation.impersonatedBy.email` | Stored in DB. Would become stale if admin updates their email. |
| `impersonation.impersonatedBy.role` | Stored in DB. Must be re-verified fresh on every refresh to detect admin demotion. |
| `impersonation.impersonatingAs.*` | These ARE in the JWT as the top-level `id`, `role`, `name`, `email` fields. Duplication is unnecessary. |
| `impersonation.startedAt` | Stored in DB. |
| `impersonation.ipAddress` | Stored in DB. |
| `impersonation.userAgent` | Stored in DB. |

### 5.4 TypeScript Interfaces

```typescript
// ==== src/lib/jwt.ts ====

export interface TokenPayload {
  id: number;
  role: string;
  name: string;
  email: string;
  uid?: string;
  industryId?: number | null;

  // New optional fields — present ONLY during impersonation
  isImpersonating?: true;
  impersonation?: {
    /** UUID linking to ImpersonationSession for audit + restoration */
    sessionId: string;
  };
}
```

```typescript
// ==== src/lib/shared-auth.ts (SharedTokenPayload) ====

export interface SharedTokenPayload {
  email: string;
  name: string;
  role: 'ADMIN' | 'FACULTY' | 'STUDENT' | 'INDUSTRY';
  status: 'ACTIVE' | 'PENDING' | 'REJECTED';

  // New optional fields — present ONLY during impersonation
  isImpersonating?: true;
  impersonation?: {
    /** UUID linking to ImpersonationSession for audit */
    sessionId: string;
  };
}
```

### 5.5 JWT Examples

**Normal admin token (no impersonation):**
```json
{
  "id": 1,
  "role": "ADMIN",
  "name": "Dr. Admin",
  "email": "admin@tcetcercd.in",
  "iat": 1750000000,
  "exp": 1750028800
}
```

**Impersonation token (admin → student):**
```json
{
  "id": 42,
  "role": "STUDENT",
  "name": "Rahul Shah",
  "email": "rahul.shah@tcetcercd.in",
  "uid": "23CMP001",
  "isImpersonating": true,
  "impersonation": {
    "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "iat": 1750000000,
  "exp": 1750028800
}
```

**Normal shared token (no impersonation):**
```json
{
  "email": "admin@tcetcercd.in",
  "name": "Dr. Admin",
  "role": "ADMIN",
  "status": "ACTIVE",
  "iat": 1750000000,
  "exp": 1750604800
}
```

**Impersonation shared token (admin → student):**
```json
{
  "email": "rahul.shah@tcetcercd.in",
  "name": "Rahul Shah",
  "role": "STUDENT",
  "status": "ACTIVE",
  "isImpersonating": true,
  "impersonation": {
    "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "iat": 1750000000,
  "exp": 1750604800
}
```

### 5.6 Critical Rule for Token Generation

> **When impersonating, the `id` and `role` fields in `TokenPayload` MUST reflect the TARGET user's identity, not the admin's.**
>
> This ensures that `authenticate()` and `authorize()` evaluate permissions as the target user without any code changes to those functions.

### 5.7 Token Generation Helpers (New)

These helpers must be added to `src/lib/jwt.ts`:

```typescript
/**
 * Build a TokenPayload for an impersonation session.
 * The payload carries the TARGET user's identity so that
 * authenticate() and authorize() evaluate as the target user.
 */
export function buildImpersonationAccessTokenPayload(
  targetUser: { id: number; role: string; name: string; email: string; uid?: string | null; industryId?: number | null },
  sessionId: string
): TokenPayload {
  return {
    id: targetUser.id,
    role: targetUser.role,
    name: targetUser.name,
    email: targetUser.email,
    ...(targetUser.uid && { uid: targetUser.uid }),
    ...(targetUser.industryId != null && { industryId: targetUser.industryId }),
    isImpersonating: true,
    impersonation: { sessionId },
  };
}
```

### 5.8 Token Verification — No Changes Needed

`verifyAccessToken()` and `verifyRefreshToken()` use `jwt.verify()` which returns all claims. The new fields (`isImpersonating`, `impersonation`) are returned as part of the existing `TokenPayload` shape. No changes to verification functions.

---

## 6. Shared Token Behaviour

### 6.1 Exact Claims in Impersonation Shared Token

The impersonation shared token contains:

| Claim | Value | Always |
|---|---|---|
| `email` | Target user's email | ✅ |
| `name` | Target user's name | ✅ |
| `role` | Target user's role, mapped: `ADMIN`, `FACULTY`, `STUDENT`, or `INDUSTRY` | ✅ |
| `status` | Target user's status (`ACTIVE`) | ✅ |
| `isImpersonating` | `true` | Only during impersonation |
| `impersonation.sessionId` | UUID v4 linking to `ImpersonationSession` | Only during impersonation |

### 6.2 Claims Omitted from Shared Token (and why)

| Omitted Claim | Reason |
|---|---|
| `impersonation.impersonatedBy.*` | The Dashboard does not need admin identity for authorization. If the Dashboard banner needs admin name, it fetches it from a CoE Main API. |
| `impersonation.impersonatingAs.*` | Already present as top-level `email`, `name`, `role`. |

### 6.3 Cookie Behaviour — Identical to Normal

The impersonation shared token uses the **exact same cookie settings** as the normal shared token:
- **Cookie name:** `coe_shared_token`
- **httpOnly:** true
- **secure:** true (production) / false (development)
- **sameSite:** 'lax'
- **domain:** `'.tcetcercd.in'` (production) / `'.localhost'` (development)
- **path:** `/`
- **TTL:** `SHARED_TOKEN_TTL_SECONDS` (7 days)

No changes to `getSharedCookieOptions()`.

### 6.4 `buildSharedTokenPayload()` Changes

The existing `buildSharedTokenPayload()` function in `src/lib/shared-auth.ts` must be updated to accept optional impersonation metadata:

```typescript
export function buildSharedTokenPayload(
  user: {
    email: string;
    role: string;
    status: string;
    name?: string;
  },
  impersonation?: {
    sessionId: string;
  }
): SharedTokenPayload {
  const mappedRole = roleMap[user.role];
  if (!mappedRole) {
    throw new Error(`Unsupported role for shared auth token: ${user.role}`);
  }

  const name = user.name && user.name.trim().length > 0 ? user.name : user.email.split('@')[0];

  return {
    email: user.email,
    name,
    role: mappedRole,
    status: user.status as SharedTokenPayload['status'],
    ...(impersonation && {
      isImpersonating: true,
      impersonation: { sessionId: impersonation.sessionId },
    }),
  };
}
```

### 6.5 How the Shared Token Enables Dashboard Impersonation Detection

The shared token is the **sole mechanism** by which the Project Dashboard detects impersonation. The flow is:

1. CoE Main sets `coe_shared_token` cookie with `isImpersonating: true` and `impersonation.sessionId`
2. Dashboard middleware reads the cookie on every request
3. `verifyCoEToken()` extracts the fields (including the new ones) from the JWT payload
4. Middleware injects small headers (`x-coe-impersonating`) based on these fields
5. Dashboard layout reads the header and shows the impersonation banner

---

## 7. Database Schema

### 7.1 New Model — `ImpersonationSession`

Add to `prisma/schema.prisma`:

```prisma
enum ImpersonationStatus {
  ACTIVE
  ENDED
  EXPIRED
}

model ImpersonationSession {
  id              String               @id @default(uuid())
  adminId         Int
  targetUserId    Int
  status          ImpersonationStatus  @default(ACTIVE)
  startedAt       DateTime             @default(now())
  endedAt         DateTime?
  durationSeconds Int?
  ipAddress       String?              @db.VarChar(45)
  userAgent       String?              @db.Text
  metadata        Json?

  // Nullable — audit records survive user deletion
  admin           User?                @relation("ImpersonationAdmin", fields: [adminId], references: [id], onDelete: SetNull)
  targetUser      User?                @relation("ImpersonationTarget", fields: [targetUserId], references: [id], onDelete: SetNull)

  // Performance indexes
  @@index([adminId, status])
  @@index([adminId, startedAt])
  @@index([targetUserId, startedAt])
  @@index([status, startedAt])
  @@map("impersonation_sessions")
}
```

### 7.2 Uniqueness Constraint

A **database-level partial unique index** enforces "one active session per admin":

```sql
-- Run as a separate migration after adding the table
CREATE UNIQUE INDEX idx_impersonation_sessions_admin_active
  ON impersonation_sessions (adminId)
  WHERE status = 'ACTIVE';
```

This prevents race conditions at the database level — even if two concurrent requests pass the application-level check, only one `INSERT` with `status = 'ACTIVE'` per `adminId` will succeed. The second will throw a unique constraint violation, which the API handler must catch and return an appropriate error.

### 7.3 Migration

```bash
npx prisma migrate dev --name add_impersonation_sessions
```

Prisma does not natively support partial unique indexes. Add the raw SQL index in a separate migration:

```bash
npx prisma migrate dev --name add_impersonation_session_active_unique --create-only
```

Then edit the generated SQL to add:

```sql
CREATE UNIQUE INDEX idx_impersonation_sessions_admin_active
  ON impersonation_sessions (adminId)
  WHERE status = 'ACTIVE';
```

Then apply:

```bash
npx prisma migrate deploy
```

### 7.4 Dashboard Schema — No Changes

The Project Dashboard database does not need schema changes. The Dashboard sees the impersonated user via the shared token and upserts them into its existing `users` table. Impersonation audit records live in CoE Main's DB.

### 7.5 Data Retention

| Action | Policy |
|---|---|
| Row deletion | Never. The table is append-only. |
| `endedAt` update | Allowed. Set when session transitions to ENDED or EXPIRED. |
| `durationSeconds` update | Allowed. Set when session ends. |
| `status` update | Allowed. Transitions: ACTIVE → ENDED, ACTIVE → EXPIRED. |
| Foreign key on delete | `SetNull` — audit records survive user deletion. |
| Archival | Future job may move records older than 1 year to a cold storage table. |

---

## 8. Session Lifecycle

### 8.1 State Machine

```
                  ┌──────────┐
                  │ CREATED  │  (row created in DB)
                  └────┬─────┘
                       │
                       ▼
                  ┌──────────┐
         ┌──────▶│  ACTIVE  │◀────── (only one active per admin)
         │       └────┬─────┘
         │            │
         │     ┌──────┴────────┐
         │     │               │
         │     ▼               ▼
         │  ┌──────┐     ┌────────┐
         │  │ENDED │     │EXPIRED │
         │  └──┬───┘     └───┬────┘
         │     │             │
         │     ▼             ▼
         │  (terminal)    (terminal)
         └──────────── terminal states are final
```

### 8.2 State Transition Rules

| Transition | Triggered By | When | Who |
|---|---|---|---|
| CREATED → ACTIVE | `POST /api/admin/impersonate/start` | Row created with `status: 'ACTIVE'` | API handler |
| ACTIVE → ENDED | `POST /api/admin/impersonate/stop` | Admin clicks "Stop Impersonating" | API handler (reads `sessionId` from token) |
| ACTIVE → ENDED | `POST /api/auth/logout` | Admin logs out during impersonation | Logout handler |
| ACTIVE → ENDED | `POST /api/auth/refresh` | Refresh detects invalid session (admin demoted, target missing) | Refresh handler (fallback) |
| ACTIVE → EXPIRED | `POST /api/auth/refresh` | Refresh token itself has expired — no fallback possible | Refresh handler (token verify fails) |

### 8.3 What Happens During Each Transition

**CREATED → ACTIVE:**
- `durationSeconds` = null
- `endedAt` = null
- JWTs generated with `isImpersonating: true` and `impersonation.sessionId`

**ACTIVE → ENDED (stop):**
- `endedAt` = `NOW()`
- `durationSeconds` = `NOW() - startedAt`
- Admin tokens regenerated, cookies overwritten

**ACTIVE → ENDED (logout):**
- Same as stop, but cookies cleared instead of regenerating admin tokens

**ACTIVE → ENDED (refresh fallback):**
- `endedAt` = `NOW()`
- `durationSeconds` = `NOW() - startedAt`
- `metadata` = JSON with reason (e.g., `{ "reason": "admin_demoted" }`)
- Normal admin tokens generated, cookies overwritten

**ACTIVE → EXPIRED:**
- `endedAt` = `NOW()`
- `durationSeconds` = `NOW() - startedAt`
- User redirected to login

---

## 9. Session Uniqueness & Race Conditions

### 9.1 Enforcement: One Active Session Per Admin

Each admin may have **exactly zero or one** active impersonation session at any time.

### 9.2 Application-Level Check

The `POST /api/admin/impersonate/start` handler checks before creating:

```typescript
const existingActive = await prisma.impersonationSession.findFirst({
  where: { adminId: admin.id, status: 'ACTIVE' },
});
if (existingActive) {
  return errorRes('You already have an active impersonation session.', [], 400);
}
```

### 9.3 Database-Level Enforcement

The partial unique index (`WHERE status = 'ACTIVE'`) on `(adminId)` ensures that even if two concurrent requests pass the application check simultaneously, only one `INSERT` succeeds. The second request will receive a Prisma `P2002` unique constraint error, which the handler must catch:

```typescript
try {
  const session = await prisma.impersonationSession.create({ ... });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return errorRes('An impersonation session was already created by another request.', [], 409);
  }
  throw error;
}
```

### 9.4 Concurrent Request Handling

| Scenario | Behaviour |
|---|---|
| Same admin clicks "Impersonate" twice rapidly | Application check passes for both → DB unique constraint catches second → returns 409 |
| Same admin clicks "Impersonate" from two browser tabs | Same as above — only one session created |
| Same admin clicks "Stop Impersonating" twice rapidly | First call ends the session and sets `status: 'ENDED'`. Second call finds `status !== 'ACTIVE'` → returns 400 "No active session." |

### 9.5 Session Expiry Boundary

An impersonation session cannot outlive:
- The admin's `ADMIN` role (checked on refresh)
- The target user's `ACTIVE` status (checked on refresh)
- The refresh token's TTL (7 days, configurable)

After any of these boundaries, the session transitions to `ENDED` or `EXPIRED`.

---

## 10. Session Switching (Start & Stop)

### 10.1 How Impersonation Starts

```
1. Admin is logged into CoE Main as ADMIN
2. Admin navigates to /admin (admin panel)
3. Admin types in the search bar
4. Search results appear with "Impersonate" buttons
5. Admin clicks "Impersonate" next to a user
6. Confirmation modal appears: "Are you sure you want to impersonate [name]?"
7. Admin confirms
8. Frontend calls POST /api/admin/impersonate/start with { targetId: 42 }
9. API handler:
   a. authenticate(req) → must return TokenPayload with role === 'ADMIN'
   b. Parse targetId from body
   c. Query target user: prisma.user.findUnique({ where: { id: targetId } })
   d. Validate:
      - Target exists. If not → 400 "Target user not found."
      - Target.status === 'ACTIVE'. If not → 400 "Target user is not active."
      - targetId !== admin.id. If equal → 400 "Cannot impersonate yourself."
   e. Check for existing active session (application + DB level — see section 9)
   f. Record IP from x-forwarded-for or x-real-ip headers, fallback to req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
   g. Record User-Agent from req.headers.get('user-agent')
   h. Create ImpersonationSession in DB:
      { id: uuid, adminId, targetUserId, status: 'ACTIVE', ipAddress, userAgent }
   i. Query fresh target user data from DB (all fields needed for token)
   j. Build TokenPayload via buildImpersonationAccessTokenPayload(targetUser, session.id)
   k. Build SharedTokenPayload via buildSharedTokenPayload(targetUser, { sessionId: session.id })
   l. Generate accessToken = generateAccessToken(payload)
   m. Generate refreshToken = generateRefreshToken(payload)
   n. Generate sharedToken = generateSharedToken(sharedPayload)
   o. Set cookies (same pattern as login route):
      - accessToken: httpOnly, secure, sameSite lax, maxAge = ACCESS_TOKEN_TTL_SECONDS, path = /
      - refreshToken: httpOnly, secure, sameSite lax, maxAge = REFRESH_TOKEN_TTL_SECONDS, path = /
      - coe_shared_token: shared cookie options, maxAge = SHARED_TOKEN_TTL_SECONDS
   p. Return { success: true, data: { sessionId, targetUser: { id, name, email, role, uid } } }
10. Frontend receives success → window.location.href = "/" (full page reload)
11. CoE Main layout re-reads cookies → sees impersonation token → renders as target user
```

### 10.2 How Impersonation Ends (Stop)

**Endpoint called from:** Both CoE Main and Project Dashboard (via the "Stop Impersonating" button in the banner).

```
1. Admin clicks "Stop Impersonating" in the banner
2. Frontend calls POST /api/admin/impersonate/stop (empty body)
3. API handler:
   a. authenticate(req) → must return TokenPayload with isImpersonating === true
   b. Extract sessionId from current token: payload.impersonation.sessionId
   c. Look up ImpersonationSession: prisma.impersonationSession.findUnique({ where: { id: sessionId } })
   d. Validate:
      - Session exists. If not → 400 "Impersonation session not found."
      - Session.status === 'ACTIVE'. If not → 400 "No active impersonation session."
      - Session.adminId matches the admin who started it (defense in depth)
   e. Query admin user: prisma.user.findUnique({ where: { id: session.adminId } })
   f. If admin exists and admin.status === 'ACTIVE':
      - Generate normal tokens for the admin (no impersonation metadata)
      - Set cookies with admin's tokens
   g. If admin no longer exists OR admin.status !== 'ACTIVE':
      - Clear all 3 cookies instead (admin cannot be restored)
   h. Close session in DB:
      - status: 'ENDED'
      - endedAt: NOW()
      - durationSeconds: Math.floor((NOW() - session.startedAt) / 1000)
   i. Return { success: true, data: { ... } }
4. Frontend:
   a. CoE Main: window.location.href = "/admin"
   b. Project Dashboard: window.location.href = "https://tcetcercd.in/admin"
```

### 10.3 Ownership Verification — How the System Confirms Session Belongs to the Admin

During impersonation, the JWT's `id` field contains the **target user's** ID, not the admin's. The system uses the session chain to verify ownership:

```
JWT payload.impersonation.sessionId
  ↓ (lookup)
ImpersonationSession record
  ↓
ImpersonationSession.adminId  ← the ORIGINAL admin's DB user ID
  ↓
Query User table WHERE id = session.adminId
  ↓
This is the admin identity — used for restoration and audit
```

**Ownership check in stop handler:**

```
1. Read sessionId from JWT → token.impersonation.sessionId
2. Query ImpersonationSession WHERE id = sessionId
3. Session.adminId is the real admin ID (the person who STARTED the impersonation)
4. The session belongs to this admin — no additional match needed beyond session lookup.
   (The JWT itself was issued to the admin at impersonation start time.
    There is no scenario where session.adminId would not match because the session
    was created with adminId = current admin's ID at start time.)
```

**Defense-in-depth ownership check (optional, for M2M token scenarios):**
If the stop handler wants extra verification:
1. Look up session.adminId
2. Query the admin user from the DB
3. Verify the resulting admin's email matches some known context

**This is NOT needed for the cookie-based flow** — the JWT's `impersonation.sessionId` was issued to this specific admin at impersonation start. A different admin cannot possess a valid JWT with a sessionId they didn't create (because `JWT_ACCESS_SECRET` prevents forgery).

### 10.4 Stop Behaviour Matrix

| Origin | API Call | Post-Stop Redirect | Cookie State |
|---|---|---|---|
| CoE Main | `POST /api/admin/impersonate/stop` | `/admin` | Admin tokens restored |
| Project Dashboard | `POST /api/admin/impersonate/stop` | `https://tcetcercd.in/admin` | Admin tokens restored |
| Multiple browser tabs (Tab 1 stops) | `POST /api/admin/impersonate/stop` | URL per origin | All tabs get admin tokens (shared cookies) |
| Tab 2 (after Tab 1 stopped) | Any navigation | Normal admin pages | Admin token already in cookies |
| Expired token during impersonation | `POST /api/auth/refresh` (auto) | N/A — refresh fails → login page | Cookies cleared |
| Closed browser, new window | Any navigation | Login page (refresh token expired) | No valid cookies |

### 10.4 Session Persistence

The impersonation session is **cookie-based** for runtime state. The `ImpersonationSession` DB record is for audit + restoration, not for runtime session lookup on every request. No server-side session store is needed.

### 10.5 Cookie Overwrite Order (Mandatory — Identical Everywhere)

Every endpoint that replaces auth cookies must set them in this **exact order**:

1. `accessToken` — always first (primary auth cookie)
2. `refreshToken` — always second (refresh depends on access token being readable first)
3. `coe_shared_token` — always third (least critical, cross-subdomain)

**This applies to ALL endpoints:**
- `POST /api/admin/impersonate/start` — sets impersonation cookies
- `POST /api/admin/impersonate/stop` — restores admin cookies
- `POST /api/auth/refresh` — refreshes tokens (impersonation or normal)
- Normal login (existing) — already uses this order by convention

**Why this order matters:** The `authenticate()` function tries `Authorization: Bearer` header first, then falls back to `accessToken` cookie. Setting `accessToken` first ensures it's available as soon as the response is processed. The `refreshToken` is only read by the refresh endpoint. The `coe_shared_token` is only read by Project Dashboard middleware. Setting them in this order eliminates any race condition within the same response where an intermediate middleware could see partial state.

### 10.6 Nested Impersonation — Explicitly Forbidden

An administrator cannot start a second impersonation session while already impersonating another user.

**Enforcement:**
- The JWT's `isImpersonating` flag is checked in the `start` handler before creating a session
- If `authenticate(req)` returns a payload with `isImpersonating === true`, return 409

```json
{ "success": false, "message": "Already impersonating. Stop the current impersonation first.", "data": null }
```

**Status Code:** 409 Conflict.

**API contract update (add to start endpoint error table):**

| Status | `message` | When |
|---|---|---|
| 409 | `"Already impersonating. Stop the current impersonation first."` | Caller's token has `isImpersonating: true` |

**UI behaviour:**
- The "Impersonate" button should be hidden or disabled when the admin is currently impersonating
- The search section should show a message: "Stop the current impersonation before starting a new one."

**Edge case:** Even an admin-as-admin impersonating another admin cannot nest.

### 10.7 Transaction Boundaries for Start Endpoint

The `POST /api/admin/impersonate/start` handler must use a **Prisma interactive transaction** for the DB portion:

```typescript
const session = await prisma.$transaction(async (tx) => {
  // Step A: Verify target still exists + ACTIVE within the transaction
  const target = await tx.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError('Target user not found.', 400);
  if (target.status !== 'ACTIVE') throw new ApiError('Target user is not active.', 400);

  // Step B: Verify no race-condition duplicate within the transaction
  const existing = await tx.impersonationSession.findFirst({
    where: { adminId: admin.id, status: 'ACTIVE' },
  });
  if (existing) throw new ApiError('You already have an active impersonation session.', 400);

  // Step C: Create session within the transaction
  return tx.impersonationSession.create({
    data: { adminId: admin.id, targetUserId: target.id, ipAddress, userAgent },
  });
});
```

**JWT generation and cookie setting MUST occur AFTER the transaction commits.** This ensures:
- The session is confirmed persisted in the DB before tokens referencing it are issued
- If the transaction fails, no tokens are generated (no dangling references to a non-existent session)
- If token generation fails, the session is already created (a cleanup/expiry path handles orphaned sessions naturally via the refresh fallback)

### 10.8 Multi-Tab Behaviour — Explicit Rule

When an administrator has multiple browser tabs open during impersonation:

- All tabs share the same cookies (standard browser behaviour).
- **If Tab A stops impersonation:** Tab A's cookies are overwritten. Tab B's cookies become stale.
- **Tab B continues displaying cached UI until the next navigation or authenticated request.**
- **Tab B's next request** (link click, page refresh, API call) sends the updated cookies (because the browser sends whatever is in the cookie jar, not what was in the cookie jar when the page loaded).
- **No WebSocket, BroadcastChannel, or tab-synchronization mechanism is implemented.** The impersonation state may appear inconsistent between tabs for the duration of a single page view, but the next request always resolves to the correct state.
- This is acceptable — the system is always eventually consistent via cookies.

---

## 11. Session Restoration

### 11.1 Stop Handler — Restoration Flow (Exhaustive)

```
POST /api/admin/impersonate/stop called
  │
  ├── Step 1: authenticate(req)
  │     Result: TokenPayload with isImpersonating === true
  │     If fail → 401
  │
  ├── Step 2: Extract sessionId from token.impersonation.sessionId
  │
  ├── Step 3: Query ImpersonationSession from DB
  │     ├── Session FOUND + status === 'ACTIVE' → continue
  │     ├── Session FOUND + status !== 'ACTIVE' → 400 "No active session."
  │     └── Session NOT FOUND → 400 "Impersonation session not found."
  │
  ├── Step 4: Verify session ownership
  │     (The JWT's payload.id is the TARGET user's ID during impersonation.
  │      The session.adminId is the original admin's real ID from DB.
  │      Ownership is established by the session lookup itself — this session
  │      was created with adminId matching the admin who was authenticated at
  │      start time. The JWT carrying this sessionId was issued to that admin.
  │      No additional match against payload.id is possible or needed because
  │      payload.id is the target user's ID.)
  │     (Defense-in-depth: compare the decoded admin's email from session.adminId
  │      against the JWT issuer context — optional, not required for cookie flow.)
  │     If session not found → 400 "Impersonation session not found."
  │
  ├── Step 5: Query admin user from session.adminId (the ORIGINAL admin's DB record)
  │     │
  │     │  Decision rule: Issue tokens for the admin's current role if the account
  │     │  is ACTIVE, regardless of whether the role is still ADMIN. The application
  │     │  will naturally render whatever permissions that account now has.
  │     │  Only clear cookies if the account is inactive or deleted.
  │     │
  │     ├── Admin EXISTS + status === 'ACTIVE'
  │     │   └── Generate fresh tokens for this user with their current role (may be
  │     │       FACULTY, STUDENT, etc. if demoted while impersonation was active)
  │     │       → set cookies → admin restored with current role
  │     ├── Admin EXISTS + status !== 'ACTIVE'
  │     │   └── Clear all cookies → redirect to login page (account is inactive)
  │     └── Admin NOT FOUND (deleted)
  │         └── Clear all cookies → redirect to login page
  │
  └── Step 6: Close session (regardless of admin state)
        status: 'ENDED'
        endedAt: NOW()
        durationSeconds: computed
```

### 11.2 Restoration Outcomes — Complete Table

| Admin State | Token Outcome | Cookie Action | User Experience |
|---|---|---|---|
| Exists, ACTIVE, any role | New tokens generated with current role | Cookies overwritten | Redirected. App renders UI for whatever role the account now has. |
| Exists, not ACTIVE | No tokens generated | Cookies cleared | Redirected → login page → session_expired |
| Not found (deleted) | No tokens generated | Cookies cleared | Redirected → login page |
| Session missing (row deleted) | N/A — handler returns 400 | No change | Banner shows error — admin must sign out manually |

**Key rule:** The stop and refresh handlers must NEVER refuse to restore a user solely because their role is no longer ADMIN. If the account exists and is ACTIVE, issue tokens for their current role. The application's existing role-based UI will naturally scope their access.

---

## 12. Refresh Flow

### 12.1 Complete Refresh Decision Tree

```
POST /api/auth/refresh called
  │
  ├── Step 1: Read refreshToken from cookies
  │     ├── Cookie found → continue
  │     └── Cookie NOT found → 401 "No refresh token provided."
  │
  ├── Step 2: verifyRefreshToken(token)
  │     ├── Valid → decode TokenPayload
  │     └── Invalid/expired → 401 "Invalid or expired refresh token."
  │
  ├── Step 3: Check payload.isImpersonating
  │     │
  │     ├── FALSE (normal refresh) → EXISTING FLOW (unchanged)
  │     │   └── Query user where id = payload.id
  │     │       ├── Found + ACTIVE → generate new tokens → set cookies → return
  │     │       └── Not found / not active → 401
  │     │
  │     └── TRUE (impersonation refresh) → IMPERSONATION FLOW (new)
  │         │
  │         ├── Step 3a: Extract sessionId from payload.impersonation.sessionId
  │         │
  │         ├── Step 3b: Query ImpersonationSession
  │         │     ├── FOUND + status === 'ACTIVE' → continue
  │         │     ├── FOUND + status !== 'ACTIVE' → go to FALLBACK
  │         │     └── NOT FOUND → go to FALLBACK
  │         │
  │         ├── Step 3c: Validate admin still authorized
  │         │     Query admin: prisma.user.findUnique({ where: { id: session.adminId } })
  │         │     ├── Exists + status === 'ACTIVE' + role === 'ADMIN' → continue
  │         │     └── Any failure → go to FALLBACK
  │         │
  │         ├── Step 3d: Validate target user still exists
  │         │     Query target: prisma.user.findUnique({ where: { id: session.targetUserId } })
  │         │     ├── Exists + status === 'ACTIVE' → continue
  │         │     └── Any failure → go to FALLBACK
  │         │
  │         ├── Step 3e: All valid — ISSUE NEW IMPERSONATION TOKENS
  │         │     ├── Fetch fresh target user data from DB
  │         │     ├── buildImpersonationAccessTokenPayload(targetUser, sessionId)
  │         │     ├── generateAccessToken()
  │         │     ├── generateRefreshToken() (same payload — has isImpersonating)
  │         │     ├── buildSharedTokenPayload(targetUser, { sessionId })
  │         │     ├── generateSharedToken()
  │         │     ├── Set all 3 cookies
  │         │     └── Return { success: true, data: { accessToken } }
  │         │
  │         └── Step 3f: FALLBACK — END SESSION + RESTORE USER
  │               ├── (only if session exists — may be null)
  │               ├── If session exists:
  │               │     status: 'ENDED', endedAt: NOW(), durationSeconds: computed
  │               │     metadata: { reason: 'admin_demoted' | 'admin_deleted' | 'target_gone' | 'session_ended' }
  │               ├── Query the original admin user from session.adminId (or from payload fallback)
  │               ├── If admin exists + ACTIVE:
  │               │     Generate tokens for the admin's CURRENT role (may not be ADMIN)
  │               │     → set cookies with fresh tokens
  │               └── If admin doesn't exist / not active:
  │                     Clear all cookies → 401 "Session expired."
```

### 12.2 Fallback Reasons — Metadata Values

| Condition | `metadata.reason` | Admin Account ACTIVE? | Token Outcome |
|---|---|---|---|
| Session not found | `"session_not_found"` | Yes | Tokens for current role |
| Session not ACTIVE | `"session_ended"` | Yes | Tokens for current role |
| Admin not found | `"admin_deleted"` | N/A | Clear cookies |
| Admin not ACTIVE | `"admin_inactive"` | No | Clear cookies |
| Admin role changed (any role) | `"admin_demoted"` | Yes | Tokens for current role |
| Target not found | `"target_deleted"` | Yes | Tokens for current role |
| Target not ACTIVE | `"target_inactive"` | Yes | Tokens for current role |

**Key rule:** If the original admin account exists and is ACTIVE, issue tokens for their current role regardless of what that role is. The app's existing auth will naturally scope their access. Only clear cookies if the account is truly gone or inactive.

### 12.3 Important Restriction

The impersonation token's `refreshToken` is signed with `JWT_REFRESH_SECRET`. Since the refresh token is **not rotated** (existing architecture), the same refresh token remains valid until its 7-day TTL expires. This means:

- If an impersonation session ends (via stop/logout), the old refresh token (with `isImpersonating: true`) is still technically valid.
- However, on the next refresh attempt, the handler will look up the session, find it's not ACTIVE, and fall back to admin tokens.
- This is safe — the fallback path always restores admin identity.
- **Future enhancement:** Rotate refresh tokens to invalidate them immediately on session end.

---

## 13. Logout During Impersonation

### 13.1 Logout Handler Changes (POST /api/auth/logout)

**Current behaviour (unchanged for normal logouts):**
- Clear all 3 cookies
- Return JSON

**New behaviour when `isImpersonating === true`:**
1. Read `accessToken` cookie
2. If present, decode with `verifyAccessToken()` (catch errors — proceed with cleanup even if token is invalid)
3. If `payload.isImpersonating === true`:
   a. Extract `sessionId`
   b. Look up session and set: `status: 'ENDED'`, `endedAt: NOW()`, `durationSeconds: computed`
   c. (If session not found — continue with cleanup anyway)
4. Clear all 3 cookies
5. Return JSON

### 13.2 Logout Handler Changes (GET /api/auth/logout)

Same logic as POST but:
1. Decode the token from cookies
2. Close session if impersonating
3. Clear all 3 cookies
4. Redirect to callback URL

### 13.3 Logout from Project Dashboard During Impersonation

No changes needed to the Dashboard's logout flow. The Dashboard redirects to `https://tcetcercd.in/logout?callbackUrl=...`. CoE Main's GET `/logout` handler (updated per section 13.2) will close the session.

### 13.4 Logout Behaviour Matrix

| Action | Session Closed? | Cookies Cleared? | Admin Restored? | Login Required? |
|---|---|---|---|---|
| Sign Out (impersonating) | ✅ | ✅ | ❌ | ✅ |
| Stop Impersonating (CoE Main) | ✅ | Set to admin tokens | ✅ | ❌ |
| Stop Impersonating (Dashboard) | ✅ | Set to admin tokens | ✅ | ❌ |
| Close browser (impersonating) | ❌ (cookie cleanup on next visit) | ✅ (browser cleanup) | ❌ | ✅ |
| Refresh token expires (impersonating) | ✅ (via EXPIRED) | ✅ (redirect to login) | ❌ | ✅ |

### 13.5 Logout Handler Implementation Note

The logout handler must NOT fail if session lookup/update fails. The primary goal is to clear cookies and log the user out. Session cleanup is a best-effort side effect.

```typescript
// Pseudo-code — session cleanup is best-effort
try {
  const token = req.cookies.get('accessToken')?.value;
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload.isImpersonating && payload.impersonation?.sessionId) {
      await prisma.impersonationSession.updateMany({
        where: { id: payload.impersonation.sessionId, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt: new Date() },
      }).catch(() => {}); // Swallow — session cleanup must not break logout
    }
  }
} catch {
  // Token decode failure is not fatal — continue with cookie cleanup
}
// Always clear cookies regardless of session state
```

---

## 14. Authorization Rules

### 14.1 Fundamental Rule

> **During impersonation, ALL authorization checks evaluate the impersonated user. The admin must NEVER retain admin privileges during impersonation.**
>
> The original admin identity exists ONLY for:
> 1. **Audit logging** — recording which admin impersonated whom
> 2. **Session restoration** — regenerating admin tokens when impersonation stops
> 3. **UI banner display** — showing "Original session: Dr. Admin"

### 14.2 How This Is Enforced

Because `TokenPayload.id` and `TokenPayload.role` are set to the **target user's values**:

| Function Call | Normal Token (Admin) | Impersonation Token (Admin → Student) |
|---|---|---|
| `authenticate(req).role` | `"ADMIN"` | `"STUDENT"` |
| `authorize(user, 'ADMIN')` | `true` | `false` |
| `authorize(user, 'STUDENT')` | `false` | `true` |
| `requireRole("ADMIN")` | ✅ passes | ❌ throws |
| `requireRole("STUDENT")` | ❌ throws | ✅ passes |

**No changes to `authenticate()`, `authorize()`, `requireRole()`, or any server action are needed.**

### 14.3 Anti-Pattern — Never Do This

```typescript
// FORBIDDEN: Checking isImpersonating to grant elevated access.
// This creates a hidden backdoor.
if (user.isImpersonating && user.impersonation?.impersonatedBy.role === "ADMIN") {
  // grant admin access — THIS IS A BACKDOOR
}

// FORBIDDEN: Bypassing role checks for impersonating users.
if (user.isImpersonating) {
  // skip authorization — THIS IS A BACKDOOR
}
```

**The `isImpersonating` flag must never be used in authorization logic.** It is for UI display and session management only.

### 14.4 Where `isImpersonating` Is Used (Exhaustive List)

| File | Check | Purpose |
|---|---|---|
| `ImpersonationBanner.tsx` | `isImpersonating` | Show/hide the banner |
| `POST /api/admin/impersonate/stop` | `isImpersonating` | Verify the caller is in an impersonation session |
| `POST /api/auth/refresh` | `isImpersonating` | Branch refresh logic |
| `POST /api/auth/logout` | `isImpersonating` | Close session before clearing cookies |

### 14.5 Dashboard Authorization During Impersonation

The Dashboard's `requireRole()` reads `headers()` → `resolveUserFromHeaders()` → `upsertDashboardUser()`. The upsert creates/updates the target user with the target user's role. So `requireRole("STUDENT")` works for a student impersonation.

**No changes to `resolve-user.ts`, `coe-guard.ts`, or any server action.**

---

## 15. Middleware

### 15.1 CoE Main — No Changes

CoE Main does not use Next.js middleware for authentication. Auth is per-route in API handlers. No middleware changes needed.

### 15.2 Project Dashboard — Middleware Changes

**File:** `project-dashboard/src/middleware.ts`

**New header injected when `payload.isImpersonating === true`:**

| Header | Value | Purpose |
|---|---|---|
| `x-coe-impersonating` | `"true"` | Signals impersonation to all downstream components |

**`x-coe-impersonation-json` is REMOVED.** The dashboard does NOT need a JSON blob in headers. If the dashboard banner needs additional impersonation details (admin name), it fetches them from a CoE Main API or falls back to the existing auth headers.

**Updated middleware logic:**

```
Read coe_shared_token cookie
  → verifyCoEToken(token)  // returns CoeTokenPayload
  → inject existing headers (unchanged):
      x-coe-email: payload.email
      x-coe-name: payload.name || ""
      x-coe-role: payload.role
      x-coe-status: payload.status
  → NEW: if payload.isImpersonating === true:
      inject x-coe-impersonating: "true"
  → NextResponse.next()
```

### 15.3 Payload Extraction in `verifyCoEToken()`

The `verifyCoEToken()` function in `project-dashboard/src/lib/coe-auth.ts` already extracts all JWT claims via `jwtVerify`. The new fields (`isImpersonating`, `impersonation`) are automatically available.

**Updated `CoeTokenPayload` interface:**

```typescript
export interface CoeTokenPayload {
  email: string;
  name?: string;
  role: CoeRole;
  status: CoeStatus;
  // New optional fields
  isImpersonating?: true;
  impersonation?: {
    sessionId: string;
  };
}
```

Update `verifyCoEToken()` to extract these fields:

```typescript
export async function verifyCoEToken(
  token: string | null | undefined
): Promise<CoeTokenPayload | null> {
  if (!token) return null;
  const secret = process.env.COE_JWT_SECRET;
  if (!secret) return null;

  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    if (!payload || typeof payload !== "object") return null;

    const email = payload.email as string | undefined;
    const name = payload.name as string | undefined;
    const role = payload.role as CoeRole | undefined;
    const status = payload.status as CoeStatus | undefined;
    const isImpersonating = payload.isImpersonating as true | undefined;
    const impersonationSessionId = (payload.impersonation as { sessionId?: string } | undefined)?.sessionId;

    if (!email || !role || !status) return null;
    if (!mapCoERoleToDashboard(role)) return null;

    return {
      email,
      name,
      role,
      status,
      ...(isImpersonating && {
        isImpersonating: true as const,
        impersonation: impersonationSessionId ? { sessionId: impersonationSessionId } : undefined,
      }),
    };
  } catch {
    return null;
  }
}
```

---

## 16. Header Design (Minimized)

### 16.1 Decision: Small Headers, API-Fetched Banner Data

**Problem with large JSON headers:**
- Header size limits (most servers cap headers at 8KB–16KB total)
- JSON in headers is opaque, non-cachable, and hard to debug
- Middleware cannot easily modify headers for subsequent requests

**Solution:**
- `x-coe-impersonating: "true"` — single small header, signals impersonation
- Banner data (admin name, target name) fetched via a lightweight CoE Main API call

### 16.2 Tradeoff

| Approach | Pros | Cons |
|---|---|---|
| JSON in headers | No extra request; banner renders immediately | Header size; opaque; hard to debug |
| API-fetched data (selected) | Clean headers; always fresh data; debuggable | One extra API call to populate banner |

### 16.3 Dashboard Banner Data Retrieval

When the Dashboard detects impersonation (`x-coe-impersonating: "true"`), the banner component fetches metadata from:

```
GET https://tcetcercd.in/api/admin/impersonate/session-info
Cookie: coe_shared_token=<impersonation_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "impersonatedBy": {
      "name": "Dr. Admin",
      "email": "admin@tcetcercd.in"
    },
    "impersonatingAs": {
      "name": "Rahul Shah",
      "email": "rahul.shah@tcetcercd.in",
      "role": "STUDENT",
      "uid": "23CMP001"
    }
  }
}
```

**Auth:** The API reads the shared token from the cookie, extracts `sessionId`, queries the DB, and returns admin + target info. It requires no bearer token — the shared token cookie is sufficient authentication.

**Caching:** The banner data can be cached client-side for the duration of the page session (no stale-while-revalidate needed since impersonation sessions rarely change).

### 16.4 CoE Main Banner Data

CoE Main reads the access token, extracts `sessionId`, and queries the DB server-side. No extra API call needed — the data is fetched in the layout component.

---

## 17. API Contracts

### 17.1 `POST /api/admin/impersonate/start`

**Auth:** ADMIN only.

**Request Body:**
```json
{
  "targetId": 42
}
```

**Validation (Zod schema — create in `src/lib/validators.ts`):**
```typescript
export const impersonateStartSchema = z.object({
  targetId: z.number().int().positive("Target user ID is required."),
});
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Impersonation started.",
  "data": {
    "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "targetUser": {
      "id": 42,
      "name": "Rahul Shah",
      "email": "rahul.shah@tcetcercd.in",
      "role": "STUDENT",
      "uid": "23CMP001"
    }
  }
}
```

**Error Responses:**

| Status | `message` | When |
|---|---|---|
| 401 | `"Unauthorized"` | `authenticate(req)` returns null |
| 403 | `"Forbidden"` | `authorize(user, 'ADMIN')` returns false |
| 400 | `"Target user ID is required."` | Validation — missing or invalid targetId |
| 400 | `"Target user not found."` | No user with that ID |
| 400 | `"Cannot impersonate yourself."` | targetId === admin.id |
| 400 | `"Target user is not active."` | target.status !== 'ACTIVE' |
| 400 | `"You already have an active impersonation session."` | Application-level check (section 9.2) |
| 409 | `"An impersonation session was already created by another request."` | Database-level unique constraint (section 9.3) |
| 409 | `"Already impersonating. Stop the current impersonation first."` | Caller's token has `isImpersonating: true` |
| 500 | `"Internal server error"` | Unexpected error |

**Cookie Changes:**
- `accessToken` overwritten with impersonation token (set first)
- `refreshToken` overwritten with impersonation token (set second)
- `coe_shared_token` overwritten with impersonation token (set third)

**Audit:** Session creation logged in `impersonation_sessions` table.

### 17.2 `POST /api/admin/impersonate/stop`

**Auth:** Any authenticated user with `isImpersonating === true`.

**Request Body:** None (empty).

**Success Response (200):**
```json
{
  "success": true,
  "message": "Impersonation stopped. Admin session restored.",
  "data": {
    "adminUser": {
      "id": 1,
      "name": "Dr. Admin",
      "email": "admin@tcetcercd.in",
      "role": "ADMIN"
    },
    "session": {
      "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "durationSeconds": 3600
    }
  }
}
```

**Error Responses:**

| Status | `message` | When |
|---|---|---|
| 401 | `"Unauthorized"` | No valid access token |
| 400 | `"Not currently impersonating."` | Token exists but `isImpersonating` is not true |
| 400 | `"Impersonation session not found."` | `sessionId` from token not in DB |
| 400 | `"No active impersonation session."` | Session exists but status !== 'ACTIVE' |
| 403 | `"Impersonation session not found."` | `sessionId` from token not in DB (ownership cannot be verified) |

**Side Effects:**
1. ImpersonationSession updated: status = 'ENDED', endedAt, durationSeconds
2. If admin account exists and is ACTIVE: new tokens issued for the admin's **current role** (may have changed during impersonation)
3. If admin account is deleted or inactive: all 3 cookies cleared

**Cookie Changes:**
- If admin restored: all 3 cookies overwritten with admin's real tokens
- If admin not restorable: all 3 cookies cleared

**Audit:** Session closure logged in `impersonation_sessions` table.

### 17.3 `GET /api/admin/impersonate/session-info`

**Auth:** Any authenticated user with `isImpersonating === true`. Accepts BOTH access token and shared token.

**Authentication precedence (explicit):**

| Caller | Token Source | Precedence | Mechanism |
|---|---|---|---|
| CoE Main (browser request from same origin) | `accessToken` cookie | Primary (checked first) | `authenticate(req)` via `verifyAccessToken()` |
| Project Dashboard (cross-subdomain request) | `coe_shared_token` cookie | Fallback (checked if no accessToken) | `verifyCoEToken()` via `jose` |

**Why both are accepted:**
- CoE Main always has `accessToken` — cheaper to verify (jsonwebtoken library, no network).
- Project Dashboard only has `coe_shared_token` (the shared cookie) — must accept it.
- Both tokens contain `isImpersonating` and `impersonation.sessionId`.

**Implementation in handler (explicit):**
```typescript
export async function GET(req: NextRequest) {
  // Step 1: Try access token first (CoE Main)
  let payload = authenticate(req);
  let usingSharedToken = false;

  // Step 2: Fall back to shared token (Project Dashboard)
  if (!payload || !payload.isImpersonating) {
    const sharedToken = req.cookies.get('coe_shared_token')?.value;
    if (sharedToken) {
      const coePayload = await verifyCoEToken(sharedToken);
      if (coePayload?.isImpersonating) {
        payload = {
          id: 0, // not used for session-info
          role: coePayload.role,
          name: coePayload.name || '',
          email: coePayload.email,
          isImpersonating: true,
          impersonation: coePayload.impersonation,
        } as TokenPayload;
        usingSharedToken = true;
      }
    }
  }

  if (!payload?.isImpersonating) {
    return errorRes('Not currently impersonating.', [], 400);
  }
  // ... continue with session lookup
}
```

**Cache-Control:**
```
Cache-Control: no-store, must-revalidate
```

This endpoint returns live impersonation state. Browsers and proxies must never cache it.

**Purpose:** Returns impersonation session metadata for the banner UI.

**Request:** No query params.

```
Cookie: accessToken=<impersonation_token>  (CoE Main caller)
Cookie: coe_shared_token=<impersonation_token>  (Dashboard caller)
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "impersonatedBy": {
      "name": "Dr. Admin",
      "email": "admin@tcetcercd.in"
    },
    "impersonatingAs": {
      "name": "Rahul Shah",
      "email": "rahul.shah@tcetcercd.in",
      "role": "STUDENT",
      "uid": "23CMP001"
    }
  }
}
```

**Error Responses:**

| Status | `message` | When |
|---|---|---|
| 401 | `"Not authenticated."` | No valid access token or shared token |
| 400 | `"Not currently impersonating."` | Token exists but `isImpersonating` is not true |
| 400 | `"Impersonation session not found."` | `sessionId` from token not in DB |

**Timeout behaviour (for Project Dashboard callers):**
```
fetch with AbortSignal.timeout(5000)
  ↓
Response within 5s → show full banner
  ↓
Timeout or failure → show minimal banner "Impersonating" (no admin details)
  ↓
Stop button remains functional — it calls stop API independently
```

### 17.4 `GET /api/admin/impersonate/sessions`

**Auth:** ADMIN only.

**Purpose:** Lists all active impersonation sessions initiated by the current admin.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "startedAt": "2026-07-06T10:00:00.000Z",
      "targetUser": {
        "id": 42,
        "name": "Rahul Shah",
        "email": "rahul.shah@tcetcercd.in",
        "role": "STUDENT"
      }
    }
  ]
}
```

**Returns:** All sessions where `adminId === currentAdmin.id AND status === 'ACTIVE'`.

### 17.5 `GET /api/admin/impersonate/search`

See [Section 18 — Search Behaviour](#18-search-behaviour) for full specification.

---

## 18. Search Behaviour

### 18.1 Endpoint

`GET /api/admin/impersonate/search?q=...&page=1&limit=20`

**Auth:** ADMIN only.

### 18.2 Supported Search Types

The `q` parameter is matched against **three fields** using `OR` logic:

| Field | Match Type | Example Query | Matches |
|---|---|---|---|
| `email` | Case-insensitive substring | `rahul` | `rahul.shah@tcetcercd.in` |
| `email` | Case-insensitive substring | `@tcetcercd.in` | All users with that domain |
| `uid` | Case-insensitive substring | `23CMP` | `23CMP001`, `23CMP042` |
| `uid` | Case-insensitive exact match | `23CMP001` | `23CMP001` |
| `name` | Case-insensitive substring | `rahul shah` | `Rahul Shah` |
| `name` | Case-insensitive partial | `rah` | `Rahul Shah`, `Rahul Verma` |

### 18.3 Sorting

Results are sorted by `name` ascending (alphabetical). Secondary sort by `email` ascending.

### 18.4 Pagination

| Parameter | Type | Default | Max |
|---|---|---|---|
| `page` | integer | 1 | 100 |
| `limit` | integer | 20 | 50 |

**Response includes pagination metadata:**

```json
{
  "success": true,
  "data": {
    "users": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 143,
      "totalPages": 8
    }
  }
}
```

### 18.5 Maximum Results

A search without a query (`q` empty or missing) returns **zero results**. The admin must type at least 1 character.

If `q` is provided but matches more than `limit * totalPages` (i.e., 5000+ results), the query is **capped at 5000** for performance.

### 18.6 Debounce Behaviour (Frontend)

The search input in the admin panel must debounce at **300ms** before sending the API request. This prevents excessive API calls while typing.

### 18.7 Excluded Results

The search excludes:
- The current admin (can't impersonate self)
- Users with `status !== 'ACTIVE'`
- Users with `role === 'INDUSTRY_PARTNER'` (INDUSTRY role is explicitly rejected by the dashboard)

### 18.8 Response Shape (Per User)

```json
{
  "id": 42,
  "name": "Rahul Shah",
  "email": "rahul.shah@tcetcercd.in",
  "role": "STUDENT",
  "uid": "23CMP001",
  "status": "ACTIVE"
}
```

### 18.9 Search Performance — Required Database Indexes

The search query uses `name`, `email`, and `uid` with case-insensitive `contains` (which translates to `LIKE '%value%'` in MySQL). This is inherently a full-table scan for short queries. To mitigate performance issues:

**Required index — composite covering index:**
```sql
CREATE INDEX idx_users_impersonation_search ON users (status, role, name, email, uid);
```

**Why this index:**
- `status = 'ACTIVE'` — filtered first (narrows to active users)
- `role != 'INDUSTRY_PARTNER'` — filtered second
- `name`, `email`, `uid` — covered for the `LIKE` operations. Even with leading wildcards, MySQL can use the index as a covering index if all queried columns are in the index.

**Without this index:** A `LIKE '%value%'` query on an unindexed `name` column over thousands of users will cause a full table scan on every keystroke. The 300ms debounce helps, but the index is essential.

**For very large user tables (>100K users):** Add a full-text index as a future optimization:
```sql
CREATE FULLTEXT INDEX idx_users_search_fulltext ON users (name, email, uid);
```
Then use `MATCH(name, email, uid) AGAINST('query' IN BOOLEAN MODE)` instead of `contains`. This is NOT needed for the initial implementation.

**Search endpoint cache policy:**
```
Cache-Control: no-cache, no-store, must-revalidate
```
Search results are user-specific and must never be cached.

---

## 19. Audit Trail

### 19.0 Logging Policy — Explicit Rules

**What must be logged (always):**

| Event | Data | Logger |
|---|---|---|
| Impersonation started | `adminId`, `targetUserId`, `sessionId`, `ipAddress`, `userAgent` | Start handler |
| Impersonation stopped (manual) | `sessionId`, `adminId`, `durationSeconds` | Stop handler |
| Impersonation stopped (logout) | `sessionId`, `durationSeconds` | Logout handler |
| Refresh fallback (any reason) | `sessionId`, `reason`, `details` | Refresh handler |
| Invalid session detected | `sessionId`, `reason` | Refresh / Stop handler |
| Unauthorized start attempt | `userId`, `role`, `targetUserId` (if parsed) | Start handler (403 path) |

**What must NEVER be logged:**
- JWT contents (access tokens, refresh tokens, shared tokens)
- `impersonation.sessionId` alone is fine (it's a DB UUID, not a secret)
- Cookie values
- JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COE_JWT_SECRET`)
- Password hashes
- Any plaintext credentials

**Logging mechanism:**
- Use `console.log()` with structured JSON prefix for production observability (existing pattern in CoE Main)
- Example: `console.log('[impersonation]', JSON.stringify({ event: 'started', adminId, targetUserId, sessionId }))`
- Do NOT use `console.error()` for informational audit events (use `console.warn()` for failures, `console.log()` for successes)
- All audit events are also captured in the `impersonation_sessions` table (the primary audit store)

**Do NOT add a separate `audit_logs` table.** The `impersonation_sessions` table IS the audit log. It is append-only for creation and only updates `endedAt`/`status`/`durationSeconds`/`metadata` on termination.

### 19.1 All Audit Events — Complete Specification

| # | Event | Trigger | Data Captured | Who Captures | Storage |
|---|---|---|---|---|---|
| 1 | **Session created** | `POST /api/admin/impersonate/start` | `adminId`, `targetUserId`, `ipAddress`, `userAgent`, `startedAt`, `sessionId` | Start handler | `impersonation_sessions` row |
| 2 | **Session ended (manual)** | `POST /api/admin/impersonate/stop` | `endedAt`, `durationSeconds`, `status: 'ENDED'` | Stop handler | Updated `impersonation_sessions` row |
| 3 | **Session ended (logout)** | `POST /api/auth/logout` | `endedAt`, `durationSeconds`, `status: 'ENDED'` | Logout handler | Updated `impersonation_sessions` row |
| 4 | **Session ended (refresh fallback)** | `POST /api/auth/refresh` | `endedAt`, `durationSeconds`, `status: 'ENDED'`, `metadata: { reason }` | Refresh handler | Updated `impersonation_sessions` row |
| 5 | **Session expired** | `POST /api/auth/refresh` (token verify fails) | `endedAt`, `durationSeconds`, `status: 'EXPIRED'` | Refresh handler | Updated `impersonation_sessions` row |
| 6 | **Refresh continued impersonation** | `POST /api/auth/refresh` (valid session) | N/A (session still active) | Refresh handler | No change — session remains ACTIVE |
| 7 | **Session info requested** | `GET /api/admin/impersonate/session-info` | N/A (read-only) | Session-info handler | No change |

### 19.2 Metadata Object

When a session ends via refresh fallback, the `metadata` JSON field captures the reason:

```json
// Example: admin was demoted
{ "reason": "admin_demoted", "actualRole": "FACULTY" }

// Example: target user was deleted
{ "reason": "target_deleted" }

// Example: target user was deactivated
{ "reason": "target_inactive" }

// Example: admin account was deleted
{ "reason": "admin_deleted" }
```

### 19.3 Database Cleanup Policies

| Operation | Policy |
|---|---|
| Row deletion | NEVER. `impersonation_sessions` is append-only. |
| Row update | Only `status`, `endedAt`, `durationSeconds`, `metadata` fields. |
| Foreign key behavior | `onDelete: SetNull` — preserves audit trail when users are deleted. |
| Archival | No automatic archival. Future: job to move records > 1 year old. |
| Retention | Indefinite. No automatic deletion. |

### 19.4 Audit Query Examples

**Active impersonations:**
```sql
SELECT * FROM impersonation_sessions WHERE status = 'ACTIVE';
```

**All impersonations by an admin:**
```sql
SELECT * FROM impersonation_sessions
WHERE adminId = 1
ORDER BY startedAt DESC;
```

**Total impersonation time per admin:**
```sql
SELECT adminId, SUM(durationSeconds) as totalSeconds
FROM impersonation_sessions
WHERE status IN ('ENDED', 'EXPIRED')
GROUP BY adminId
ORDER BY totalSeconds DESC;
```

---

## 20. UI Design

### 20.1 Admin Panel — Search Section

**Location:** CoE Main admin panel (`/admin`), inserted as a new section before the existing stats/booking sections.

**Layout:**

```
┌────────────────────────────────────────────────────────────┐
│  🔍 Impersonate a User                                    │
│  ┌────────────────────────────────────────────┐            │
│  │  Search by name, email, or UID...          │ 🔍         │
│  └────────────────────────────────────────────┘            │
│                                                             │
│  Results:                                                   │
│  ┌────────┬──────────┬────────┬────────┬────────┬────────┐ │
│  │ Name   │ Email    │ Role   │ UID    │ Status │ Action │ │
│  ├────────┼──────────┼────────┼────────┼────────┼────────┤ │
│  │ Rahul  │ rahul... │ STUDENT│23CMP001│ ACTIVE │[Impers]│ │
│  │ Shah   │          │        │        │        │ onate] │ │
│  └────────┴──────────┴────────┴────────┴────────┴────────┘ │
│                                                             │
│  Active Sessions:                                           │
│  ┌──────────┬──────────┬──────────────────┐                 │
│  │ Target   │ Started  │ Actions          │                 │
│  ├──────────┼──────────┼──────────────────┤                 │
│  │ Rahul    │ 10:00 AM │ [Stop]           │                 │
│  │ Shah     │          │                  │                 │
│  └──────────┴──────────┴──────────────────┘                 │
└────────────────────────────────────────────────────────────┘
```

### 20.2 Confirmation Modal

Before impersonation starts, a confirmation dialog appears:

```
╔════════════════════════════════════════════╗
║  ⚠ Confirm Impersonation                  ║
║                                            ║
║  You are about to impersonate:             ║
║                                            ║
║  Rahul Shah                                ║
║  rahul.shah@tcetcercd.in                   ║
║  STUDENT | UID: 23CMP001                   ║
║                                            ║
║  All actions will be audited and logged.   ║
║  You will see the dashboard as this user.  ║
║                                            ║
║  [Cancel]  [Confirm & Impersonate]         ║
╚════════════════════════════════════════════╝
```

- **"Confirm & Impersonate" button:** Red/destructive styling
- **"Cancel" button:** Default/neutral
- **Modal cannot be dismissed** by clicking outside (forces conscious decision)

### 20.3 Persistent Impersonation Banner — Complete Spec

**Appearance condition:** `isImpersonating === true` (detected from JWT or header).

**Disappearance condition:** `isImpersonating` becomes falsy (impersonation stopped, admin restored, or session ended).

**Position:**
- **Desktop:** Fixed at the very top of the viewport (`position: fixed; top: 0; left: 0; right: 0; z-index: 9999`). Pushes all page content down by its height.
- **Mobile:** Same fixed position, adapted for smaller screens.

**Visual specification:**
```
┌──────────────────────────────────────────────────────────────┐
│ ⚠  You are impersonating:  Rahul Shah · 23CMP001 · Student  │
│     Original session: Dr. Admin (admin@tcetcercd.in)         │
│                                        [Stop Impersonating]  │
└──────────────────────────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Background color | `bg-amber-50` (`#FFFBEB`) |
| Border | `border-b border-amber-400` (`#FBBF24`) |
| Text color | `text-amber-900` (`#78350F`) |
| Font size | `text-sm` (14px) |
| Padding | `px-4 py-2.5` (desktop), `px-3 py-2` (mobile) |
| Icon | ⚠ (unicode warning sign) — or a Material Symbol `warning` |
| Layout | Flexbox row: icon | text | spacer | button |
| "Stop" button | `bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-medium` |
| "Stop" button cursor | `pointer` |
| Z-index | `z-50` or higher (must be above navbar) |

**Responsive behaviour:**
- **Desktop (>768px):** Full-width banner. Admin name, target name, role, UID all visible in a single row.
- **Mobile (≤768px):** Stacked layout. Target info on one line, "Original session" on next line. "Stop" button remains visible.
- **Touch:** Button must have minimum 44×44px tap target.

**Dismiss behaviour:**
- Banner **cannot be dismissed** (no X button). The only way to remove it is to click "Stop Impersonating".
- This is deliberate — the admin must always be aware they are impersonating.

### 20.4 CoE Main Banner Data Flow

```
Root Layout (src/app/layout.tsx)
  → Read accessToken cookie
  → verifyAccessToken(token)
  → If payload.isImpersonating:
      → query: prisma.impersonationSession.findUnique({
          where: { id: payload.impersonation.sessionId },
          include: { admin: { select: { name, email } } }
        })
      → pass { sessionId, impersonatedBy: { name, email }, impersonatingAs: { name, email, role, uid } }
        to ImpersonationBanner component
  → Pass to <ImpersonationBanner /> (client component)
  → <ImpersonationBanner /> handles "Stop" click → calls POST /api/admin/impersonate/stop
  → On success → window.location.href = "/admin"
```

### 20.5 Project Dashboard Banner Data Flow

```
Dashboard Layout (project-dashboard/src/app/(dashboard)/layout.tsx)
  → Read x-coe-impersonating header via headers()
  → If "true":
      → Fetch GET https://tcetcercd.in/api/admin/impersonate/session-info
        (uses coe_shared_token cookie automatically)
      → Pass banner data to <ImpersonationBanner />
  → <ImpersonationBanner /> handles "Stop" click → calls
    POST https://tcetcercd.in/api/admin/impersonate/stop
    (uses coe_shared_token cookie automatically)
  → On success → window.location.href = "https://tcetcercd.in/admin"
```

### 20.6 Navbar Changes (CoE Main)

**File:** `src/components/Navbar.tsx`

When the user prop contains `isImpersonating: true`:

- Show a small **"IMPERSONATING"** badge next to the user avatar/name (red text, small font, uppercase)
- The user's name and role displayed are the **target user's** (already handled since layout passes target user data)
- No changes to logout button text (logout still ends impersonation as a side effect)

**Passing `isImpersonating` to Navbar:**
- Update `src/app/layout.tsx` to decode `isImpersonating` from the access token
- Pass `{ name, email, role, uid, isImpersonating }` to Navbar (extend the existing user object type)

### 20.7 Navbar Changes (Project Dashboard)

When impersonating:
- Sidebar and Topbar already show the target user's role-based navigation (no changes needed — the user resolved from headers is the target user)
- The role label in the sidebar footer shows the target user's role

---

## 21. Project Dashboard Behaviour

### 21.1 Impersonation Detection

The Dashboard detects impersonation via the `x-coe-impersonating` header injected by middleware.

**Detection chain:**

```
Browser request (coe_shared_token cookie set to impersonation token)
  → middleware.ts reads cookie
  → verifyCoEToken() succeeds, returns CoeTokenPayload with isImpersonating: true
  → Middleware injects x-coe-impersonating: "true"
  → Dashboard layout reads headers() → x-coe-impersonating is "true"
  → Layout fetches session info from CoE Main API
  → Layout renders ImpersonationBanner
```

### 21.2 Banner Display

See [Section 20.5](#205-project-dashboard-banner-data-flow) for the banner data flow.

### 21.3 Admin Restoration

See [Section 10.2](#102-how-impersonation-ends-stop) for stop flow, and [Section 11 — Session Restoration](#11-session-restoration) for all failure paths.

### 21.4 Session Refresh

The Dashboard does NOT handle token refresh. Refresh is handled by CoE Main's `POST /api/auth/refresh` endpoint, which the browser calls automatically when the access token expires. The shared token is also refreshed during this call.

### 21.5 Logout from Dashboard During Impersonation

The Dashboard's existing logout flow redirects to `https://tcetcercd.in/logout?callbackUrl=...`. CoE Main's GET `/logout` handler (updated per Section 13.2) will:

1. Read the accessToken cookie from the request (sent by the browser because callbackUrl is on the tcetcercd.in domain)
2. Decode to check `isImpersonating`
3. Close the impersonation session
4. Clear all 3 cookies
5. Redirect back to the Dashboard's callback Url

### 21.6 Session Info API Call from Dashboard

The Dashboard's ImpersonationBanner component fetches session info from:

```
GET https://tcetcercd.in/api/admin/impersonate/session-info
```

**This request includes the `coe_shared_token` cookie automatically** (because the cookie has `domain: '.tcetcercd.in'`). No additional auth headers needed.

**Error handling:** If the API call fails (network error, server error, or the impersonation session has ended), the banner should hide itself and optionally show a "Session expired" message.

### 21.7 Role-Based Access During Impersonation

The Dashboard's role-based layouts (`admin/layout.tsx`, `teacher/layout.tsx`, `student/layout.tsx`) redirect based on the resolved user's role. Since the resolved user during impersonation is the target user, the admin will see the target user's dashboard layout.

**Example:** Admin impersonating a student:
- `resolveUserFromHeaders()` resolves the target student
- `student/layout.tsx` checks `user.role !== "STUDENT"` → passes (role IS STUDENT)
- Admin sees the student dashboard with an impersonation banner at the top

---

## 22. Notifications

### Decision: No User Notification

**Rationale:**
1. **Audit-only is sufficient.** The `ImpersonationSession` table creates a complete audit trail.
2. **Notification introduces complexity** — non-functional email, Google-only users, short sessions.
3. **Legitimate use cases** (debugging, support) don't need to alert the user.
4. **Future enhancement:** A separate job could scan `ImpersonationSession` records and send notifications.

**Recommendation:** Audit only. No notification to the impersonated user.

---

## 23. Edge Cases

### 23.1 Admin Impersonates Another Admin

**Product decision: ALLOW.**

**Rationale:** A super-admin may need to debug another admin's configuration or view their dashboard. The audit trail clearly records who impersonated whom.

**Behaviour:** The impersonating admin gets `role: "ADMIN"` with the target admin's identity. Both admins retain admin permissions. The impersonation banner shows which admin is being impersonated.

### 23.2 Admin Impersonates Faculty

**Behaviour:** Admin's role becomes `FACULTY`. Faculty permissions apply. Admin cannot access admin panel while impersonating. Banner shows the faculty identity.

### 23.3 Admin Impersonates Student

**Behaviour:** Admin's role becomes `STUDENT`. Student permissions apply. Admin sees the student dashboard in both CoE Main and Project Dashboard.

### 23.4 Multiple Browser Tabs

**Behaviour:** All tabs share the same cookies. Starting impersonation in one tab → all tabs see impersonation. Stopping in one tab → all tabs see admin identity restored.

**No special handling needed** — this is default cookie-based behaviour.

### 23.5 Admin Opens 20 Tabs During Impersonation

**Behaviour:** All 20 tabs share the same impersonation cookies. Each tab independently renders the impersonated UI. Stopping in any one tab ends it for all 20. No performance concerns.

### 23.6 Admin Starts Impersonation, Then Logs In Elsewhere

**Behaviour:** The admin can only have one active browser session at a time (cookie-based). If they log in on another device, that device gets normal admin cookies. The first device still has impersonation cookies until refresh. On refresh, the fallback path detects the session is still ACTIVE and continues impersonation (admin didn't stop impersonation — they just logged in elsewhere).

**Implication:** An admin can be logged in normally on Device B while impersonating on Device A. This is acceptable — the audit trail tracks both sessions independently.

### 23.7 Cookies Manually Deleted

**Behaviour:** The user is redirected to login on next request. If the `ImpersonationSession` was ACTIVE, it remains ACTIVE in the DB until the refresh token expires (7 days) and someone attempts a refresh, or until an admin manually ends it from the admin panel.

**Mitigation:** The admin panel's "Active Sessions" section allows admins to forcefully end stale sessions.

### 23.8 Browser Restart During Impersonation

**Behaviour:** If the browser preserves session cookies (default for non-incognito), impersonation continues. If cookies are cleared (browser settings), same as 23.7.

### 23.9 Incognito Mode

**Behaviour:** Cookies are not preserved after the incognito window closes. Same as 23.8.

### 23.10 Dashboard Opened Before Cookies Updated

**Scenario:** Admin starts impersonation in CoE Main (cookie set), then immediately opens a Dashboard tab before the cookie fully propagates.

**Behaviour:** The Dashboard middleware reads `coe_shared_token`. If the cookie is present, impersonation works. If not (race condition), the middleware redirects to CoE Main login. The admin already has valid cookies on CoE Main, so they'd be redirected back. This is a non-issue for subdomain cookies — they propagate to all subdomains immediately.

### 23.11 Network Interruption During Stop

**Scenario:** Admin clicks "Stop Impersonating" but the API call fails (network error).

**Behaviour:** The frontend should:
1. Show an error toast: "Failed to stop impersonation. Please try again."
2. Keep the banner visible
3. Allow retry

**Recovery:** Admin can refresh the page (impersonation continues — cookies still have impersonation tokens) and try again.

### 23.12 Double-Click "Impersonate"

**Behaviour:** First click succeeds. Second click triggers a second POST request. The application-level check (section 9.2) catches it — returns 400 "You already have an active impersonation session." Frontend should disable the button after first click to prevent this.

### 23.13 Double-Click "Stop Impersonating"

**Behaviour:** First call succeeds (session ended, cookies overwritten). Second call's token no longer has `isImpersonating: true` (cookies now have admin tokens) → returns 400 "Not currently impersonating." No harm done.

### 23.14 Rapid Refresh Requests During Impersonation

**Behaviour:** Multiple concurrent refresh requests race to update cookies. The last one wins. No data corruption — the refresh handler is idempotent (it generates fresh tokens from the same session).

### 23.15 Concurrent Refresh + Stop

**Scenario:** Admin clicks "Stop Impersonating" at the same time as an automatic refresh.

**Behaviour:** 
1. One handler ends the session (ENDED) and sets admin cookies.
2. The other handler (refresh) reads the old impersonation refresh token, looks up the session, finds it's not ACTIVE, and falls back to admin tokens.
3. Both handlers ultimately restore admin identity. No inconsistency.

---

## 24. Failure Scenarios

### 24.1 Target User Deleted During Impersonation

**Impact:** Next token refresh detects target not found. Falls back to admin identity. Session ended with reason `"target_deleted"`.

**User experience during the window between deletion and refresh:** Impersonation continues until the access token expires (up to 8 hours). On next automatic refresh, admin is restored.

### 24.2 Admin User Deleted During Impersonation

**Impact:** Next token refresh detects admin not found. Falls back by clearing cookies (no admin to restore). Session ended with reason `"admin_deleted"`.

**User experience:** Brownser redirects to login page. Admin can no longer log in (account deleted).

### 24.3 Admin Role Changed (Demoted) During Impersonation

**Impact:** Next token refresh detects admin role is no longer ADMIN. Falls back to issuing tokens with the admin's current role (whatever it now is). Session ended with reason `"admin_demoted"`.

**User experience:** Impersonation ends. Admin sees the UI for whatever role their account now has on the next reload.

### 24.4 Target User Status Changed (Disabled/Rejected/Pending) During Impersonation

**Impact:** Next token refresh detects target status !== 'ACTIVE'. Falls back to admin identity. Session ended with reason `"target_inactive"`.

**User experience:** Admin restored. The impersonation session ends cleanly.

### 24.5 Impersonation Session Missing (Row Deleted from DB)

**Impact:** Next token refresh (or stop call) queries session by `sessionId` and finds nothing. Falls back to admin identity.

**Note:** This should never happen (table is append-only), but the code handles it defensively.

### 24.6 Database Unavailable

**Impact:** All impersonation API calls fail:
- Start → 500 error
- Stop → 500 error
- Refresh → 401 "Invalid or expired refresh token" (or 500)
- Session info → 500 error

**Mitigation:** The frontend should show appropriate error messages. Authentication still works (existing tokens are valid until expiry). The impersonation session continues until the access token expires.

### 24.7 JWT Corrupted

**Impact:** `verifyAccessToken()` throws. `authenticate()` returns null. User redirected to login.

**Recovery:** User logs in again. If they were impersonating, the session is orphaned (no way to detect impersonation from a corrupted token). The admin panel's "Active Sessions" section allows manual cleanup.

### 24.8 Expired Refresh Token During Impersonation

**Impact:** `verifyRefreshToken()` throws. Handler returns 401. Browser redirects to login page. On login, the admin logs in normally (not impersonating). The session remains ACTIVE in the DB until an admin manually ends it.

**Mitigation:** A cron job could periodically expire sessions whose refresh token TTL has elapsed.

### 24.9 Clock Skew

**Impact:** JWT `exp` check may fail if server clock is wrong. The existing `jsonwebtoken` library may have clock tolerance options.

**Mitigation:** Use the same `jsonwebtoken` configuration as existing tokens. If clock skew is a known issue, add `clockTolerance: 30` to JWT verify options.

### 24.10 Invalid Cookies

**Impact:** Any request with invalid/non-existent cookies is handled by existing auth flows (redirect to login). No special handling needed.

### 24.11 Dashboard Unavailable (From CoE Main)

**Impact:** No impact on impersonation. The Dashboard is a separate application. Impersonation works entirely through CoE Main's auth infrastructure.

### 24.12 CoE Main Unavailable (From Dashboard)

**Impact:** The Dashboard middleware cannot verify the shared token (relies on `COE_JWT_SECRET` which doesn't require network access). However, the `session-info` API call and the `stop` API call will fail.

**User experience:** The impersonation banner can't fetch admin/target names. The "Stop Impersonating" button can't call the CoE Main API.

**Mitigation:** The banner should handle API failures gracefully:
- Show minimal banner: "Impersonating. Unable to load session details."
- "Stop Impersonating" button shows error toast on failure. User must try again later.

---

## 25. Security Review

### 25.1 Privilege Escalation

**Risk:** Non-admin gains impersonation capabilities.

**Mitigations:**
- `POST /api/admin/impersonate/start` requires `authorize(user, 'ADMIN')` — only existing admins can start
- All impersonation is logged with admin identity
- Refresh handler re-validates admin role on every refresh
- If admin is demoted, impersonation ends on next refresh

### 25.2 Token Forgery

**Risk:** Attacker forges impersonation claims in a JWT.

**Mitigations:**
- Same `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — same cryptographic strength
- `isImpersonating` is signed like any other claim — cannot be added without the secret

### 25.3 CSRF

**Risk:** Cross-site request forgery on impersonation endpoints.

**Mitigations:**
- All cookies use `sameSite: 'lax'`
- Impersonation API is `POST` only — no GET-based CSRF
- Existing CSRF protections apply

### 25.4 Replay Attacks

**Risk:** Impersonation token intercepted and replayed.

**Mitigations:**
- Access token TTL: 8 hours (same as normal tokens)
- Refresh token TTL: 7 days (same as normal tokens)
- No new token types = no new replay surface

### 25.5 Refresh Token Theft

**Risk:** Stolen refresh token enables indefinite impersonation.

**Mitigations:**
- Refresh handler validates session is still ACTIVE, admin still ADMIN, target still ACTIVE — on every refresh
- Session ended on any validation failure
- Refresh token is httpOnly — not accessible to JavaScript

### 25.6 Cookie Security

**Risk:** Cookie theft via XSS or network interception.

**Mitigations:**
- httpOnly: true — not accessible to JavaScript
- secure: true in production — HTTPS only
- sameSite: 'lax' — CSRF protection
- Domain: `.tcetcercd.in` — scoped to trusted domain

### 25.7 Audit Integrity

**Risk:** Attackers modify or delete audit records.

**Mitigations:**
- `impersonation_sessions` is append-only (no DELETE in API code)
- Only `status`, `endedAt`, `durationSeconds`, `metadata` can be updated
- `onDelete: SetNull` preserves audit trail when users are deleted
- DB permissions should restrict DELETE and non-status UPDATE

### 25.8 Self-Impersonation

**Risk:** Admin impersonates themselves (no-op with audit noise).

**Mitigation:** `start` handler explicitly checks `targetId !== adminId` → 400.

### 25.9 Hidden Backdoor Prevention

**Risk:** Code path checks `isImpersonating` to grant admin privileges during impersonation.

**Mitigation:** Strict code review rule: `isImpersonating` and `impersonation` must never appear in authorization logic. Only UI components and session management code may read these fields.

---

## 26. Testing Strategy

### 26.1 Unit Tests

| Test Suite | File | Tests |
|---|---|---|
| JWT helpers | `src/lib/jwt.test.ts` | `buildImpersonationAccessTokenPayload()` produces correct payload. Payload has `isImpersonating: true` and `impersonation.sessionId`. Existing tokens (no impersonation) are backward compatible. |
| Shared token | `src/lib/shared-auth.test.ts` | `buildSharedTokenPayload()` with impersonation produces correct payload. Role mapping still works with impersonation. Existing usage (no impersonation) unchanged. |
| API helpers | `src/lib/api-helpers.test.ts` | `authenticate()` with impersonation token returns target user's role. `authorize()` with impersonation token checks target user's role. `authorize()` returns false for 'ADMIN' when impersonating a student. |

### 26.2 Integration Tests

| Test | Route | What to Verify |
|---|---|---|
| Start (happy path) | `POST /api/admin/impersonate/start` | 200. Cookies set. Session created in DB. |
| Start (unauthenticated) | `POST /api/admin/impersonate/start` | 401. |
| Start (not admin) | `POST /api/admin/impersonate/start` (as FACULTY) | 403. |
| Start (self) | `POST /api/admin/impersonate/start` with self ID | 400. |
| Start (inactive target) | `POST /api/admin/impersonate/start` with PENDING user | 400. |
| Start (duplicate) | Start twice in quick succession | Second returns 400 or 409. |
| Stop (happy path) | `POST /api/admin/impersonate/stop` | 200. Session ENDED. Admin tokens restored. |
| Stop (not impersonating) | `POST /api/admin/impersonate/stop` (normal token) | 400. |
| Stop (invalid session) | Stop with corrupted sessionId | 400. |
| Refresh (normal) | `POST /api/auth/refresh` | Works unchanged. |
| Refresh (impersonating) | `POST /api/auth/refresh` during impersonation | New impersonation tokens. Session still ACTIVE. |
| Refresh (admin demoted) | Demote admin → refresh | Falls back to current role (not necessarily ADMIN). Session ENDED. |
| Refresh (target deleted) | Delete target → refresh | Falls back to admin. Session ENDED. |
| Logout (impersonating) | `POST /api/auth/logout` | Session ENDED. Cookies cleared. |
| Logout (normal) | `POST /api/auth/logout` | Works unchanged. Session unaffected. |
| Search | `GET /api/admin/impersonate/search?q=rahul` | Matching results. Pagination works. |
| Session info | `GET /api/admin/impersonate/session-info` | Returns correct admin/target data. |
| Active sessions | `GET /api/admin/impersonate/sessions` | Lists active sessions for current admin. |

### 26.3 End-to-End Tests

| Scenario | Steps | Expected Outcome |
|---|---|---|
| Full cycle (CoE Main) | 1. Login as ADMIN. 2. Navigate to /admin. 3. Search "Rahul". 4. Click Impersonate. 5. Confirm. 6. Page reloads. 7. Navigate to /student. 8. Click "Stop Impersonating". 9. Redirected to /admin. | Target student UI visible. Banner persists until stopped. Admin UI restored after stop. |
| Full cycle (Dashboard) | 1. Login as ADMIN. 2. Impersonate student. 3. Navigate to Dashboard. 4. See student projects. 5. Click "Stop Impersonating". 6. Redirected to CoE Main /admin. | Dashboard shows student content. Banner visible. Admin restored after stop. |
| Refresh during impersonation | 1. Set JWT_ACCESS_TTL_SECONDS=60. 2. Login as ADMIN. 3. Impersonate student. 4. Wait 60 seconds. 5. Navigate to new page. | Page loads normally (refresh happened automatically). Impersonation continues. |
| Logout during impersonation | 1. Impersonate student. 2. Click Sign Out. | Session ENDED in DB. Redirected to login. Login as admin — normal admin UI. |
| Network failure on stop | 1. Impersonate student. 2. Disconnect network. 3. Click "Stop Impersonating". | Error toast shown. Banner persists. Reconnect → retry → works. |

### 26.4 Security Tests

| Test | What to Verify | Expected |
|---|---|---|
| Non-admin start | FACULTY calls start | 403 |
| Student calls start | STUDENT calls start | 403 |
| Impersonation authorization | Impersonating student tries admin API | 403 (authorize returns false) |
| Token forgery | Modify `isImpersonating` in JWT | verifyAccessToken throws |
| CSRF | POST from external origin | Cookie not sent (sameSite lax) |
| Session injection | Start with non-existent adminId | DB constraint or validation error |

### 26.5 Concurrency Tests

| Test | What to Verify |
|---|---|
| Two simultaneous starts (same admin) | One succeeds, one gets 409 (DB unique constraint) |
| Stop + refresh simultaneous | Both paths end with admin restored |
| Two simultaneous stops | First succeeds, second gets 400 |

### 26.6 Manual QA Checklist

- [ ] Admin can search and find any ACTIVE user
- [ ] Search excludes inactive, rejected, pending users
- [ ] Search excludes INDUSTRY_PARTNER users
- [ ] Search excludes the admin themselves
- [ ] Impersonation banner appears immediately after start
- [ ] Banner shows correct target and admin names
- [ ] Banner persists across page navigations
- [ ] "Stop Impersonating" ends session and restores admin
- [ ] Admin cannot access admin panel while impersonating a student/faculty
- [ ] Admin can access admin panel while impersonating another admin
- [ ] Dashboard banner appears and functions identically
- [ ] Token refresh does not end impersonation
- [ ] Logout ends impersonation session
- [ ] All audit records are created correctly
- [ ] Multiple tabs share impersonation state
- [ ] Stopping from any tab ends for all tabs
- [ ] Double-click "Impersonate" does not create duplicate sessions
- [ ] Double-click "Stop" does not cause errors

### 26.7 Performance Tests

| Test | Threshold |
|---|---|
| Search response time (1000 users) | < 500ms |
| Start response time | < 200ms |
| Stop response time | < 200ms |
| Session info response time | < 100ms |
| Banner fetch from Dashboard | < 300ms |

---

## 27. Implementation Sequence

### 27.1 Recommended Order (Minimizes Merge Conflicts)

**Dependency chain (visual):**
```
Database ──► JWT ──► Shared Token ──► API Routes ──► Auth Routes ──► UI ──► Dashboard Backend ──► Dashboard UI ──► Testing
   │                 │                    │              │                                          │
   └── No deps ──────┘                    │              │                                          │
                                         └── depends     └── depends                                │
                                              on DB+JWT      on API routes                          │
                                                                                                    │
                                                     Dashboard backend ─────────────────────────────┘
                                                     has no deps on CoE Main UI
```

**Phase breakdown:**

```
Phase 1: Database (no code dependencies)
  1. prisma/schema.prisma — add ImpersonationSession model + ImpersonationStatus enum
  2. Run migration + partial unique index SQL

Phase 2: JWT + Shared Token (no route dependencies)
  3. src/lib/jwt.ts — add impersonation types + buildImpersonationAccessTokenPayload()
  4. src/lib/shared-auth.ts — update buildSharedTokenPayload() for optional impersonation

Phase 3: API Routes (depend on Phase 1 + 2)
  5. src/app/api/admin/impersonate/search/route.ts — search endpoint
  6. src/app/api/admin/impersonate/start/route.ts — start endpoint
  7. src/app/api/admin/impersonate/stop/route.ts — stop endpoint
  8. src/app/api/admin/impersonate/session-info/route.ts — session info endpoint
  9. src/app/api/admin/impersonate/sessions/route.ts — active sessions endpoint

Phase 4: Existing Route Modifications (depend on Phase 2)
  10. src/lib/validators.ts — add impersonateStartSchema
  11. src/app/api/auth/refresh/route.ts — impersonation-aware refresh
  12. src/app/api/auth/logout/route.ts — impersonation-aware logout

Phase 5: CoE Main UI (depend on Phase 3)
  13. src/components/ImpersonationBanner.tsx — persistent banner
  14. src/app/admin/AdminPanelClient.tsx — search + impersonate UI
  15. src/app/layout.tsx — detect impersonation, pass to banner
  16. src/components/Navbar.tsx — "IMPERSONATING" badge

Phase 6: Project Dashboard Backend (no dependencies on Phase 5)
  17. project-dashboard/src/lib/coe-auth.ts — update types + verifyCoEToken
  18. project-dashboard/src/middleware.ts — inject x-coe-impersonating header

Phase 7: Project Dashboard UI (depends on Phase 6)
  19. project-dashboard/src/components/ImpersonationBanner.tsx
  20. project-dashboard/src/app/(dashboard)/layout.tsx — detect impersonation
  21. project-dashboard/src/app/(dashboard)/DashboardShell.tsx — render banner

Phase 8: Testing (depends on all)
  22. Unit tests
  23. Integration tests
  24. E2E tests
  25. Security tests

Phase 9: QA + Deployment
  26. Manual QA checklist
  27. Deploy to staging
  28. Deploy to production
```

---

## 28. File-by-File Implementation Roadmap

### Phase 1: Database

---

#### File 1: `prisma/schema.prisma`

**Purpose:** Add the `ImpersonationSession` model and `ImpersonationStatus` enum.

**Changes:**
- Add `ImpersonationStatus` enum after existing enums
- Add `ImpersonationSession` model with all fields specified in Section 7.1

**Dependencies:** None.

**Files affected:** None (new model).

**Order:** 1.

---

### Phase 2: JWT + Shared Token

---

#### File 2: `src/lib/jwt.ts`

**Purpose:** Add impersonation types and token-building helper.

**Changes:**
- Add to existing imports: nothing new
- Extend `TokenPayload` interface:
  - Add optional `isImpersonating?: true`
  - Add optional `impersonation?: { sessionId: string }`
- Add new function:

```typescript
export function buildImpersonationAccessTokenPayload(
  targetUser: {
    id: number;
    role: string;
    name: string;
    email: string;
    uid?: string | null;
    industryId?: number | null;
  },
  sessionId: string
): TokenPayload
```

**Functions to modify:** None (additive).

**Functions to create:** `buildImpersonationAccessTokenPayload`.

**Dependencies:** None.

**Files affected:** None (exported for consumption by API routes).

**Order:** 2.

---

#### File 3: `src/lib/shared-auth.ts`

**Purpose:** Update `SharedTokenPayload` to carry optional impersonation metadata. Update `buildSharedTokenPayload` to accept optional impersonation parameter.

**Changes:**
- Extend `SharedTokenPayload` interface:
  - Add optional `isImpersonating?: true`
  - Add optional `impersonation?: { sessionId: string }`
- Modify `buildSharedTokenPayload` signature:

```typescript
export function buildSharedTokenPayload(
  user: {
    email: string;
    role: string;
    status: string;
    name?: string;
  },
  impersonation?: {
    sessionId: string;
  }
): SharedTokenPayload
```

- Inside `buildSharedTokenPayload`: add `...(impersonation && { isImpersonating: true, impersonation })` to the return object.

**Functions to modify:** `buildSharedTokenPayload`.

**Functions to create:** None.

**Dependencies:** None.

**Files affected:** `src/app/api/auth/login/route.ts`, `src/app/api/auth/register/google/route.ts`, `src/app/api/auth/verify-otp/route.ts`, `src/app/api/auth/refresh/route.ts` — all call `buildSharedTokenPayload`. These files do NOT need changes for the new parameter (it's optional — existing calls work unchanged).

**Order:** 3.

---

### Phase 3: API Routes

---

#### File 4: `src/lib/validators.ts`

**Purpose:** Add Zod schema for impersonation start request validation.

**Changes:**
- Add:

```typescript
export const impersonateStartSchema = z.object({
  targetId: z.number().int().positive("Target user ID is required."),
});
```

**Functions to create:** `impersonateStartSchema`.

**Dependencies:** None (Zod import only).

**Files affected:** None.

**Order:** 4.

---

#### File 5: `src/app/api/admin/impersonate/search/route.ts`

**Purpose:** User search endpoint for impersonation targeting.

**Changes:** NEW file.

**Imports needed:**
- `NextRequest`, `NextResponse` from `next/server`
- `authenticate`, `authorize`, `errorRes`, `successRes` from `@/lib/api-helpers`
- `prisma` from `@/lib/prisma`

**Functions:**
- `GET(req: NextRequest)` — search handler

**Auth:** `authenticate(req)` → must return ADMIN. `authorize(user, 'ADMIN')`.

**Logic:**
1. Parse `q`, `page`, `limit` from search params
2. If `!q || q.length < 1` → return empty results
3. Build `where` clause:
   - `OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { uid: { contains: q, mode: 'insensitive' } }]`
   - `status: 'ACTIVE'`
   - `role: { not: 'INDUSTRY_PARTNER' }` (industry partner is not supported by dashboard)
   - `id: { not: adminId }` (exclude self)
4. `findMany` with `skip`, `take`, `orderBy: { name: 'asc' }`
5. Return paginated results

**Dependencies:** Phase 1, File 2.

**Files affected:** None.

**Order:** 5.

---

#### File 6: `src/app/api/admin/impersonate/start/route.ts`

**Purpose:** Start impersonation session.

**Changes:** NEW file.

**Imports needed:**
- `NextRequest` from `next/server`
- `authenticate`, `authorize`, `errorRes`, `successRes`, `useSecureCookies` from `@/lib/api-helpers`
- `impersonateStartSchema` from `@/lib/validators`
- `generateAccessToken`, `generateRefreshToken`, `generateSharedToken`, `buildImpersonationAccessTokenPayload`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `SHARED_TOKEN_TTL_SECONDS` from `@/lib/jwt`
- `buildSharedTokenPayload`, `getSharedCookieOptions`, `SHARED_COOKIE_NAME` from `@/lib/shared-auth`
- `prisma` from `@/lib/prisma`
- `Prisma` from `@prisma/client` (for error code handling)

**Functions:**
- `POST(req: NextRequest)` — start handler

**Auth:** `authenticate(req)` → ADMIN. `authorize(user, 'ADMIN')`.

**Logic (per Section 10.1 and 10.6):**
1. Parse + validate body with `impersonateStartSchema`
2. **Check: caller's token has `isImpersonating`? → return 409 (nested impersonation forbidden)**
3. Query target user
4. Validate target exists, ACTIVE, not self
5. Check for existing active session (application-level)
6. Get IP and user agent from headers
7. **Prisma.$transaction: validate target + existing-check + create session (Section 10.7)**
8. **AFTER transaction commits:** Build impersonation tokens
9. Set all 3 cookies in order: accessToken → refreshToken → coe_shared_token
10. Return success

**Dependencies:** Phase 1, Files 2, 3, 4.

**Files affected:** None.

**Order:** 6.

---

#### File 7: `src/app/api/admin/impersonate/stop/route.ts`

**Purpose:** Stop impersonation session.

**Changes:** NEW file.

**Imports needed:**
- `NextRequest` from `next/server`
- `authenticate`, `errorRes`, `successRes`, `useSecureCookies` from `@/lib/api-helpers`
- `generateAccessToken`, `generateRefreshToken`, `generateSharedToken`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `SHARED_TOKEN_TTL_SECONDS` from `@/lib/jwt`
- `buildSharedTokenPayload`, `getSharedCookieOptions`, `SHARED_COOKIE_NAME` from `@/lib/shared-auth`
- `prisma` from `@/lib/prisma`

**Functions:**
- `POST(req: NextRequest)` — stop handler

**Auth:** `authenticate(req)` → must return payload with `isImpersonating === true`.

**Logic (per Section 10.2 and 10.3):**
1. Extract `sessionId` from `payload.impersonation.sessionId`
2. Look up session (ownership is implicit — sessionId was issued to this admin)
3. Validate session exists and status === 'ACTIVE'
4. Query admin user from `session.adminId` (the original admin)
5. Close session (status: 'ENDED', endedAt, durationSeconds)
6. If admin exists + ACTIVE: generate fresh tokens for their current role, set cookies
7. If admin not restorable (deleted or inactive): clear all 3 cookies
8. Return success

**Dependencies:** Phase 1, Files 2, 3.

**Files affected:** None.

**Order:** 7.

---

#### File 8: `src/app/api/admin/impersonate/session-info/route.ts`

**Purpose:** Return impersonation session metadata for the UI banner.

**Changes:** NEW file.

**Imports needed:**
- `NextRequest` from `next/server`
- `authenticate`, `errorRes`, `successRes` from `@/lib/api-helpers`
- `verifyCoEToken` from `@/lib/shared-auth` (or inline — must accept shared token for Dashboard callers)
- `prisma` from `@/lib/prisma`

**Functions:**
- `GET(req: NextRequest)` — session info handler

**Auth:** Accepts both accessToken (CoE Main) and coe_shared_token (Dashboard). See Section 17.3 for full auth precedence.

**Logic:**
1. Try `authenticate(req)` first → check `isImpersonating`
2. Fall back to `verifyCoEToken(req.cookies.get('coe_shared_token'))` → check `isImpersonating`
3. If neither works → return 400 "Not currently impersonating."
4. Extract `sessionId` from the found payload
5. Query session with `include: { admin: { select: { name, email } }, targetUser: { select: { name, email, role, uid } } }`
6. Validate session exists
7. Set `Cache-Control: no-store, must-revalidate` on response
8. Return admin + target info

**Dependencies:** Phase 1, File 2.

**Files affected:** None.

**Order:** 8.

---

#### File 9: `src/app/api/admin/impersonate/sessions/route.ts`

**Purpose:** List active impersonation sessions for the current admin.

**Changes:** NEW file.

**Imports needed:**
- `NextRequest` from `next/server`
- `authenticate`, `authorize`, `errorRes`, `successRes` from `@/lib/api-helpers`
- `prisma` from `@/lib/prisma`

**Functions:**
- `GET(req: NextRequest)` — active sessions handler

**Auth:** `authenticate(req)` → ADMIN. `authorize(user, 'ADMIN')`.

**Logic:**
1. Query sessions where `adminId: payload.id` and `status: 'ACTIVE'`
2. Include target user info
3. Return list

**Dependencies:** Phase 1, File 2.

**Files affected:** None.

**Order:** 9.

---

### Phase 4: Existing Route Modifications

---

#### File 10: `src/app/api/auth/refresh/route.ts`

**Purpose:** Add impersonation-aware refresh logic.

**Changes:** Modify the existing `POST` handler.

**Imports needed (new additions):**
- `buildImpersonationAccessTokenPayload` from `@/lib/jwt`
- `Prisma` from `@prisma/client`

**Functions to modify:** `POST(req: NextRequest)`.

**Modified logic (full decision tree per Section 12):**

```
1. Read refreshToken cookie. If missing → 401.
2. verifyRefreshToken(token). If invalid → 401.
3. Check payload.isImpersonating.
   a. FALSE → EXISTING FLOW (unchanged). Query user by payload.id. Generate normal tokens. Set cookies. Return.
   b. TRUE → IMPERSONATION FLOW:
      i. Extract sessionId.
      ii. Look up ImpersonationSession.
      iii. If session not ACTIVE → FALLBACK.
      iv. Query admin user from session.adminId.
      v. If admin not ACTIVE or not ADMIN → FALLBACK.
      vi. Query target user from session.targetUserId.
      vii. If target not ACTIVE → FALLBACK.
      viii. All valid → generate new impersonation tokens (same sessionId). Set cookies. Return.
      ix. FALLBACK: Close session. Try to restore admin. Generate admin tokens or clear cookies.
```

**New imports needed:** None (jwt module already imported).

**Dependencies:** Files 2, 3.

**Files affected:** None.

**Order:** 10.

---

#### File 11: `src/app/api/auth/logout/route.ts`

**Purpose:** Add impersonation session cleanup on logout.

**Changes:** Modify both `POST` and `GET` handlers.

**Imports needed (new additions):**
- `prisma` from `@/lib/prisma`

**Functions to modify:** `POST()`, `GET(request: NextRequest)`.

**Modified logic (per Section 13):**

For both POST and GET:
1. Try to read accessToken cookie
2. Try to decode with `verifyAccessToken()` (catch errors — non-fatal)
3. If `payload.isImpersonating`:
   a. Try to close session (catch errors — non-fatal)
4. Continue with existing cookie cleanup

**Note:** Session cleanup is best-effort. The primary goal of logout is to clear cookies.

**Dependencies:** File 2.

**Files affected:** None.

**Order:** 11.

---

### Phase 5: CoE Main UI

---

#### File 12: `src/components/ImpersonationBanner.tsx`

**Purpose:** Persistent impersonation banner for CoE Main.

**Changes:** NEW file.

**Props:**
```typescript
interface ImpersonationBannerProps {
  isImpersonating: boolean;
  impersonatedBy?: { name: string; email: string } | null;
  impersonatingAs?: { name: string; email: string; role: string; uid?: string | null } | null;
}
```

**State:**
- `isStopping: boolean` — disables button during API call
- `error: string | null` — error message if stop fails

**Functions:**
- `handleStop()` — calls `POST /api/admin/impersonate/stop`, on success sets `window.location.href = "/admin"`, on failure shows error toast

**Rendering:**
- If `!isImpersonating`: return `null`
- If `isImpersonating`: render yellow banner per Section 20.3

**Dependencies:** None (self-contained).

**Files affected:** None (imported by layout).

**Order:** 12.

---

#### File 13: `src/app/admin/AdminPanelClient.tsx`

**Purpose:** Add user search and impersonate UI to the admin panel.

**Changes:** Modify existing client component.

**New state:**
- `searchQuery: string`
- `searchResults: SearchResult[]`
- `isSearching: boolean`
- `showConfirmModal: boolean`
- `selectedTarget: SearchResult | null`
- `activeSessions: ActiveSession[]`

**New functions:**
- `handleSearch(query)` — debounced at 300ms, calls `GET /api/admin/impersonate/search?q=...`
- `handleImpersonate(user)` — opens confirmation modal
- `confirmImpersonation()` — calls `POST /api/admin/impersonate/start`, on success reloads page
- `fetchActiveSessions()` — calls `GET /api/admin/impersonate/sessions` on mount

**New sections (inserted at top of panel):**
1. Search bar with results table
2. Active sessions section

**Dependencies:** File 5 (search API), File 6 (start API), File 9 (sessions API).

**Files affected:** None (self-contained within component).

**Order:** 13.

---

#### File 14: `src/app/layout.tsx`

**Purpose:** Detect impersonation from access token and pass data to banner and navbar.

**Changes:** Modify existing `RootLayout`.

**Modified logic:**
After `verifyAccessToken(token)`:

```typescript
let impersonationData = null;
if (payload.isImpersonating && payload.impersonation?.sessionId) {
  try {
    const session = await prisma.impersonationSession.findUnique({
      where: { id: payload.impersonation.sessionId },
      include: {
        admin: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true, role: true, uid: true } },
      },
    });
    if (session) {
      impersonationData = {
        isImpersonating: true,
        impersonatedBy: session.admin ? { name: session.admin.name, email: session.admin.email } : null,
        impersonatingAs: session.targetUser
          ? { name: session.targetUser.name, email: session.targetUser.email, role: session.targetUser.role, uid: session.targetUser.uid }
          : null,
      };
    }
  } catch {
    // DB error — banner won't show, but UI still works
  }
}
```

Pass `impersonationData` to `<ImpersonationBanner />`. Pass `isImpersonating` to `<Navbar />` as part of the user object.

**Dependencies:** Files 2 (jwt), 12 (ImpersonationBanner).

**Files affected:** None (self-contained).

**Order:** 14.

---

#### File 15: `src/components/Navbar.tsx`

**Purpose:** Show "IMPERSONATING" badge when impersonating.

**Changes:** Minor — accept `isImpersonating` in user prop, show badge.

**Props modification:** Extend user object type to include optional `isImpersonating: boolean`.

**UI change:** Next to user name/avatar, if `isImpersonating`:
- Show `<span class="text-red-600 text-xs uppercase font-bold ml-2">IMPERSONATING</span>`

**Dependencies:** File 14 (layout passes the prop).

**Files affected:** None (self-contained).

**Order:** 15.

---

### Phase 6: Project Dashboard Backend

---

#### File 16: `project-dashboard/src/lib/coe-auth.ts`

**Purpose:** Update types and verification to support impersonation.

**Changes:**
- Add optional fields to `CoeTokenPayload`:

```typescript
isImpersonating?: true;
impersonation?: {
  sessionId: string;
};
```

- Update `verifyCoEToken()` to extract and return these fields.

**No verification logic changes** — `jwtVerify` already returns all claims. Only field extraction is added.

**Functions to modify:** `verifyCoEToken()`.

**Functions to create:** None.

**Dependencies:** None (self-contained type update).

**Files affected:** None.

**Order:** 16.

---

#### File 17: `project-dashboard/src/middleware.ts`

**Purpose:** Inject `x-coe-impersonating` header when impersonating.

**Changes:** Modify the production auth flow section (after `verifyCoEToken` succeeds).

**New code:**
```typescript
if (payload.isImpersonating) {
  requestHeaders.set("x-coe-impersonating", "true");
}
```

**No changes to dev bypass** (dev bypass doesn't need impersonation support).

**Dependencies:** File 16.

**Files affected:** None.

**Order:** 17.

---

### Phase 7: Project Dashboard UI

---

#### File 18: `project-dashboard/src/components/ImpersonationBanner.tsx`

**Purpose:** Persistent impersonation banner for Project Dashboard.

**Changes:** NEW file.

**Props:**
```typescript
interface ImpersonationBannerProps {
  isImpersonating: boolean;
  sessionInfo?: {
    sessionId: string;
    impersonatedBy: { name: string; email: string };
    impersonatingAs: { name: string; email: string; role: string; uid?: string };
  } | null;
}
```

**Behaviour (per Section 20.5):**
1. If `!isImpersonating`: return `null`
2. If `isImpersonating` but `sessionInfo` is null: show minimal banner "Impersonating. Loading details..."
3. If `isImpersonating` with `sessionInfo`: show full banner per Section 20.3
4. "Stop Impersonating" button calls `POST https://tcetcercd.in/api/admin/impersonate/stop`
5. On success: `window.location.href = "https://tcetcercd.in/admin"`

**Dependencies:** None (self-contained).

**Files affected:** None.

**Order:** 18.

---

#### File 19: `project-dashboard/src/app/(dashboard)/layout.tsx`

**Purpose:** Detect impersonation from headers and fetch session info.

**Changes:** Modify existing dashboard layout.

**Modified logic:**

```typescript
const requestHeaders = await headers();
const isImpersonating = requestHeaders.get("x-coe-impersonating") === "true";

let impersonationSessionInfo = null;
if (isImpersonating) {
  try {
    const response = await fetch("https://tcetcercd.in/api/admin/impersonate/session-info", {
      headers: { cookie: requestHeaders.get("cookie") || "" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const body = await response.json();
      impersonationSessionInfo = body.data;
    }
  } catch {
    // API unavailable — show minimal banner
  }
}
```

Pass `isImpersonating` and `impersonationSessionInfo` to `DashboardShell`.

**Dependencies:** Files 17, 18.

**Files affected:** None (self-contained within layout).

**Order:** 19.

---

#### File 20: `project-dashboard/src/app/(dashboard)/DashboardShell.tsx`

**Purpose:** Render ImpersonationBanner when impersonating.

**Changes:** Accept new props and render banner.

**Props addition:**
```typescript
isImpersonating: boolean;
impersonationSessionInfo?: { ... } | null;
```

**Rendering:**
- Add `<ImpersonationBanner isImpersonating={isImpersonating} sessionInfo={impersonationSessionInfo} />` at the top of the shell (before the existing layout structure).

**Dependencies:** File 18.

**Files affected:** None.

**Order:** 20.

---

## 29. Deployment Guide

### 29.1 Environment Changes

**CoE Main:** No new environment variables required.

**Project Dashboard:** No new environment variables required.

Both applications use existing secrets (`JWT_ACCESS_SECRET` / `COE_JWT_SECRET`, `JWT_REFRESH_SECRET`, `SYNC_SECRET`).

### 29.2 Migration

```bash
cd coe-main
npx prisma migrate dev --name add_impersonation_sessions
# Create separate migration for partial unique index
npx prisma migrate dev --name add_impersonation_session_active_unique --create-only
# Add raw SQL to the generated migration file
npx prisma migrate deploy
```

### 29.3 Rollout Steps

1. Deploy Phase 1 (database migration) to production — no application code changes yet.
2. Deploy Phases 2–4 (backend changes) — new API endpoints available but not yet exposed in UI.
3. Deploy Phase 5 (CoE Main UI) — impersonation feature becomes available.
4. Deploy Phase 6–7 (Dashboard changes) — dashboard impersonation support live.
5. Monitor for 48 hours — check for errors, audit trail correctness.
6. Announce feature to admin team.

### 29.4 Rollback Steps

**Code rollback:**
```bash
git revert HEAD --no-commit  # Revert all changes in a single commit
# Or selectively revert specific phases
```

**Database rollback:**
```bash
npx prisma migrate down

# Cleanup orphaned sessions first:
UPDATE impersonation_sessions SET status = 'ENDED', endedAt = NOW()
WHERE status = 'ACTIVE';
```

**Verification after rollback:**
- Login works normally
- Refresh works normally
- Logout works normally
- All existing tokens still valid
- Admin panel shows without search section
- Dashboard works without impersonation headers

---

## 30. Sequence Diagrams

### 30.1 Start Impersonation

```
ADMIN                     BROWSER                   API SERVER                    DATABASE               JWT
  │                          │                          │                            │                    │
  │  Click "Impersonate"     │                          │                            │                    │
  │─────────────────────────▶│                          │                            │                    │
  │                          │ POST /api/admin/         │                            │                    │
  │                          │ impersonate/start        │                            │                    │
  │                          │ { targetId: 42 }         │                            │                    │
  │                          │ Cookie: accessToken=...  │                            │                    │
  │                          │─────────────────────────▶│                            │                    │
  │                          │                          │                            │                    │
  │                          │                          │ authenticate(req)          │                    │
  │                          │                          │ verifyAccessToken(cookie)  │                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │ returns TokenPayload(ADMIN)│                    │
  │                          │                          │                            │                    │
  │                          │                          │ authorize(user, 'ADMIN')   │                    │
  │                          │                          │ → true                     │                    │
  │                          │                          │                            │                    │
  │                          │                          │ Prisma.$transaction        │                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │  Query target: User(id=42) │                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │  Validate: ACTIVE, not self│                    │
  │                          │                          │                            │                    │
  │                          │                          │  Check: no existing ACTIVE │                    │
  │                          │                          │  session for admin         │                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │                            │                    │
  │                          │                          │  INSERT ImpersonationSession│                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │  returns session record    │                    │
  │                          │                          │                            │                    │
  │                          │                          │◀ transaction commits ──────│                    │
  │                          │                          │                            │                    │
  │                          │                          │ buildImpersonationToken    │                    │
  │                          │                          │ generateAccessToken()      │                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │ generateRefreshToken()     │                    │
  │                          │                          │ generateSharedToken()      │                    │
  │                          │                          │                            │                    │
  │                          │                          │ Set cookies:               │                    │
  │                          │  Set-Cookie: accessToken  │  1. accessToken           │                    │
  │                          │◀─────────────────────────│  2. refreshToken          │                    │
  │                          │  Set-Cookie: refreshToken │  3. coe_shared_token     │                    │
  │                          │◀─────────────────────────│                            │                    │
  │                          │  Set-Cookie: coe_shared   │                            │                    │
  │                          │◀─────────────────────────│                            │                    │
  │                          │  { success: true }       │                            │                    │
  │                          │◀─────────────────────────│                            │                    │
  │                          │                            │                            │                    │
  │                          │ window.location.href = "/"│                            │                    │
  │                          │◀──────────────────────────│                            │                    │
  │                          │                            │                            │                    │
  │                          │ GET / (new impersonation)  │                            │                    │
  │                          │ Cookie: accessToken=...    │                            │                    │
  │                          │──────────────────────────▶│                            │                    │
  │                          │                            │ verifyAccessToken()       │                    │
  │                          │                            │ → role: STUDENT           │                    │
  │                          │                            │ → isImpersonating: true   │                    │
  │                          │                            │                            │                    │
  │  Target user page        │                            │                            │                    │
  │◀─────────────────────────│                            │                            │                    │
```

### 30.2 Stop Impersonation

```
ADMIN                     BROWSER                   API SERVER                    DATABASE               JWT
  │                          │                          │                            │                    │
  │  Click "Stop Im-         │                          │                            │                    │
  │  personating"            │                          │                            │                    │
  │─────────────────────────▶│                          │                            │                    │
  │                          │ POST /api/admin/         │                            │                    │
  │                          │ impersonate/stop         │                            │                    │
  │                          │ Cookie: accessToken=...  │                            │                    │
  │                          │ (has isImpersonating)    │                            │                    │
  │                          │─────────────────────────▶│                            │                    │
  │                          │                          │                            │                    │
  │                          │                          │ authenticate(req)          │                    │
  │                          │                          │ → isImpersonating: true    │                    │
  │                          │                          │                            │                    │
  │                          │                          │ Extract sessionId          │                    │
  │                          │                          │ from token                 │                    │
  │                          │                          │                            │                    │
  │                          │                          │ Query ImpersonationSession │                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │ Validates ACTIVE           │                    │
  │                          │                          │                            │                    │
  │                          │                          │ Query admin user           │                    │
  │                          │                          │ from session.adminId       │                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │ Admin exists + ACTIVE      │                    │
  │                          │                          │ Role: FACULTY (demoted)    │                    │
  │                          │                          │                            │                    │
  │                          │                          │ Close session:             │                    │
  │                          │                          │ UPDATE set status='ENDED'  │                    │
  │                          │                          │ endedAt=NOW(), duration    │                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │                            │                    │
  │                          │                          │ Generate tokens for admin  │                    │
  │                          │                          │ with CURRENT role (FACULTY)│                    │
  │                          │                          │───────────────────────────▶│                    │
  │                          │                          │◀───────────────────────────│                    │
  │                          │                          │                            │                    │
  │                          │  Set-Cookie: accessToken  │  1. accessToken (FACULTY) │                    │
  │                          │◀─────────────────────────│  2. refreshToken (FACULTY)│                    │
  │                          │  Set-Cookie: refreshToken │  3. coe_shared_token      │                    │
  │                          │◀─────────────────────────│     (FACULTY role)        │                    │
  │                          │  Set-Cookie: coe_shared   │                            │                    │
  │                          │◀─────────────────────────│                            │                    │
  │                          │  { success: true }       │                            │                    │
  │                          │◀─────────────────────────│                            │                    │
  │                          │                            │                            │                    │
  │                          │ window.location.href =    │                            │                    │
  │                          │ "/admin"                   │                            │                    │
  │                          │◀──────────────────────────│                            │                    │
  │                          │                            │                            │                    │
  │  Faculty UI (not admin)  │                            │                            │                    │
  │◀─────────────────────────│                            │                            │                    │
```

### 30.3 Token Refresh During Impersonation

```
BROWSER                   API SERVER                    DATABASE               JWT
  │                          │                            │                    │
  │ POST /api/auth/refresh   │                            │                    │
  │ Cookie: refreshToken=... │                            │                    │
  │ (has isImpersonating)    │                            │                    │
  │─────────────────────────▶│                            │                    │
  │                          │                            │                    │
  │                          │ verifyRefreshToken(token)  │                    │
  │                          │───────────────────────────▶│                    │
  │                          │◀───────────────────────────│                    │
  │                          │ returns TokenPayload       │                    │
  │                          │ isImpersonating: true      │                    │
  │                          │                            │                    │
  │                          │ Check: isImpersonating?    │                    │
  │                          │ → YES                     │                    │
  │                          │                            │                    │
  │                          │ Extract sessionId          │                    │
  │                          │                            │                    │
  │                          │ Query ImpersonationSession │                    │
  │                          │───────────────────────────▶│                    │
  │                          │◀───────────────────────────│                    │
  │                          │ status: ACTIVE → continue  │                    │
  │                          │                            │                    │
  │                          │ Query admin (session.      │                    │
  │                          │ adminId) → ACTIVE + ADMIN  │                    │
  │                          │───────────────────────────▶│                    │
  │                          │◀───────────────────────────│                    │
  │                          │                            │                    │
  │                          │ Query target (session.     │                    │
  │                          │ targetUserId) → ACTIVE     │                    │
  │                          │───────────────────────────▶│                    │
  │                          │◀───────────────────────────│                    │
  │                          │                            │                    │
  │                          │ Generate new impersonation │                    │
  │                          │ tokens (same sessionId)    │                    │
  │                          │───────────────────────────▶│                    │
  │                          │◀───────────────────────────│                    │
  │                          │                            │                    │
  │  Set-Cookie: accessToken  │                            │                    │
  │◀─────────────────────────│                            │                    │
  │  Set-Cookie: refreshToken │                            │                    │
  │◀─────────────────────────│                            │                    │
  │  Set-Cookie: coe_shared   │                            │                    │
  │◀─────────────────────────│                            │                    │
  │  { success: true }       │                            │                    │
  │◀─────────────────────────│                            │                    │
```

### 30.4 Dashboard Visit During Impersonation

```
BROWSER              DASHBOARD MIDDLEWARE        DASHBOARD LAYOUT          COE MAIN API
  │                          │                        │                       │
  │ GET /admin/projects      │                        │                       │
  │ Cookie: coe_shared_token │                        │                       │
  │ (impersonation token)    │                        │                       │
  │─────────────────────────▶│                        │                       │
  │                          │                        │                       │
  │                          │ verifyCoEToken(cookie) │                       │
  │                          │ → isImpersonating: true│                       │
  │                          │                        │                       │
  │                          │ Inject headers:        │                       │
  │                          │ x-coe-email: target    │                       │
  │                          │ x-coe-role: STUDENT    │                       │
  │                          │ x-coe-impersonating:   │                       │
  │                          │   "true"               │                       │
  │                          │                        │                       │
  │                          │ NextResponse.next()    │                       │
  │◀─────────────────────────│                        │                       │
  │                          │                        │                       │
  │                          │                        │ Read headers()        │
  │                          │                        │ → x-coe-impersonating │
  │                          │                        │   === "true"          │
  │                          │                        │                       │
  │                          │                        │ FETCH /api/admin/     │
  │                          │                        │ impersonate/          │
  │                          │                        │ session-info          │
  │                          │                        │──────────────────────▶│
  │                          │                        │                       │
  │                          │                        │  Reads shared token   │
  │                          │                        │  from cookie → lookup │
  │                          │                        │  session → return     │
  │                          │                        │◀──────────────────────│
  │                          │                        │  { admin name,        │
  │                          │                        │    target name, ... } │
  │                          │                        │                       │
  │                          │                        │ Render banner with    │
  │                          │                        │ target user info      │
  │                          │                        │                       │
  │                          │                        │ resolveUserFromHeaders│
  │                          │                        │ → upserts target user │
  │                          │                        │ → role: STUDENT       │
  │                          │                        │                       │
  │                          │                        │ Render student layout │
  │                          │                        │ (role-based routing)  │
  │                          │                        │                       │
  │  Full dashboard page     │                        │                       │
  │  with student content    │                        │                       │
  │  + impersonation banner  │                        │                       │
  │◀─────────────────────────│                        │                       │
```

---

## Appendix A: DoD (Definition of Done)

- [ ] All JWT types updated with `isImpersonating` and `impersonation.sessionId`
- [ ] Old tokens (without impersonation fields) still work — backward compatible
- [ ] `POST /api/admin/impersonate/start` implemented and tested
- [ ] `POST /api/admin/impersonate/stop` implemented and tested
- [ ] `GET /api/admin/impersonate/search` implemented and tested (pagination, debounce, sorting)
- [ ] `GET /api/admin/impersonate/session-info` implemented and tested
- [ ] `GET /api/admin/impersonate/sessions` implemented and tested
- [ ] Refresh handler updated for impersonation tokens (full decision tree)
- [ ] Logout handler updated for impersonation session cleanup
- [ ] Database migration applied (table + partial unique index)
- [ ] Session uniqueness enforced at application + database level
- [ ] Dashboard middleware injects `x-coe-impersonating` header
- [ ] Dashboard `coe-auth.ts` types include impersonation fields
- [ ] Impersonation banner in CoE Main (Section 20.3 spec)
- [ ] Impersonation banner in Project Dashboard (Section 20.3 spec)
- [ ] Admin panel has user search UI with debounce, pagination, confirmation modal
- [ ] Session restoration handles all failure scenarios (Section 11.2)
- [ ] Refresh flow handles all branches (Section 12.1)
- [ ] Integration tests for all impersonation API routes
- [ ] Security tests for authorization boundaries
- [ ] Manual QA checklist completed
- [ ] Rollback plan documented and tested

---

*End of Implementation Specification (Frozen).*
